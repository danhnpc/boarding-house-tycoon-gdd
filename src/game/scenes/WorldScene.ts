// Game world scene (Phase 2 + camera view plan). Renders the boarding house
// from canonical GameState snapshots pushed in by React (react-phaser-bridge
// rule 8). The scene never writes rules; placeholder art policy: code-drawn
// shapes with stable asset keys from src/config/assets.ts (GDD 10).
// Camera interactions (camera-view-plan.md): left-drag pans, short left press
// selects, right-drag yaws in screen space, reset view returns to default.
// Pan/yaw are presentation-only state and never enter GameState.

import Phaser from 'phaser';
import { gameBridge } from '../bridge/gameBridge';
import {
  DRAG_THRESHOLD_PX,
  NEUTRAL_VIEW,
  ROOM_GRID,
  TILE_H,
  TILE_W,
  WALL_H,
  depthFor,
  pointInConvexPolygon,
  project,
  roomSilhouette,
  rotateAround,
  roomNumber,
  type ScreenPos,
  type ViewState,
} from '../world/layout';
import type { GameState, RoomLevel, RoomState, TenantArchetype } from '../../domain/types';

const FLOOR_FILL = 0x7ec850;
const ROOF_FILL = 0xd96c4f;
const ROOF_FILL_L2 = 0x4f96d9;
const ROOF_FILL_L3 = 0x9d6bd9;
const WALL_LEFT_FILL = 0x8b6b4a;
const WALL_RIGHT_FILL = 0xa58359;
const FLOOR_STROKE = 0x3d6e26;
const HIGHLIGHT = 0xffe28a;
/** How far hovered faces lift toward white (0 = unchanged, 1 = white). */
const HOVER_LIGHTEN = 0.22;
/** Yaw radians per screen pixel of horizontal right-drag (light feel). */
const YAW_RATE = Math.PI / 480;
/** Camera bounds margin around the content (pan clamp). */
const PAN_MARGIN = 480;

const LEVEL_ROOF: Record<RoomLevel, number> = {
  1: ROOF_FILL,
  2: ROOF_FILL_L2,
  3: ROOF_FILL_L3,
};

const MARKER_COLORS: Record<TenantArchetype, number> = {
  student: 0xf2c94c,
  office_worker: 0x2d9cdb,
  messy_tenant: 0x9b643d,
};

const v = (x: number, y: number): Phaser.Math.Vector2 => new Phaser.Math.Vector2(x, y);

/** Mix a 0xRRGGBB colour toward white by `amount` (0..1). */
function brighten(color: number, amount: number): number {
  const mix = (channel: number): number => Math.round(channel + (255 - channel) * amount);
  const r = mix((color >> 16) & 0xff);
  const g = mix((color >> 8) & 0xff);
  const b = mix(color & 0xff);
  return (r << 16) | (g << 8) | b;
}

interface HitShape {
  roomId: string;
  depth: number;
  polygon: ScreenPos[];
}

interface PressState {
  button: 'left' | 'right';
  startScreenX: number;
  startScreenY: number;
  lastScreenX: number;
  lastScreenY: number;
  dragging: boolean;
}

export class WorldScene extends Phaser.Scene {
  private roomGraphics = new Map<string, Phaser.GameObjects.Graphics>();
  private markers = new Map<string, Phaser.GameObjects.Arc>();
  private rooms = new Map<string, RoomState>();
  /** Click and hover areas, frontmost room first (see roomAt). */
  private hitShapes: HitShape[] = [];
  /** Selection and hover are visual-only state owned by the scene (skill rule 4). */
  private selectedRoomId: string | null = null;
  private hoveredRoomId: string | null = null;
  /** Camera view (plan §4.1): presentation-only, never saved. */
  private view: ViewState = { ...NEUTRAL_VIEW };
  /** Active drag (plan §4.4) or null between presses. */
  private press: PressState | null = null;
  private lastWorldKey = '';
  private contentCenter = v(0, 0);
  /** Set on shutdown: forwarded closures from a stopped scene must not write. */
  private shutDown = false;
  private unsubscribeViewReset: (() => void) | null = null;

  constructor() {
    super('WorldScene');
  }

