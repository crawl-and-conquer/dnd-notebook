import { describe, expect, it } from "vitest";
import {
  PAD_BASELINE_Y,
  PAD_EM,
  PAD_ORIGIN_X,
  drawnCount,
  emptyGlyphs,
  parseGlyphs,
  pickVariant,
  serialiseGlyphs,
  variantFromPad,
  variantToPad,
} from "./hand";

describe("hand.json", () => {
  it("round-trips the spec format", () => {
    const hand = emptyGlyphs();
    hand.glyphs.a = { variants: [variantFromPad([[200, 200, 0.5, 220, 262, 0.5]])] };
    const back = parseGlyphs(serialiseGlyphs(hand));
    expect(back).toEqual(hand);
    expect(back.schemaVersion).toBe(1);
    expect(back.metrics.xHeight).toBeCloseTo(100 / PAD_EM);
  });

  it("converts glyphs saved by older builds (pad pixels keyed by letter)", () => {
    const legacy = { a: [[[200, 200, 0.5, 220, 262, 0.5]], [[300, 180, 0.5, 310, 262, 0.5]]], b: [[]] };
    const hand = parseGlyphs(JSON.stringify(legacy));
    expect(hand.glyphs.a.variants).toHaveLength(2);
    expect(hand.glyphs.b).toBeUndefined();
    expect(drawnCount(hand)).toBe(1);
    // The baseline sits at y 0 in em.
    const [, y] = hand.glyphs.a.variants[0].strokes[0].slice(3, 5);
    expect(y).toBeCloseTo(0);
  });

  it("falls back to an empty hand for anything unreadable", () => {
    expect(parseGlyphs("not json")).toEqual(emptyGlyphs());
    expect(parseGlyphs("[1,2]")).toEqual(emptyGlyphs());
  });
});

describe("pad and em", () => {
  it("trims to the ink with a side bearing and works out the advance", () => {
    const v = variantFromPad([[400, 162, 0.5, 400 + PAD_EM / 2, PAD_BASELINE_Y, 0.7]]);
    expect(v.strokes[0][0]).toBeCloseTo(0.06);
    expect(v.strokes[0][1]).toBeCloseTo(-100 / PAD_EM);
    expect(v.strokes[0][5]).toBe(0.7);
    expect(v.advance).toBeCloseTo(0.5 + 0.12);
  });

  it("puts a saved variant back on the pad at the glyph origin", () => {
    const v = variantFromPad([[400, 162, 0.5, 430, 262, 0.5]]);
    const [x, y] = variantToPad(v)[0];
    expect(x).toBeCloseTo(PAD_ORIGIN_X + 0.06 * PAD_EM);
    expect(y).toBeCloseTo(162, 1);
  });
});

describe("variants", () => {
  it("are stable for the same element and position, and differ across positions", () => {
    expect(pickVariant("el-1", 4, 3)).toBe(pickVariant("el-1", 4, 3));
    const picks = new Set(Array.from({ length: 30 }, (_, i) => pickVariant("el-1", i, 3)));
    expect(picks.size).toBe(3);
    expect(pickVariant("anything", 9, 1)).toBe(0);
  });
});
