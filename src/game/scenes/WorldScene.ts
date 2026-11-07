// Phase 0 spike world scene.
// Placeholder isometric rooms drawn with vector shapes (approved placeholder
// policy, GDD section 10). Proves: touch/mouse selection, ground-anchor depth,
// RESIZE-driven portrait/landscape scaling, and the typed bridge contract.

import Phaser from 'phaser';
import { gameBridge, type UiToGameCommand } from '../bridge/gameBridge';

// Isometric transform (tech doc 7.2): screen = diamond projection of grid pos.
const TILE_W = 96;
const TILE_H = 48;
const WALL_H = 44;

interface RoomSpec {
  id: string;
  gridX: number;
  gridY: number;
}

const ROOMS: RoomSpec[] = [
  { id: 'room-1', gridX: 0, gridY: 0 },
  { id: 'room-2', gridX: 1, gridY: 0 },
  { id: 'room-3', gridX: 0, gridY: 1 },
];

const FLOOR_FILL = 0x7ec850;
const WALL_LEFT_FILL = 0x8b6b4a;
const WALL_RIGHT_FILL = 0xa58359;
const ROOF_FILL = 0xd96c4f;
const FLOOR_STROKE = 0x3d6e26;
const HIGHLIGHT = 0xffe28a;

type Vec2 = Phaser.Math.Vector2;

const v = (x: number, y: number): Vec2 => new Phaser.Math.Vector2(x, y);

export class WorldScene extends Phaser.Scene {
  private roomGraphics = new Map<string, Phaser.GameObjects.Graphics>();
  private roomZones = new Map<string, Phaser.GameObjects.Zone>();
  private unsubscribeCommands: (() => void) | null = null;
  private contentCenter: Vec2 = v(0, 0);

  private readonly handleResize = () => {
    this.centerCameraOnContent();
  };

  private readonly handleClearSelection = (command: UiToGameCommand): void => {
    if (command.type === 'CLEAR_SELECTION') {
      this.setSelectedRoom(null);
    }
  };

  constructor() {
    super('WorldScene');
  }

  create(): void {
    for (const room of ROOMS) {
      this.buildRoom(room);
    }
    this.computeContentCenter();
    this.centerCameraOnContent();

    this.scale.on('resize', this.handleResize);
    this.unsubscribeCommands = gameBridge.onGameCommand(this.handleClearSelection);

    this.events.once('shutdown', () => {
      this.scale.off('resize', this.handleResize);
      this.unsubscribeCommands?.();
      this.unsubscribeCommands = null;
      this.roomGraphics.clear();
      this.roomZones.clear();
    });

    gameBridge.emitGameEvent({ type: 'WORLD_READY' });
  }

  private buildRoom(room: RoomSpec): void {
    const center = this.roomCenter(room);

    // Floor diamond vertices (ground plane).
    const top = v(center.x, center.y - TILE_H / 2);
    const right = v(center.x + TILE_W / 2, center.y);
    const bottom = v(center.x, center.y + TILE_H / 2);
    const left = v(center.x - TILE_W / 2, center.y);
    const raised = (p: Vec2): Vec2 => v(p.x, p.y - WALL_H);

    const g = this.add.graphics();
    g.setDepth(room.gridX + room.gridY); // ground-anchor depth (visual doc 3.2)

    // Roof block.
    g.fillStyle(ROOF_FILL, 1);
    g.fillPoints([raised(top), raised(right), raised(bottom), raised(left)], true);
    // Left wall, then right wall.
    g.fillStyle(WALL_LEFT_FILL, 1);
    g.fillPoints([left, bottom, raised(bottom), raised(left)], true);
    g.fillStyle(WALL_RIGHT_FILL, 1);
    g.fillPoints([right, bottom, raised(bottom), raised(right)], true);
    // Playable floor with a clear footprint.
    g.fillStyle(FLOOR_FILL, 1);
    g.fillPoints([top, right, bottom, left], true);
    g.lineStyle(2, FLOOR_STROKE, 1);
    g.strokePoints([top, right, bottom, left], true);

    this.roomGraphics.set(room.id, g);

    // Touch-friendly hit area larger than the visible diamond (visual doc 3.1).
    const zone = this.add.zone(center.x, center.y, TILE_W + 24, TILE_H + 24);
    zone.setInteractive({ useHandCursor: true });
    zone.setDepth(1000);
    zone.on('pointerdown', () => {
      this.setSelectedRoom(room.id);
    });
    this.roomZones.set(room.id, zone);
  }

  private setSelectedRoom(roomId: string | null): void {
    for (const [id, g] of this.roomGraphics) {
      const selected = id === roomId;
      g.lineStyle(selected ? 6 : 2, selected ? HIGHLIGHT : FLOOR_STROKE, 1);
    }
    if (roomId === null) {
      gameBridge.emitGameEvent({ type: 'SELECTION_CLEARED' });
    } else {
      gameBridge.emitGameEvent({ type: 'ROOM_SELECTED', roomId });
    }
  }

  private roomCenter(room: RoomSpec): Vec2 {
    return v(
      (room.gridX - room.gridY) * (TILE_W / 2),
      (room.gridX + room.gridY) * (TILE_H / 2),
    );
  }

  private computeContentCenter(): void {
    const centers = ROOMS.map((room) => this.roomCenter(room));
    this.contentCenter = v(
      centers.reduce((sum, p) => sum + p.x, 0) / centers.length,
      centers.reduce((sum, p) => sum + p.y, 0) / centers.length,
    );
  }

  private centerCameraOnContent(): void {
    // Keep the building centered in both portrait and landscape; the tiles
    // are small enough that either orientation fits without camera bounds.
    this.cameras.main.centerOn(this.contentCenter.x, this.contentCenter.y - TILE_H);
  }
}
