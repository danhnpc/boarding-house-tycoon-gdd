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

/** Ground fan is the bottom vertex of the floor diamond — depth anchor (skill rule 2). */
export function depthFor(grid: GridPos): number {
  return grid.gridX + grid.gridY;
}

export function roomNumber(roomId: string): number | null {
  const match = /^room-(\d+)$/.exec(roomId);
  return match === null ? null : Number.parseInt(match[1], 10);
}