  create(): void {
    this.shutDown = false;
    // Initial framing before any snapshot arrives; the world redraws on the
    // first forwarded store snapshot (within one tick).
    this.centerCameraOnContent();

    // Suppress the browser context menu over the canvas (plan §4.4) so the
    // right button is free for yaw.
    const canvas = this.game.canvas;
    const suppressMenu = (event: Event): void => {
      event.preventDefault();
    };
    canvas?.addEventListener('contextmenu', suppressMenu);

    // RESET_VIEW (plan step 5): React owns the button, the scene owns the view.
    this.unsubscribeViewReset = gameBridge.onGameCommand((command) => {
      if (command.type === 'RESET_VIEW') {
        this.resetView();
      }
    });

    // Scene-level hit testing in world space (skill rules 3 and 6): one
    // handler maps the pointer to the frontmost room whose full rotated
    // silhouette (roof, walls and floor) contains it. Selection fires on
    // pointerup and never after a drag exceeded the threshold (plan §4.4).
    const onPointerDown = (pointer: Phaser.Input.Pointer): void => {
      if (!this.isLive()) {
        return;
      }
      if (pointer.rightButtonDown()) {
        this.press = {
          button: 'right',
          startScreenX: pointer.x,
          startScreenY: pointer.y,
          lastScreenX: pointer.x,
          lastScreenY: pointer.y,
          dragging: false,
        };
        return;
      }
      if (pointer.leftButtonDown()) {
        this.press = {
          button: 'left',
          startScreenX: pointer.x,
          startScreenY: pointer.y,
          lastScreenX: pointer.x,
          lastScreenY: pointer.y,
          dragging: false,
        };
      }
    };
    const onPointerMove = (pointer: Phaser.Input.Pointer): void => {
      if (!this.isLive()) {
        return;
      }
      if (this.press === null) {
        this.updateHover(pointer);
        return;
      }
      const press = this.press;
      const movedTotal =
        Math.abs(pointer.x - press.startScreenX) + Math.abs(pointer.y - press.startScreenY);
      if (!press.dragging && movedTotal > DRAG_THRESHOLD_PX) {
        press.dragging = true;
      }
      if (!press.dragging) {
        return;
      }
      const dx = pointer.x - press.lastScreenX;
      press.lastScreenX = pointer.x;
      press.lastScreenY = pointer.y;
      if (press.button === 'right') {
        this.applyYaw(dx * YAW_RATE);
      } else {
        // Pan: the world follows the pointer; camera bounds clamp the travel.
        this.cameras.main.scrollX -= dx;
      }
    };
    const onPointerUp = (pointer: Phaser.Input.Pointer): void => {
      if (!this.isLive() || this.press === null) {
        return;
      }
      const cleanClick = this.press.button === 'left' && !this.press.dragging;
      this.press = null;
      if (cleanClick) {
        const roomId = this.roomAt(pointer.worldX, pointer.worldY);
        if (roomId !== null) {
          gameBridge.emitGameEvent({ type: 'ROOM_SELECTED', roomId });
        }
      }
    };
    const onGameOut = (): void => {
      if (this.isLive()) {
        this.press = null;
        this.setHovered(null);
      }
    };
    this.input?.on('pointerdown', onPointerDown);
    this.input?.on('pointermove', onPointerMove);
    this.input?.on('pointerup', onPointerUp);
    this.input?.on('gameout', onGameOut);

    // Explicit teardown: a StrictMode remount or a game destroy must not leave
    // pointer, view-reset or context-menu listeners behind, nor let forwarded
    // state write into a dead scene.
    this.events.once('shutdown', () => {
      this.shutDown = true;
      this.input?.off('pointerdown', onPointerDown);
      this.input?.off('pointermove', onPointerMove);
      this.input?.off('pointerup', onPointerUp);
      this.input?.off('gameout', onGameOut);
      this.input?.setDefaultCursor('default');
      this.unsubscribeViewReset?.();
      this.unsubscribeViewReset = null;
      canvas?.removeEventListener('contextmenu', suppressMenu);
    });
  }

  private updateHover(pointer: Phaser.Input.Pointer): void {
    if (!this.isLive()) {
      return;
    }
    this.setHovered(this.roomAt(pointer.worldX, pointer.worldY));
  }

  /** Yaw rotates every drawn and hit shape in screen space (plan §4.2/§4.3). */
  private applyYaw(deltaYaw: number): void {
    this.view.yawRad += deltaYaw;
    this.resortHitShapes();
    this.repaintAll();
    this.repositionMarkers();
  }

  /** RESET_VIEW (plan step 5): back to the authored default framing. */
  resetView(): void {
    if (!this.isLive()) {
      return;
    }
    this.view = { ...NEUTRAL_VIEW };
    this.resortHitShapes();
    this.centerCameraOnContent();
    this.repaintAll();
    this.repositionMarkers();
  }

  /** Dev/test hook: the current presentation view (never persisted). */
  getViewState(): ViewState {
    return { ...this.view };
  }

