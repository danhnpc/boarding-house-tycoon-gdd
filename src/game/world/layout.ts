// Pure isometric layout helpers (no Phaser import — testable, skill rule 1).

export const TILE_W = 96;
export const TILE_H = 48;
export const WALL_H = 44;

export interface GridPos {
  gridX: number;
  gridY: number;
}

export interface ScreenPos {
  x: number;
  y: number;
}

/**
 * Authored placeholder layout (GDD 10 / visual-direction 5.1): fixed room
 * positions for the 2, 4 and 6-room progression states share one grid. Rooms
 * 1–2 exist from the start; 3–4 unlock with Expansion 1; 5–6 with Expansion 2.
 * The production layouts art produces later replace this table per state.
 */
export const ROOM_GRID: Record<number, GridPos> = {
  1: { gridX: 0, gridY: 0 },
  2: { gridX: 1, gridY: 0 },
  3: { gridX: 0, gridY: 1 },
  4: { gridX: 1, gridY: 1 },
  5: { gridX: 2, gridY: 1 },
  6: { gridX: 2, gridY: 0 },
};

/** GDD 7.2 isometric projection: diamond projection of the grid position. */
export function project(grid: GridPos): ScreenPos {
  return {
    x: (grid.gridX - grid.gridY) * (TILE_W / 2),
    y: (grid.gridX + grid.gridY) * (TILE_H / 2),
  };
}

/**
 * Full visible silhouette of a room prism: the roof diamond (floor raised by
 * WALL_H) joined with the floor diamond. Convex hexagon, clockwise on screen.
 * This is the click and hover area, so the walls and roof are clickable too.
 */
export function roomSilhouette(grid: GridPos): ScreenPos[] {
  const c = project(grid);
  const halfW = TILE_W / 2;
  const halfH = TILE_H / 2;
  return [
    { x: c.x, y: c.y - halfH - WALL_H },
    { x: c.x + halfW, y: c.y - WALL_H },
    { x: c.x + halfW, y: c.y },
    { x: c.x, y: c.y + halfH },
    { x: c.x - halfW, y: c.y },
    { x: c.x - halfW, y: c.y - WALL_H },
  ];
}

/** True when (x, y) lies inside or on the edge of a convex polygon. */
export function pointInConvexPolygon(x: number, y: number, polygon: readonly ScreenPos[]): boolean {
  let sign = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    if (cross === 0) continue;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/** Ground fan is the bottom vertex of the floor diamond — depth anchor (skill rule 2). */
export function depthFor(grid: GridPos, center?: ScreenPos, yawRad?: number): number {
  if (center === undefined || yawRad === undefined || yawRad === 0) {
    return grid.gridX + grid.gridY;
  }
  // Depth under camera yaw: the screen-space y of the rotated ground point
  // (larger y = closer to the viewer). With yaw = 0 this equals gridX + gridY
  // up to the constant positive factor TILE_H / 2 — same ordering, so the
  // legacy identity holds exactly.
  return rotateAround(project(grid), center, yawRad).y;
}

export function roomNumber(roomId: string): number | null {
  const match = /^room-(\d+)$/.exec(roomId);
  return match === null ? null : Number.parseInt(match[1], 10);
}

/** Presentation-only view state (camera view plan §4.1): never in GameState. */
export interface ViewState {
  panX: number;
  panY: number;
  yawRad: number;
}

export const NEUTRAL_VIEW: ViewState = { panX: 0, panY: 0, yawRad: 0 };

/** Uniform screen-space rotation around a pivot (camera yaw, plan §4.2). */
export function rotateAround(point: ScreenPos, center: ScreenPos, yawRad: number): ScreenPos {
  if (yawRad === 0) {
    return { x: point.x, y: point.y };
  }
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const cos = Math.cos(yawRad);
  const sin = Math.sin(yawRad);
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

/** Drag distance beyond which a press becomes a pan instead of a selection. */
export const DRAG_THRESHOLD_PX = 5;
