import { z } from "zod";

/** The 70 glyphs a hand can have (SPEC: Handwriting builder). */
export const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,!?'\"-&";

// ----- the drawing pad (builder coordinates) -----

export const PAD_W = 600;
export const PAD_H = 380;
export const PAD_ASCENDER_Y = 60;
export const PAD_CAP_Y = 90;
export const PAD_XHEIGHT_Y = 162;
export const PAD_BASELINE_Y = 262;
export const PAD_DESCENDER_Y = 342;
/** Pad units per em: baseline to ascender. */
export const PAD_EM = PAD_BASELINE_Y - PAD_ASCENDER_Y;
/** Where glyphs start on the pad (right of the guide labels). */
export const PAD_ORIGIN_X = 110;

/** Heights above the baseline in em (descender below it, so negative); baseline is 0. */
export const PAD_METRICS = {
  ascender: 1,
  capHeight: (PAD_BASELINE_Y - PAD_CAP_Y) / PAD_EM,
  xHeight: (PAD_BASELINE_Y - PAD_XHEIGHT_Y) / PAD_EM,
  descender: -(PAD_DESCENDER_Y - PAD_BASELINE_Y) / PAD_EM,
};

/** Gap after each glyph and before the first stroke, in em. */
const SIDE_BEARING = 0.06;
export const MAX_VARIANTS = 3;

// ----- hand/hand.json -----

const VariantSchema = z.object({
  /** Flat [x, y, pressure, ...] per stroke, in em; y grows downwards from the baseline. */
  strokes: z.array(z.array(z.number())),
  advance: z.number(),
});

export const HandSchema = z.object({
  schemaVersion: z.literal(1),
  metrics: z.object({
    ascender: z.number(),
    capHeight: z.number(),
    xHeight: z.number(),
    descender: z.number(),
  }),
  glyphs: z.record(z.string(), z.object({ variants: z.array(VariantSchema) })),
});

export type GlyphVariant = z.infer<typeof VariantSchema>;
export type Hand = z.infer<typeof HandSchema>;
/** Kept as a name for the hand data the store and components pass around. */
export type GlyphsData = Hand;

export function emptyGlyphs(): Hand {
  return { schemaVersion: 1, metrics: { ...PAD_METRICS }, glyphs: {} };
}

/** Variants with at least one stroke, for one character. */
export function drawnVariants(hand: Hand, ch: string): GlyphVariant[] {
  return (hand.glyphs[ch]?.variants ?? []).filter((v) => v.strokes.length > 0);
}

export function drawnCount(hand: Hand): number {
  return [...GLYPHS].filter((c) => drawnVariants(hand, c).length > 0).length;
}

/**
 * Reads hand.json. Builds before 0.2 stored `{ "a": [[stroke, ...], ...] }` in pad pixels;
 * those are converted to em with an advance worked out from each variant's width.
 */
export function parseGlyphs(text: string): Hand {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return emptyGlyphs();
  }
  const r = HandSchema.safeParse(raw);
  if (r.success) return r.data;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return emptyGlyphs();
  const hand = emptyGlyphs();
  for (const [ch, variants] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(variants)) continue;
    const out: GlyphVariant[] = [];
    for (const v of variants) {
      if (!Array.isArray(v)) continue;
      const strokes = v.filter((s): s is number[] => Array.isArray(s) && s.every((n) => typeof n === "number"));
      if (strokes.length) out.push(variantFromPad(strokes));
    }
    if (out.length) hand.glyphs[ch] = { variants: out.slice(0, MAX_VARIANTS) };
  }
  return hand;
}

export function serialiseGlyphs(hand: Hand): string {
  return JSON.stringify(hand) + "\n";
}

/** Turns strokes drawn on the pad into an em-unit variant, trimmed to the ink with a side bearing. */
export function variantFromPad(padStrokes: number[][]): GlyphVariant {
  let minX = Infinity;
  let maxX = -Infinity;
  for (const s of padStrokes)
    for (let i = 0; i + 2 < s.length; i += 3) {
      minX = Math.min(minX, s[i]);
      maxX = Math.max(maxX, s[i]);
    }
  if (!Number.isFinite(minX)) return { strokes: [], advance: 0.4 };
  const round = (v: number) => Math.round(v * 10000) / 10000;
  const strokes = padStrokes.map((s) => {
    const out: number[] = [];
    for (let i = 0; i + 2 < s.length; i += 3) {
      out.push(
        round((s[i] - minX) / PAD_EM + SIDE_BEARING),
        round((s[i + 1] - PAD_BASELINE_Y) / PAD_EM),
        round(s[i + 2]),
      );
    }
    return out;
  });
  return { strokes, advance: round((maxX - minX) / PAD_EM + SIDE_BEARING * 2) };
}

/** The reverse, for editing a saved variant on the pad (placed at the pad's glyph origin). */
export function variantToPad(v: GlyphVariant): number[][] {
  return v.strokes.map((s) => {
    const out: number[] = [];
    for (let i = 0; i + 2 < s.length; i += 3) {
      out.push(s[i] * PAD_EM + PAD_ORIGIN_X, s[i + 1] * PAD_EM + PAD_BASELINE_Y, s[i + 2]);
    }
    return out;
  });
}

/** Stable per text element and letter position, so repeated letters differ but never flicker. */
export function variantSeed(elementId: string, pos: number): number {
  let h = 2166136261;
  for (let i = 0; i < elementId.length; i++) h = Math.imul(h ^ elementId.charCodeAt(i), 16777619);
  h = Math.imul(h ^ pos, 16777619);
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  return (h ^ (h >>> 15)) >>> 0;
}

export function pickVariant(elementId: string, pos: number, count: number): number {
  return count <= 1 ? 0 : variantSeed(elementId, pos) % count;
}