  private resortHitShapes(): void {
    this.hitShapes = this.hitShapes
      .map((shape) => {
        const grid = ROOM_GRID[roomNumber(shape.roomId) ?? 1];
        return {
          roomId: shape.roomId,
          depth: depthFor(grid, this.contentCenter, this.view.yawRad),
          polygon: this.rotatedSilhouette(grid),
        };
      })
      .sort((a, b) => b.depth - a.depth);
  }

  private rotatedSilhouette(grid: { gridX: number; gridY: number }): ScreenPos[] {
    return roomSilhouette(grid).map((point) =>
      rotateAround(point, this.contentCenter, this.view.yawRad),
    );
  }

  private repositionMarkers(): void {
    for (const [roomId, marker] of this.markers) {
      const grid = ROOM_GRID[roomNumber(roomId) ?? 1];
      const rotated = rotateAround(project(grid), this.contentCenter, this.view.yawRad);
      marker.setX(rotated.x);
      marker.setY(rotated.y - TILE_H / 6);
      marker.setDepth(depthFor(grid, this.contentCenter, this.view.yawRad) + 0.5);
    }
  }

  /** Discrete state change pushed by the React host (never per-frame data). */
  updateFromState(state: GameState): void {
    if (!this.isLive()) {
      return;
    }
    const worldKey = state.building.rooms
      .map((r) => `${r.roomId}:${r.level}:${r.tenantId ?? 'v'}`)
      .join('|');
    if (worldKey !== this.lastWorldKey) {
      this.rebuildRooms(state);
      this.lastWorldKey = worldKey;
    }
  }

  /** Selection changed on the UI side; visual only. */
  updateSelection(roomId: string | null): void {
    if (!this.isLive()) {
      return;
    }
    this.selectedRoomId = roomId;
    this.repaintAll();
  }

  /** Destroyed scenes keep forwarded closures harmless: guard every write. */
  private isLive(): boolean {
    return !this.shutDown && this.sys !== undefined && this.add !== undefined;
  }

  private rebuildRooms(state: GameState): void {
    if (!this.isLive()) {
      return;
    }
    for (const graphics of this.roomGraphics.values()) {
      graphics.destroy();
    }
    for (const marker of this.markers.values()) {
      marker.destroy();
    }
    this.roomGraphics.clear();
    this.markers.clear();
    this.rooms.clear();

    const archetypes = new Map(
      state.tenants.map((tenant) => [tenant.tenantId, tenant.archetype] as const),
    );

    // Content center first: every drawing below rotates around it (plan §4.2).
    const projected = state.building.rooms.map((room) => {
      const number = roomNumber(room.roomId) ?? 1;
      return project(ROOM_GRID[number]);
    });
    this.contentCenter = v(
      projected.reduce((sum, p) => sum + p.x, 0) / Math.max(projected.length, 1),
      projected.reduce((sum, p) => sum + p.y, 0) / Math.max(projected.length, 1),
    );

    for (const room of state.building.rooms) {
      this.rooms.set(room.roomId, room);
      const archetype = room.tenantId !== null ? archetypes.get(room.tenantId) : undefined;
      this.createRoom(room, archetype);
    }

    // Front rooms (closer after rotation) win overlapping clicks and hovers.
    this.hitShapes = state.building.rooms
      .map((room) => {
        const grid = ROOM_GRID[roomNumber(room.roomId) ?? 1];
        return {
          roomId: room.roomId,
          depth: depthFor(grid, this.contentCenter, this.view.yawRad),
          polygon: this.rotatedSilhouette(grid),
        };
      })
      .sort((a, b) => b.depth - a.depth);

    if (this.hoveredRoomId !== null && !this.rooms.has(this.hoveredRoomId)) {
      this.hoveredRoomId = null;
    }

    // The authored framing applies only on first build and on reset view;
    // ordinary rebuilds must not steal the player's camera (plan §4.5).
    if (this.roomGraphics.size === 1) {
      this.centerCameraOnContent();
    }
    this.repaintAll();
  }

  /** The frontmost room whose rotated silhouette contains the world point. */
  private roomAt(worldX: number, worldY: number): string | null {
    for (const shape of this.hitShapes) {
      if (pointInConvexPolygon(worldX, worldY, shape.polygon)) {
        return shape.roomId;
      }
    }
    return null;
  }

  private setHovered(roomId: string | null): void {
    if (roomId === this.hoveredRoomId) {
      return;
    }
    const previous = this.hoveredRoomId;
    this.hoveredRoomId = roomId;
    if (previous !== null) {
      this.paintRoom(previous);
    }
    if (roomId !== null) {
      this.paintRoom(roomId);
    }
    this.input?.setDefaultCursor(roomId !== null ? 'pointer' : 'default');
  }

