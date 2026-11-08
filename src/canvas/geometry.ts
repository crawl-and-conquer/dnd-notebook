export type Point = { x: number; y: number };
export type Box = { x: number; y: number; w: number; h: number };

export const snap = (v: number, grid: number): number => Math.round(v / grid) * grid;

export const snapIf = (v: number, grid: number, on: boolean): number => (on ? snap(v, grid) : v);

export const snapPoint = (p: Point, grid: number, on: boolean): Point =>
  on ? { x: snap(p.x, grid), y: snap(p.y, grid) } : p;

/** Lock to lines: 16 px columns and 32 px rows, lined up with the rules (first rule at y 95). */
export const LINES_X = 16;
export const LINES_Y = 32;
/** Where the rules fall within each 32 px row: y = 31, 63, 95, 127, ... */
export const RULE_PHASE = 95 % LINES_Y;
/** A line of handwriting starts this far above the rule it sits on (32 px line, baseline on the rule). */
export const TEXT_ABOVE_RULE = 27;
/** Writing starts right of the margin line, at x 92. */
export const WRITING_X = 92;

const snapPhase = (v: number, grid: number, phase: number) => Math.round((v - phase) / grid) * grid + phase;

/** Shape corners and line ends: onto the nearest rule vertically, a 16 px column across. */
export const snapToLines = (p: Point, on: boolean): Point =>
  on ? { x: snap(p.x, LINES_X), y: snapPhase(p.y, LINES_Y, RULE_PHASE) } : p;

/** Text and checklists: the top of the text box so its first baseline sits on a rule. */
export const snapTextTop = (p: Point, on: boolean): Point =>
  on
    ? {
        x: snapPhase(p.x, LINES_X, WRITING_X % LINES_X),
        y: snapPhase(p.y, LINES_Y, (RULE_PHASE - TEXT_ABOVE_RULE + LINES_Y) % LINES_Y),
      }
    : p;

const TAN_22_5 = Math.tan(Math.PI / 8);

/**
 * Locks a line's direction to 0, 45 or 90 degrees (Shift while drawing).
 * Diagonals keep equal |dx| and |dy| so grid-snapped ends stay on the grid.
 */
export function lockAngle(dx: number, dy: number): Point {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ay <= ax * TAN_22_5) return { x: dx, y: 0 };
  if (ax <= ay * TAN_22_5) return { x: 0, y: dy };
  const d = Math.max(ax, ay);
  return { x: Math.sign(dx) * d, y: Math.sign(dy) * d };
}

/** Rectangle from two corners, in any drag direction. */
export function boxFromCorners(a: Point, b: Point): Box {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  };
}

/** Square-up a drag (Shift for a circle): keeps the anchor corner, uses the larger side. */
export function squareCorner(a: Point, b: Point): Point {
  const d = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  return { x: a.x + Math.sign(b.x - a.x || 1) * d, y: a.y + Math.sign(b.y - a.y || 1) * d };
}

export function boxesIntersect(a: Box, b: Box): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
}
