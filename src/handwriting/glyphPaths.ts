import { getStroke } from "perfect-freehand";
import type { GlyphStrokes } from "../model/hand";
import { PAD_BASELINE_Y } from "../model/hand";

export interface RenderOpts {
  scale: number;
  slant: number;   // degrees
  wobble: number;  // 0–100
  strokeWidth: number;
}

/** Convert a flat [x,y,p,...] array + options to an SVG path string. */
export function glyphStrokePath(
  stroke: number[],
  opts: RenderOpts,
  wobbleSeed: number,
): string {
  if (stroke.length < 6) return "";
  const { scale, slant, wobble, strokeWidth } = opts;
  const shear = Math.tan((slant * Math.PI) / 180);
  const wAmp = (wobble / 100) * 2.5; // max wobble in pad units

  const pts: [number, number, number][] = [];
  for (let i = 0; i + 2 < stroke.length; i += 3) {
    let x = stroke[i];
    let y = stroke[i + 1];
    const p = stroke[i + 2];
    // wobble
    if (wAmp > 0) {
      const wn = i / 3;
      x += (Math.sin(wobbleSeed * 7.3 + wn * 2.1) * wAmp);
      y += (Math.sin(wobbleSeed * 3.7 + wn * 1.9) * wAmp);
    }
    // slant shear (pivot at baseline)
    x += (y - PAD_BASELINE_Y) * shear;
    pts.push([x * scale, y * scale, p]);
  }

  const outline = getStroke(pts, {
    size: strokeWidth,
    thinning: 0.4,
    smoothing: 0.5,
    streamline: 0.4,
    simulatePressure: false,
    last: true,
  });

  if (outline.length === 0) return "";
  let d = `M${outline[0][0].toFixed(1)},${outline[0][1].toFixed(1)}`;
  for (let i = 1; i < outline.length; i++)
    d += `L${outline[i][0].toFixed(1)},${outline[i][1].toFixed(1)}`;
  return d + "Z";
}

/** Advance width of a glyph in pad units (rightmost x + small margin). */
export function glyphAdvance(strokes: GlyphStrokes[number]): number {
  let maxX = 0;
  for (const stroke of strokes) {
    for (let i = 0; i < stroke.length; i += 3) maxX = Math.max(maxX, stroke[i]);
  }
  return maxX + 8; // 8 pad-unit margin after each char
}