  private createRoom(room: RoomState, archetype: TenantArchetype | undefined): void {
    const grid = ROOM_GRID[roomNumber(room.roomId) ?? 1];
    const g = this.add.graphics();
    g.setDepth(depthFor(grid, this.contentCenter, this.view.yawRad)); // rotated ground depth
    this.roomGraphics.set(room.roomId, g);

    // Occupied rooms show a tenant marker dot (asset-manifest tenant markers).
    if (room.tenantId !== null && archetype !== undefined) {
      const rotated = rotateAround(project(grid), this.contentCenter, this.view.yawRad);
      const marker = this.add.circle(
        rotated.x,
        rotated.y - TILE_H / 6,
        6,
        MARKER_COLORS[archetype],
      );
      marker.setDepth(depthFor(grid, this.contentCenter, this.view.yawRad) + 0.5);
      this.markers.set(room.roomId, marker);
    }
    this.paintRoom(room.roomId);
  }

  /** Redraw every room so hover and selection stay in sync. */
  private repaintAll(): void {
    if (!this.isLive()) {
      return;
    }
    for (const roomId of this.roomGraphics.keys()) {
      this.paintRoom(roomId);
    }
  }

  /** Clears and redraws one room: faces, hover lift and selection outline. */
  private paintRoom(roomId: string): void {
    const g = this.roomGraphics.get(roomId);
    const room = this.rooms.get(roomId);
    if (g === undefined || room === undefined || !this.isLive()) {
      return;
    }
    const grid = ROOM_GRID[roomNumber(roomId) ?? 1];
    const center = project(grid);
    const place = (point: ScreenPos): Phaser.Math.Vector2 => {
      const rotated = rotateAround(point, this.contentCenter, this.view.yawRad);
      return v(rotated.x, rotated.y);
    };
    const floorTop = place({ x: center.x, y: center.y - TILE_H / 2 });
    const floorRight = place({ x: center.x + TILE_W / 2, y: center.y });
    const floorBottom = place({ x: center.x, y: center.y + TILE_H / 2 });
    const floorLeft = place({ x: center.x - TILE_W / 2, y: center.y });
    // Walls extrude screen-up regardless of yaw: no underground view exists.
    const wallsUp = (p: Phaser.Math.Vector2): Phaser.Math.Vector2 => v(p.x, p.y - WALL_H);

    const lift = roomId === this.hoveredRoomId ? HOVER_LIGHTEN : 0;
    const tone = (color: number): number => (lift > 0 ? brighten(color, lift) : color);
    const isSelected = roomId === this.selectedRoomId;

    g.clear();
    g.fillStyle(tone(LEVEL_ROOF[room.level]), 1);
    g.fillPoints(
      [wallsUp(floorTop), wallsUp(floorRight), wallsUp(floorBottom), wallsUp(floorLeft)],
      true,
    );
    g.fillStyle(tone(WALL_LEFT_FILL), 1);
    g.fillPoints([floorLeft, floorBottom, wallsUp(floorBottom), wallsUp(floorLeft)], true);
    g.fillStyle(tone(WALL_RIGHT_FILL), 1);
    g.fillPoints([floorRight, floorBottom, wallsUp(floorBottom), wallsUp(floorRight)], true);
    g.fillStyle(tone(FLOOR_FILL), 1);
    g.fillPoints([floorTop, floorRight, floorBottom, floorLeft], true);
    g.lineStyle(isSelected ? 6 : 2, isSelected ? HIGHLIGHT : FLOOR_STROKE, 1);
    g.strokePoints([floorTop, floorRight, floorBottom, floorLeft], true);
  }

  /** Pan clamp bounds plus the authored default framing (plan §4.4/§4.5). */
  private centerCameraOnContent(): void {
    if (!this.isLive()) {
      return;
    }
    const polygons = this.hitShapes.length > 0
      ? this.hitShapes.map((shape) => shape.polygon)
      : [roomSilhouette({ gridX: 0, gridY: 0 }), roomSilhouette({ gridX: 1, gridY: 0 })];
    const xs = polygons.flatMap((polygon) => polygon.map((p) => p.x));
    const ys = polygons.flatMap((polygon) => polygon.map((p) => p.y));
    const minX = Math.min(...xs) - PAN_MARGIN;
    const maxX = Math.max(...xs) + PAN_MARGIN;
    const minY = Math.min(...ys) - PAN_MARGIN;
    const maxY = Math.max(...ys) + PAN_MARGIN;
    this.cameras.main.setBounds(minX, minY, maxX - minX, maxY - minY);
    this.cameras.main.centerOn(this.contentCenter.x, this.contentCenter.y - TILE_H);
  }
}
