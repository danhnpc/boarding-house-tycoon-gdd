// Game world scene (Phase 2). Renders the boarding house from canonical
// GameState snapshots pushed in by React (single direction, react-phaser-bridge
// rule 8: both layers read the same state, only React owns subscriptions for
// cleanup guarantees). The scene never writes rules; placeholder art policy:
// code-drawn shapes with stable asset keys from src/config/assets.ts.

import Phaser from 'phaser';
import { gameBridge } from '../bridge/gameBridge';
import { ROOM_GRID, TILE_H, TILE_W, WALL_H, depthFor, project, roomNumber } from '../world/layout';
import type { GameState, RoomLevel, RoomState, TenantArchetype } from '../../domain/types';

const FLOOR_FILL = 0x7ec850;
const ROOF_FILL = 0xd96c4f;
const ROOF_FILL_L2 = 0x4f96d9;
const ROOF_FILL_L3 = 0x9d6bd9;
const WALL_LEFT_FILL = 0x8b6b4a;
const WALL_RIGHT_FILL = 0xa58359;
const FLOOR_STROKE = 0x3d6e26;
const HIGHLIGHT = 0xffe28a;

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

export class WorldScene extends Phaser.Scene {
  private roomGraphics = new Map<string, Phaser.GameObjects.Graphics>();
  private markers = new Map<string, Phaser.GameObjects.Arc>();
  private roomCenters = new Map<string, { x: number; y: number }>();  /** Selection highlight is visual-only state owned by the scene (skill rule 4). */
  private selectedRoomId: string | null = null;
  private lastWorldKey = '';
  private contentCenter = v(0, 0);

  constructor() {
    super('WorldScene');
  }

  create(): void {
    // Initial framing before any snapshot arrives; the world redraws on the
    // first forwarded store snapshot (within one tick).
    this.centerCameraOnContent();
    // Scene-level hit testing in world space (skill rules 3 and 6): one
    // pointer handler computes the diamond of each room in its own world
    // coordinates, avoiding per-object hitArea space differences between
    // Phaser versions and rect overlaps of a diamond grid.
    this.input?.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.roomCenters.size === 0 || !this.isLive()) {
        return;
      }
      const worldX = pointer.worldX;
      const worldY = pointer.worldY;
      for (const [roomId, center] of this.roomCenters) {
        const dx = Math.abs(worldX - center.x) / (TILE_W * 0.65);
        const dy = Math.abs(worldY - center.y) / (TILE_H * 0.65);
        if (dx + dy <= 1) {
          gameBridge.emitGameEvent({ type: 'ROOM_SELECTED', roomId });
          break;
        }
      }
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
    this.redrawSelection();
  }

  /** Selection changed on the UI side; visual only. */
  updateSelection(roomId: string | null): void {
    if (!this.isLive()) {
      return;
    }
    this.selectedRoomId = roomId;
    this.redrawSelection();
  }

  /** Destroyed scenes keep forwarded closures harmless: guard every write. */
  private isLive(): boolean {
    return this.scene !== undefined && this.sys !== undefined && this.add !== null;
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

    const archetypes = new Map(
      state.tenants.map((tenant) => [tenant.tenantId, tenant.archetype] as const),
    );

    for (const room of state.building.rooms) {
      this.buildRoom(room, room.tenantId !== null ? archetypes.get(room.tenantId) : undefined);
    }
    this.syncRoomCenters(state);

    const projected = state.building.rooms.map((room) => {
      const number = roomNumber(room.roomId) ?? 1;
      return project(ROOM_GRID[number]);
    });
    this.contentCenter = v(
      projected.reduce((sum, p) => sum + p.x, 0) / Math.max(projected.length, 1),
      projected.reduce((sum, p) => sum + p.y, 0) / Math.max(projected.length, 1),
    );
    this.centerCameraOnContent();
  }

  /** Diamond-per-room snapshot used by the scene-level hit test. */
  private syncRoomCenters(state: GameState): void {
    this.roomCenters.clear();
    for (const room of state.building.rooms) {
      const center = project(ROOM_GRID[roomNumber(room.roomId) ?? 1]);
      this.roomCenters.set(room.roomId, center);
    }
  }

  private buildRoom(room: RoomState, archetype: TenantArchetype | undefined): void {
    const number = roomNumber(room.roomId) ?? 1;
    const grid = ROOM_GRID[number];
    const center = project(grid);
    const centerVec = v(center.x, center.y);

    const floorTop = v(centerVec.x, centerVec.y - TILE_H / 2);
    const floorRight = v(centerVec.x + TILE_W / 2, centerVec.y);
    const floorBottom = v(centerVec.x, centerVec.y + TILE_H / 2);
    const floorLeft = v(centerVec.x - TILE_W / 2, centerVec.y);
    const wallsUp = (p: Phaser.Math.Vector2): Phaser.Math.Vector2 => v(p.x, p.y - WALL_H);

    const g = this.add.graphics();
    g.setDepth(depthFor(grid)); // ground-contact depth (skill rule 2)

    g.fillStyle(LEVEL_ROOF[room.level], 1);
    g.fillPoints(
      [wallsUp(floorTop), wallsUp(floorRight), wallsUp(floorBottom), wallsUp(floorLeft)],
      true,
    );
    g.fillStyle(WALL_LEFT_FILL, 1);
    g.fillPoints([floorLeft, floorBottom, wallsUp(floorBottom), wallsUp(floorLeft)], true);
    g.fillStyle(WALL_RIGHT_FILL, 1);
    g.fillPoints([floorRight, floorBottom, wallsUp(floorBottom), wallsUp(floorRight)], true);
    g.fillStyle(FLOOR_FILL, 1);
    g.fillPoints([floorTop, floorRight, floorBottom, floorLeft], true);
    g.lineStyle(2, FLOOR_STROKE, 1);
    g.strokePoints([floorTop, floorRight, floorBottom, floorLeft], true);

    // Playable floor with a clear footprint; close with the tenant marker for
    // occupied rooms (asset-manifest keys room-level-0X-* / tenant-*-marker).
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

  private redrawSelection(): void {
    if (!this.isLive()) {
      return;
    }
    for (const [roomId, g] of this.roomGraphics) {
      const isSelected = roomId === this.selectedRoomId;
      g.lineStyle(isSelected ? 6 : 2, isSelected ? HIGHLIGHT : FLOOR_STROKE, 1);
    }
  }

  private centerCameraOnContent(): void {
    if (!this.isLive()) {
      return;
    }
    this.cameras.main.centerOn(this.contentCenter.x, this.contentCenter.y - TILE_H);
  }
}
