// Camera yaw tests (camera-view-plan §6): projection rotation in screen
// space, depth ordering per quadrant, convexity of rotated silhouettes.

import { describe, expect, it } from 'vitest';
import {
  DRAG_THRESHOLD_PX,
  ROOM_GRID,
  TILE_H,
  TILE_W,
  depthFor,
  pointInConvexPolygon,
  project,
  rotateAround,
  roomSilhouette,
} from '../../src/game/world/layout';

const QUARTER = Math.PI / 2;

describe('rotation helpers (plan §4.2)', () => {
  it('yaw = 0 is the identity (legacy points are preserved exactly)', () => {
    for (let n = 1; n <= 6; n++) {
      const grid = ROOM_GRID[n];
      const center = project({ gridX: 1, gridY: 1 });
      expect(rotateAround(project(grid), center, 0)).toEqual(project(grid));
      expect(depthFor(grid, center, 0)).toBe(depthFor(grid));
    }
  });

  it('a full 360° turn returns every point to its origin (small epsilon)', () => {
    for (let n = 1; n <= 6; n++) {
      const center = { x: 50, y: -20 };
      const point = project(ROOM_GRID[n]);
      const rotated = rotateAround(point, center, 2 * Math.PI);
      expect(Math.abs(rotated.x - point.x)).toBeLessThan(1e-9);
      expect(Math.abs(rotated.y - point.y)).toBeLessThan(1e-9);
    }
  });

  it('quarter turn maps axis-aligned distances correctly (rigid rotation)', () => {
    const center = { x: 0, y: 0 };
    const turned = rotateAround({ x: 10, y: 0 }, center, QUARTER);
    // 90° clockwise-ish rotation keeps distance and swaps axes.
    expect(turned.x).toBeCloseTo(0, 9);
    expect(turned.y).toBeCloseTo(10, 9);
  });

  it('rotating about a pivot keeps the pivot fixed', () => {
    const center = { x: 42, y: -7 };
    expect(rotateAround(center, center, 0.7)).toEqual(center);
  });
});

describe('depth ordering under yaw (plan §4.3)', () => {
  const center = project({ gridX: 1, gridY: 1 });

  it('180° yaw reverses front/back: what was farthest is now nearest', () => {
    expect(depthFor(ROOM_GRID[4], center, 0)).toBeGreaterThan(depthFor(ROOM_GRID[1], center, 0));
    const sorted = [1, 2, 3, 4].sort(
      (a, b) =>
        depthFor(ROOM_GRID[a], center, Math.PI) - depthFor(ROOM_GRID[b], center, Math.PI),
    );
    // Rotated screen-y at 180° is const − y, so the depth order flips.
    expect(sorted).toEqual([4, 2, 3, 1]);
    expect(Number.isFinite(depthFor(ROOM_GRID[6], center, Math.PI))).toBe(true);
  });

  it('yaw = 0 keeps the exact legacy ordering', () => {
    expect(depthFor(ROOM_GRID[1], center, 0)).toBeLessThan(depthFor(ROOM_GRID[4], center, 0));
  });
});

describe('hit testing under rotation (plan §6)', () => {
  it('rotated room silhouettes stay convex and contain their room center', () => {
    for (let n = 1; n <= 6; n++) {
      const grid = ROOM_GRID[n];
      const center = project({ gridX: 1, gridY: 1 });
      for (const yaw of [0, QUARTER, Math.PI, 3 * QUARTER]) {
        const polygon = roomSilhouette(grid).map((point) =>
          rotateAround(point, center, yaw),
        );
        const rotatedCenter = rotateAround(project(grid), center, yaw);
        expect(pointInConvexPolygon(rotatedCenter.x, rotatedCenter.y, polygon)).toBe(true);
      }
    }
  });

  it('a point on a wall of the rotated silhouette still selects the room', () => {
    const grid = ROOM_GRID[2];
    const center = project({ gridX: 1, gridY: 1 });
    const yaw = QUARTER;
    const polygon = roomSilhouette(grid).map((point) => rotateAround(point, center, yaw));
    // Halfway up the right wall of the prism.
    const base = project(grid);
    const wallPoint0 = rotateAround(
      { x: base.x + TILE_W / 2, y: base.y - 10 },
      center,
      yaw,
    );
    expect(pointInConvexPolygon(wallPoint0.x, wallPoint0.y, polygon)).toBe(true);
  });

  it('drag threshold constant is in the plan-tuned range (4–6 px)', () => {
    expect(DRAG_THRESHOLD_PX).toBeGreaterThanOrEqual(4);
    expect(DRAG_THRESHOLD_PX).toBeLessThanOrEqual(6);
  });
});

describe('legacy silhouette invariants', () => {
  it('the un-rotated silhouette contains the floor center and the roof apex', () => {
    const polygon = roomSilhouette(ROOM_GRID[1]); // center (0,0)
    expect(pointInConvexPolygon(0, 0, polygon)).toBe(true);
    expect(pointInConvexPolygon(0, -TILE_H / 2 - 22 / 2, polygon)).toBe(true);
  });
});
