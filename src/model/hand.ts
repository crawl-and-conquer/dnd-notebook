export const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,!?'\"-&";

export const PAD_W = 600;
export const PAD_H = 380;
export const PAD_ASCENDER_Y = 60;
export const PAD_CAP_Y = 90;
export const PAD_XHEIGHT_Y = 162;
export const PAD_BASELINE_Y = 262;
export const PAD_DESCENDER_Y = 342;

/** strokes data: variant → stroke → flat [x, y, pressure, ...] */
export type GlyphStrokes = number[][][];

/** All glyph data for a character's hand, keyed by character. */
export type GlyphsData = Record<string, GlyphStrokes>;

export function emptyGlyphs(): GlyphsData {
  return {};
}

export function parseGlyphs(text: string): GlyphsData {
  try {
    const v = JSON.parse(text) as unknown;
    if (typeof v !== "object" || v === null || Array.isArray(v)) return {};
    return v as GlyphsData;
  } catch {
    return {};
  }
}

export function serialiseGlyphs(data: GlyphsData): string {
  return JSON.stringify(data, null, 2) + "\n";
}

/** Deterministic variant selection: stable per (char, position in text). */
export function pickVariant(charCode: number, pos: number, numVariants: number): number {
  return (charCode * 31 + pos) % numVariants;
}
