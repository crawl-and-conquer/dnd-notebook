import { getStroke } from "perfect-freehand";
import type { Character } from "../model/character";
import { drawnVariants, pickVariant, variantSeed, type GlyphVariant, type Hand } from "../model/hand";

/**
 * Lays out and draws text in a character's hand (SPEC: Handwriting builder, Rendering).
 * Drawn glyphs are scaled so the hand's x-height matches Caveat's at the same size; letters
 * not drawn yet fall back to Caveat on the same baseline. Lines are one ruled line (32 px)
 * tall, with the baseline just above the rule, so writing sits on the page's lines.
 */

export type HandStyle = Character["hand"];

export const RULE = 32;
/** Baseline below the top of a 32 px line (the rule sits 2 px below it). */
const BASELINE_IN_LINE = 25;

export type TextSpec = {
  text: string;
  width: number;
  fontSize: number;
  font: "hand" | "print";
  heading?: boolean;
  elementId: string;
};

type Placed =
  | { kind: "glyph"; ch: string; variant: GlyphVariant; seed: number }
  | { kind: "font"; ch: string };
type Item = Placed & { x: number };

export type LaidLine = { top: number; baseline: number; width: number; items: Item[] };
export type Laid = {
  lines: LaidLine[];
  height: number;
  lineHeight: number;
  /** Pixels per em for drawn glyphs. */
  scale: number;
  fontPx: number;
  fontCss: string;
  strokeWidth: number;
  missing: Set<string>;
};

export function lineHeightFor(fontSize: number): number {
  return RULE * Math.max(1, Math.ceil((fontSize * 1.05) / RULE - 0.01));
}

// ----- measuring -----

let measureCtx: CanvasRenderingContext2D | null = null;
const ctx2d = () => {
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
  return measureCtx;
};
const widthCache = new Map<string, number>();
let caveatX: number | null = null;

/** Fonts finished loading: measurements taken before then were of a fallback font. */
export function resetHandMeasures() {
  widthCache.clear();
  caveatX = null;
}

function charWidth(fontCss: string, ch: string): number {
  const k = `${fontCss}|${ch}`;
  let w = widthCache.get(k);
  if (w === undefined) {
    const c = ctx2d();
    if (!c) return 10;
    c.font = fontCss;
    w = c.measureText(ch).width;
    widthCache.set(k, w);
  }
  return w;
}

/** Caveat's x-height as a fraction of its font size. */
function caveatXHeight(): number {
  if (caveatX === null) {
    const c = ctx2d();
    if (!c) return 0.43;
    c.font = "400 100px Caveat";
    const m = c.measureText("x");
    caveatX = m.actualBoundingBoxAscent > 0 ? m.actualBoundingBoxAscent / 100 : 0.43;
  }
  return caveatX;
}

// ----- layout -----

const layoutCache = new Map<string, Laid>();

export function layoutText(spec: TextSpec, hand: Hand | null, style: HandStyle): Laid {
  const key = JSON.stringify([spec, style, hand ? handKey(hand) : 0]);
  const hit = layoutCache.get(key);
  if (hit) return hit;
  const laid = doLayout(spec, hand, style);
  if (layoutCache.size > 3000) layoutCache.clear();
  layoutCache.set(key, laid);
  return laid;
}

const handKeys = new WeakMap<Hand, number>();
let handCounter = 0;
function handKey(hand: Hand): number {
  let k = handKeys.get(hand);
  if (k === undefined) handKeys.set(hand, (k = ++handCounter));
  return k;
}

export function clearLayoutCache() {
  layoutCache.clear();
}

function doLayout(spec: TextSpec, hand: Hand | null, style: HandStyle): Laid {
  const printed = spec.font === "print";
  const size = printed ? 1 : style.size / 100;
  const fontPx = spec.fontSize * size;
  const weight = spec.heading ? 700 : printed ? 500 : 400;
  const fontCss = printed
    ? `${weight} ${fontPx}px "Alegreya Sans"`
    : `${weight} ${fontPx}px Caveat`;
  const metrics = hand?.metrics;
  const scale = metrics && metrics.xHeight > 0 ? (fontPx * caveatXHeight()) / metrics.xHeight : fontPx;
  const extra = printed ? 0 : (style.spacing / 100) * spec.fontSize * 0.3;
  const lineHeight = lineHeightFor(spec.fontSize);
  const baselineInLine = BASELINE_IN_LINE + (lineHeight - RULE);
  const missing = new Set<string>();

  // Every character in order, so variant choice uses its position in the whole text.
  type Tok = { ch: string; pos: number; w: number; item: Placed | null };
  let pos = 0;
  const measure = (ch: string): Tok => {
    const p = pos++;
    if (ch === " ") return { ch, pos: p, w: charWidth(fontCss, " ") + extra, item: null };
    if (!printed && hand) {
      const vs = drawnVariants(hand, ch);
      if (vs.length) {
        const variant = vs[pickVariant(spec.elementId, p, vs.length)];
        return {
          ch,
          pos: p,
          w: variant.advance * scale + extra,
          item: { kind: "glyph", ch, variant, seed: variantSeed(spec.elementId, p) },
        };
      }
      if (/\S/.test(ch)) missing.add(ch);
    }
    return { ch, pos: p, w: charWidth(fontCss, ch) + extra, item: { kind: "font", ch } };
  };

  const lines: LaidLine[] = [];
  const push = (items: Item[], width: number) => {
    const top = lines.length * lineHeight;
    lines.push({ top, baseline: top + baselineInLine, width, items });
  };

  const paragraphs = spec.text.split("\n");
  for (const para of paragraphs) {
    let items: Item[] = [];
    let x = 0;
    const words = para.split(/( +)/);
    for (const word of words) {
      if (word === "") continue;
      const toks = [...word].map(measure);
      const w = toks.reduce((a, t) => a + t.w, 0);
      const isSpace = /^ +$/.test(word);
      if (!isSpace && x > 0 && x + w > spec.width) {
        push(items, x);
        items = [];
        x = 0;
      }
      if (isSpace && x === 0 && items.length === 0 && lines.length > 0) continue;
      for (const t of toks) {
        // A single word wider than the line breaks where it must.
        if (!isSpace && x > 0 && x + t.w > spec.width && w > spec.width) {
          push(items, x);
          items = [];
          x = 0;
        }
        if (t.item) items.push({ ...t.item, x });
        x += t.w;
      }
    }
    push(items, x);
    pos++; // the newline
  }

  return {
    lines,
    height: lines.length * lineHeight,
    lineHeight,
    scale,
    fontPx,
    fontCss,
    strokeWidth: scale * (spec.heading ? 0.12 : 0.085),
    missing,
  };
}

