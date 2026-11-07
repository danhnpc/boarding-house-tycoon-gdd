// Display formatting lives outside the domain (skill rule 5): money is minor
// units in state; this is the only place strings are produced.

/** Whole Cash display (GDD 3.1: whole values, fractional accrual stays internal). */
export function formatCash(minorUnits: number): string {
  return Math.floor(minorUnits / 100).toLocaleString('vi-VN');
}
