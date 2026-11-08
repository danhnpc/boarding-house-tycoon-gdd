// Isometric layout helpers (skill: pure, unit-tested projection and depth).

import { describe, expect, it } from 'vitest';
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
} from '../../src/game/world/layout';

describe('room click area', () => {
  const center = project({ gridX: 0, gridY: 0 });

  it('covers the walls and roof above the floor, not just the floor', () => {
    const shape = roomSilhouette({ gridX: 0, gridY: 0 });
    // A point on the wall, well above the floor diamond.
    expect(pointInConvexPolygon(center.x, center.y - WALL_H, shape)).toBe(true);
    // A point near the roof apex.
    expect(pointInConvexPolygon(center.x, center.y - TILE_H / 2 - WALL_H + 4, shape)).toBe(true);
  });

  it('rejects points outside the room', () => {
    const shape = roomSilhouette({ gridX: 0, gridY: 0 });
    expect(pointInConvexPolygon(center.x + TILE_W, center.y, shape)).toBe(false);
    expect(pointInConvexPolygon(center.x, center.y + TILE_H, shape)).toBe(false);
    expect(pointInConvexPolygon(center.x, center.y - TILE_H / 2 - WALL_H - 5, shape)).toBe(false);
  });
});

describe('isometric projection', () => {
  it('grid origin projects to the world center (0,0)', () => {
    expect(project({ gridX: 0, gridY: 0 })).toEqual({ x: 0, y: 0 });
  });

  it('east cell projects right and down (diamond grid)', () => {
    const p = project({ gridX: 1, gridY: 0 });
    expect(p.x).toBe(TILE_W / 2);
    expect(p.y).toBe(TILE_H / 2);
  });

  it('south-west cell projects left with positive y', () => {
    const p = project({ gridX: 0, gridY: 1 });
    expect(p.x).toBe(-TILE_W / 2);
    expect(p.y).toBe(TILE_H / 2);
  });

  it('diagonal cells keep y monotonic (depth order is drawable)', () => {
    expect(project(ROOM_GRID[6]).y).toBeGreaterThan(project(ROOM_GRID[1]).y);
  });

  it('ground-contact depth agrees with (gridX + gridY)', () => {
    expect(depthFor(ROOM_GRID[1])).toBe(0);
    expect(depthFor(ROOM_GRID[2])).toBe(1);
    expect(depthFor(ROOM_GRID[3])).toBe(1);
    expect(depthFor(ROOM_GRID[6])).toBe(2);
  });
});

describe('room ids', () => {
  it('parses room-1..room-6', () => {
    expect(roomNumber('room-4')).toBe(4);
    expect(roomNumber('hotel-4')).toBeNull();
    expect(roomNumber('room-')).toBeNull();
  });

  it('all six rooms have an authored grid slot', () => {
    for (let n = 1; n <= 6; n++) {
      expect(ROOM_GRID[n]).toBeDefined();
    }
    expect(Object.keys(ROOM_GRID)).toHaveLength(6);
  });
});