// ----- drawing -----

const rand = (seed: number, i: number) => {
  const x = Math.sin(seed * 0.000123 + i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

const outlineCache = new Map<string, Path2D>();

function glyphPaths(variant: GlyphVariant, laid: Laid, style: HandStyle, seed: number): Path2D[] {
  const wob = style.wobble / 100;
  const shear = Math.tan((style.slant * Math.PI) / 180);
  const key = `${laid.scale.toFixed(3)}|${laid.strokeWidth.toFixed(3)}|${style.slant}|${wob}|${wob ? seed : 0}`;
  return variant.strokes.map((stroke, si) => {
    const k = `${key}|${si}|${stroke.length}|${stroke[0]}|${stroke[1]}|${stroke[stroke.length - 2]}`;
    let path = outlineCache.get(k);
    if (path) return path;
    const dx = (rand(seed, 1) - 0.5) * wob * 0.08;
    const dy = (rand(seed, 2) - 0.5) * wob * 0.06;
    const rot = (rand(seed, 3) - 0.5) * wob * 0.14;
    const cx = variant.advance / 2;
    const cy = -0.25;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const pts: [number, number, number][] = [];
    let simulated = true;
    for (let i = 0; i + 2 < stroke.length; i += 3) {
      let x = stroke[i] - cx;
      let y = stroke[i + 1] - cy;
      [x, y] = [x * cos - y * sin + cx + dx, x * sin + y * cos + cy + dy];
      x += -y * shear;
      if (stroke[i + 2] !== 0.5) simulated = false;
      pts.push([x * laid.scale, y * laid.scale, stroke[i + 2]]);
    }
    const outline = getStroke(pts, {
      size: laid.strokeWidth * 1.6,
      thinning: 0.45,
      smoothing: 0.5,
      streamline: 0.35,
      simulatePressure: simulated,
      last: true,
    });
    path = new Path2D();
    if (outline.length) {
      path.moveTo(outline[0][0], outline[0][1]);
      for (let i = 1; i < outline.length; i++) path.lineTo(outline[i][0], outline[i][1]);
      path.closePath();
    }
    if (outlineCache.size > 20000) outlineCache.clear();
    outlineCache.set(k, path);
    return path;
  });
}

export type DrawOptions = {
  colour: string;
  /** Underline letters the hand has not drawn yet (the builder preview). */
  markMissing?: string;
  /** Strike through each line (ticked checklist items). */
  strike?: boolean;
};

export function drawLaid(
  c: CanvasRenderingContext2D,
  laid: Laid,
  style: HandStyle,
  opts: DrawOptions,
  x0 = 0,
  y0 = 0,
) {
  c.save();
  c.fillStyle = opts.colour;
  c.textBaseline = "alphabetic";
  c.font = laid.fontCss;
  for (const line of laid.lines) {
    const by = y0 + line.baseline;
    for (const it of line.items) {
      if (it.kind === "font") {
        c.fillStyle = opts.colour;
        c.fillText(it.ch, x0 + it.x, by);
        if (opts.markMissing && /\S/.test(it.ch)) {
          const w = c.measureText(it.ch).width;
          c.save();
          c.strokeStyle = opts.markMissing;
          c.lineWidth = 1.2;
          c.beginPath();
          for (let i = 0; i <= Math.ceil(w / 3); i++) {
            const px = x0 + it.x + Math.min(w, i * 3);
            const py = by + 6 + (i % 2 ? 1.5 : -1.5);
            if (i === 0) c.moveTo(px, py);
            else c.lineTo(px, py);
          }
          c.stroke();
          c.restore();
        }
      } else {
        c.save();
        c.translate(x0 + it.x, by);
        for (const p of glyphPaths(it.variant, laid, style, it.seed)) c.fill(p);
        c.restore();
      }
    }
    if (opts.strike && line.width > 0) {
      c.save();
      c.strokeStyle = opts.colour;
      c.lineWidth = Math.max(1.5, laid.strokeWidth * 0.9);
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(x0 - 2, by - laid.fontPx * 0.22);
      c.lineTo(x0 + line.width + 2, by - laid.fontPx * 0.26);
      c.stroke();
      c.restore();
    }
  }
  c.restore();
}
