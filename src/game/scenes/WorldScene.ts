// Game world scene (Phase 2). Renders the boarding house from canonical
// GameState snapshots pushed in by React (single direction, react-phaser-bridge
// rule 8: both layers read the same state, only React owns subscriptions for
// cleanup guarantees). The scene never writes rules; placeholder art policy:
// code-drawn shapes with stable asset keys from src/config/assets.ts.

import Phaser from 'phaser';
import { gameBridge } from '../bridge/gameBridge';
import {
  ROOM_GRID,
  TILE_H,
  TILE_W,
  WALL_H,
  depthFor,
  pointInConvexPolygon,
  project,
  roomNumber,
  roomSilhouette,
  type ScreenPos,
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

export class WorldScene extends Phaser.Scene {
  private roomGraphics = new Map<string, Phaser.GameObjects.Graphics>();
  private markers = new Map<string, Phaser.GameObjects.Arc>();
  private rooms = new Map<string, RoomState>();
  /** Click and hover areas, frontmost room first (see roomAt). */
  private hitShapes: HitShape[] = [];
  /** Selection and hover are visual-only state owned by the scene (skill rule 4). */
  private selectedRoomId: string | null = null;
  private hoveredRoomId: string | null = null;
  private lastWorldKey = '';
  private contentCenter = v(0, 0);
  /** Set on shutdown: forwarded closures from a stopped scene must not write. */
  private shutDown = false;

  constructor() {
    super('WorldScene');
  }

  create(): void {
    this.shutDown = false;
    // Initial framing before any snapshot arrives; the world redraws on the
    // first forwarded store snapshot (within one tick).
    this.centerCameraOnContent();
    // Scene-level hit testing in world space (skill rules 3 and 6): one
    // handler maps the pointer to the frontmost room whose full silhouette
    // (roof, walls and floor) contains it.
    const onPointerDown = (pointer: Phaser.Input.Pointer) => {
      if (!this.isLive()) {
        return;
      }
      const roomId = this.roomAt(pointer.worldX, pointer.worldY);
      if (roomId !== null) {
        gameBridge.emitGameEvent({ type: 'ROOM_SELECTED', roomId });
      }
    };
    const onPointerMove = (pointer: Phaser.Input.Pointer) => {
      if (!this.isLive()) {
        return;
      }
      this.setHovered(this.roomAt(pointer.worldX, pointer.worldY));
    };
    const onGameOut = () => {
      if (this.isLive()) {
        this.setHovered(null);
      }
    };
    this.input?.on('pointerdown', onPointerDown);
    this.input?.on('pointermove', onPointerMove);
    this.input?.on('gameout', onGameOut);
    // Explicit teardown: a StrictMode remount or a game destroy must not leave
    // a pointer listener behind, nor let forwarded state write into a dead scene.
    this.events.once('shutdown', () => {
      this.shutDown = true;
      this.input?.off('pointerdown', onPointerDown);
      this.input?.off('pointermove', onPointerMove);
      this.input?.off('gameout', onGameOut);
      this.input?.setDefaultCursor('default');
    });
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

    for (const room of state.building.rooms) {
      this.rooms.set(room.roomId, room);
      const archetype = room.tenantId !== null ? archetypes.get(room.tenantId) : undefined;
      this.createRoom(room, archetype);
    }

    // Front rooms (larger grid depth) win overlapping clicks and hovers.
    this.hitShapes = state.building.rooms
      .map((room) => {
        const grid = ROOM_GRID[roomNumber(room.roomId) ?? 1];
        return { roomId: room.roomId, depth: depthFor(grid), polygon: roomSilhouette(grid) };
      })
      .sort((a, b) => b.depth - a.depth);

    if (this.hoveredRoomId !== null && !this.rooms.has(this.hoveredRoomId)) {
      this.hoveredRoomId = null;
    }

    const projected = state.building.rooms.map((room) => {
      const number = roomNumber(room.roomId) ?? 1;
      return project(ROOM_GRID[number]);
    });
    this.contentCenter = v(
      projected.reduce((sum, p) => sum + p.x, 0) / Math.max(projected.length, 1),
      projected.reduce((sum, p) => sum + p.y, 0) / Math.max(projected.length, 1),
    );
    this.centerCameraOnContent();
    this.repaintAll();
  }

  /** The frontmost room whose silhouette contains the world point, if any. */
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
    const center = project(grid);
    const centerVec = v(center.x, center.y);

    const g = this.add.graphics();
    g.setDepth(depthFor(grid)); // ground-contact depth (skill rule 2)
    this.roomGraphics.set(room.roomId, g);

    // Occupied rooms show a tenant marker dot on the floor (placeholder for
    // the tenant sprite keys in the asset manifest).
    if (room.tenantId !== null && archetype !== undefined) {
      const marker = this.add.circle(
        centerVec.x,
        centerVec.y - TILE_H / 6,
        6,
        MARKER_COLORS[archetype],
      );
      marker.setDepth(depthFor(grid) + 0.5);
      this.markers.set(room.roomId, marker);
    }
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
    const centerVec = v(center.x, center.y);

    const floorTop = v(centerVec.x, centerVec.y - TILE_H / 2);
    const floorRight = v(centerVec.x + TILE_W / 2, centerVec.y);
    const floorBottom = v(centerVec.x, centerVec.y + TILE_H / 2);
    const floorLeft = v(centerVec.x - TILE_W / 2, centerVec.y);
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

  private centerCameraOnContent(): void {
    if (!this.isLive()) {
      return;
    }
    this.cameras.main.centerOn(this.contentCenter.x, this.contentCenter.y - TILE_H);
  }
}
