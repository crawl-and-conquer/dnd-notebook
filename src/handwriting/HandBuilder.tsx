import { getStroke } from "perfect-freehand";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Character } from "../model/character";
import {
  GLYPHS,
  MAX_VARIANTS,
  PAD_ASCENDER_Y,
  PAD_BASELINE_Y,
  PAD_CAP_Y,
  PAD_DESCENDER_Y,
  PAD_H,
  PAD_ORIGIN_X,
  PAD_W,
  PAD_XHEIGHT_Y,
  drawnCount as countDrawn,
  variantFromPad,
  variantToPad,
  type Hand,
} from "../model/hand";
import { drawLaid, layoutText } from "./handLayout";
import { useNotebook } from "../store/notebook";
import { useFontsVersion } from "../canvas/HandContext";
import { NotebookMark } from "../components/Icons";

const PREVIEW_LINES = ["Cosworth tends the heartseed at dawn.", "Quick, find the zither - 6 gp!"];
const INK = "#2b2622";
const PAPER = "#f3e8d0";
const LABEL = "#a0493e";
const PAD_STROKE = 7;

/** Pad strokes for each glyph's variants while editing (pad units, converted to em on save). */
type Draft = Record<string, number[][][]>;

function draftFrom(hand: Hand): Draft {
  const d: Draft = {};
  for (const [ch, g] of Object.entries(hand.glyphs)) d[ch] = g.variants.map(variantToPad);
  return d;
}

function handFrom(draft: Draft, base: Hand): Hand {
  const glyphs: Hand["glyphs"] = {};
  for (const [ch, variants] of Object.entries(draft)) {
    const vs = variants.filter((v) => v.length > 0).slice(0, MAX_VARIANTS).map(variantFromPad);
    if (vs.length) glyphs[ch] = { variants: vs };
  }
  return { ...base, glyphs };
}

const drawn = (draft: Draft, ch: string) => (draft[ch] ?? []).some((v) => v.length > 0);

function fillStroke(c: CanvasRenderingContext2D, pts: number[], size: number) {
  if (pts.length < 3) return;
  const points: [number, number, number][] = [];
  let simulated = true;
  for (let i = 0; i + 2 < pts.length; i += 3) {
    points.push([pts[i], pts[i + 1], pts[i + 2]]);
    if (pts[i + 2] !== 0.5) simulated = false;
  }
  const outline = getStroke(points, {
    size,
    thinning: 0.45,
    smoothing: 0.5,
    streamline: 0.35,
    simulatePressure: simulated,
    last: true,
  });
  if (!outline.length) return;
  c.beginPath();
  c.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) c.lineTo(outline[i][0], outline[i][1]);
  c.closePath();
  c.fill();
}

/** Sizes a canvas to its box at device resolution and returns a context in CSS pixels. */
function fitCanvas(canvas: HTMLCanvasElement): { c: CanvasRenderingContext2D; w: number; h: number } | null {
  const c = canvas.getContext("2d");
  if (!c) return null;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { c, w, h };
}

type Props = {
  characterId: string;
  glyphs: Hand;
  hand: Character["hand"];
  onClose(): void;
};

export function HandBuilder({ characterId, glyphs, hand, onClose }: Props) {
  const saveGlyphs = useNotebook((s) => s.saveGlyphs);
  const updateHandSettings = useNotebook((s) => s.updateHandSettings);
  const name = useNotebook((s) => s.config.characters.find((c) => c.id === characterId)?.name ?? "");
  const fonts = useFontsVersion((s) => s.version);

  const [draft, setDraft] = useState<Draft>(() => draftFrom(glyphs));
  const [style, setStyle] = useState<Character["hand"]>({ ...hand });
  const [selChar, setSelChar] = useState("a");
  const [varIdx, setVarIdx] = useState(0);
  const [live, setLive] = useState<number[]>([]);
  const drawing = useRef(false);
  const padRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);

  const variants = useMemo(() => draft[selChar] ?? [], [draft, selChar]);
  const strokes = useMemo(() => variants[varIdx] ?? [], [variants, varIdx]);
  const variantCount = Math.max(1, variants.length);
  const done = [...GLYPHS].filter((c) => drawn(draft, c)).length;
  const previewHand = useMemo(() => handFrom(draft, glyphs), [draft, glyphs]);

  // ----- the pad -----
  useLayoutEffect(() => {
    const canvas = padRef.current;
    if (!canvas) return;
    const fit = fitCanvas(canvas);
    if (!fit) return;
    const { c, w, h } = fit;
    const sc = Math.min(w / PAD_W, h / PAD_H);
    c.fillStyle = PAPER;
    c.fillRect(0, 0, w, h);
    c.save();
    c.translate((w - PAD_W * sc) / 2, (h - PAD_H * sc) / 2);
    c.scale(sc, sc);
    const guides = [
      { y: PAD_ASCENDER_Y, label: "ASCENDER", dash: [] as number[], wd: 1.2, a: 0.4 },
      { y: PAD_CAP_Y, label: "CAPITAL", dash: [2, 5], wd: 1.4, a: 0.5 },
      { y: PAD_XHEIGHT_Y, label: "X-HEIGHT", dash: [8, 6], wd: 1.4, a: 0.6 },
      { y: PAD_BASELINE_Y, label: "BASELINE", dash: [], wd: 2.2, a: 0.85 },
      { y: PAD_DESCENDER_Y, label: "DESCENDER", dash: [], wd: 1.2, a: 0.4 },
    ];
    for (const g of guides) {
      c.save();
      c.globalAlpha = g.a;
      c.strokeStyle = "rgb(201,74,62)";
      c.lineWidth = g.wd;
      c.setLineDash(g.dash);
      c.beginPath();
      c.moveTo(PAD_ORIGIN_X - 6, g.y);
      c.lineTo(PAD_W - 16, g.y);
      c.stroke();
      c.restore();
      c.fillStyle = LABEL;
      c.font = "700 12px 'Alegreya Sans', sans-serif";
      c.letterSpacing = "1.5px";
      c.fillText(g.label, 16, g.y - 4);
    }
    // A faint ghost of the previous variant (or the first, while drawing a new one).
    const ghost = variants[varIdx - 1] ?? (varIdx === 0 ? undefined : variants[0]);
    if (ghost?.length) {
      c.fillStyle = "rgba(107,74,46,0.22)";
      for (const s of ghost) fillStroke(c, s, PAD_STROKE);
      c.fillStyle = "#6b4a2e";
      c.font = "20px Caveat";
      c.letterSpacing = "0px";
      c.fillText(`ghost of variant ${varIdx}`, 404, 350);
    }
    c.fillStyle = INK;
    for (const s of strokes) fillStroke(c, s, PAD_STROKE);
    if (live.length >= 3) fillStroke(c, live, PAD_STROKE);
    c.restore();
  }, [strokes, live, variants, varIdx, fonts]);

  // ----- the preview strip -----
  useLayoutEffect(() => {
    const canvas = previewRef.current;
    if (!canvas) return;
    const fit = fitCanvas(canvas);
    if (!fit) return;
    const { c, w, h } = fit;
    c.fillStyle = PAPER;
    c.fillRect(0, 0, w, h);
    const fontSize = 38;
    const lineH = 48;
    c.strokeStyle = "rgba(201,96,84,0.32)";
    c.lineWidth = 1;
    for (let y = lineH - 0.5; y < h; y += lineH) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(w, y);
      c.stroke();
    }
    c.strokeStyle = "rgba(201,74,62,0.5)";
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(46.75, 0);
    c.lineTo(46.75, h);
    c.stroke();
    PREVIEW_LINES.forEach((text, i) => {
      const laid = layoutText(
        { text, width: 4000, fontSize, font: "hand", elementId: `preview-${i}` },
        previewHand,
        style,
      );
      // layoutText puts the baseline 25 px into a 32 px line; the strip's lines are 48 px.
      drawLaid(c, laid, style, { colour: INK, markMissing: "rgba(142,42,42,0.55)" }, 68, i * lineH + 12);
    });
  }, [previewHand, style, fonts]);

  // ----- drawing -----
  const padPoint = (e: React.PointerEvent<HTMLCanvasElement>): [number, number, number] => {
    const canvas = padRef.current!;
    const r = canvas.getBoundingClientRect();
    const sc = Math.min(r.width / PAD_W, r.height / PAD_H);
    const ox = (r.width - PAD_W * sc) / 2;
    const oy = (r.height - PAD_H * sc) / 2;
    const p = e.pointerType === "pen" && e.pressure > 0 ? e.pressure : 0.5;
    return [(e.clientX - r.left - ox) / sc, (e.clientY - r.top - oy) / sc, p];
  };

  const setVariantStrokes = useCallback(
    (ch: string, vi: number, next: number[][]) =>
      setDraft((d) => {
        const vs = [...(d[ch] ?? [])];
        while (vs.length <= vi) vs.push([]);
        vs[vi] = next;
        while (vs.length > 1 && vs[vs.length - 1].length === 0 && vs.length - 1 !== vi) vs.pop();
        return { ...d, [ch]: vs };
      }),
    [],
  );

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    setLive(padPoint(e));
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const p = padPoint(e);
    setLive((prev) => {
      const n = prev.length;
      if (n >= 3 && Math.hypot(p[0] - prev[n - 3], p[1] - prev[n - 2]) < 0.8) return prev;
      return [...prev, ...p];
    });
  };
  const onUp = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const stroke = live.length === 3 ? [...live, live[0] + 0.5, live[1] + 0.5, live[2]] : live;
    setLive([]);
    if (stroke.length >= 6) setVariantStrokes(selChar, varIdx, [...strokes, stroke]);
  };

  const undoStroke = () => setVariantStrokes(selChar, varIdx, strokes.slice(0, -1));
  const clearLetter = () => setVariantStrokes(selChar, varIdx, []);
  const addVariant = () => {
    const next = variants.length;
    if (next >= MAX_VARIANTS) return;
    setVariantStrokes(selChar, next, []);
    setVarIdx(next);
  };
  const go = useCallback((delta: number) => {
    setSelChar((cur) => GLYPHS[(GLYPHS.indexOf(cur) + delta + GLYPHS.length) % GLYPHS.length]);
    setVarIdx(0);
  }, []);

  const save = async () => {
    await saveGlyphs(characterId, handFrom(draft, glyphs));
    await updateHandSettings(characterId, style);
    onClose();
  };

  // Arrow keys move between letters; Escape discards; Ctrl+Z undoes a stroke.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement && e.target.type !== "range";
      if (typing) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        go(e.key === "ArrowRight" ? 1 : -1);
      } else if (e.ctrlKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        setVariantStrokes(selChar, varIdx, strokes.slice(0, -1));
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [go, onClose, selChar, varIdx, strokes, setVariantStrokes]);

  const prevChar = GLYPHS[(GLYPHS.indexOf(selChar) - 1 + GLYPHS.length) % GLYPHS.length];
  const nextChar = GLYPHS[(GLYPHS.indexOf(selChar) + 1) % GLYPHS.length];
  const kind = /[A-Z]/.test(selChar) ? "Upper case" : /[a-z]/.test(selChar) ? "Lower case" : /\d/.test(selChar) ? "Number" : "Punctuation";

  return (
    <div className="hand-builder" role="dialog" aria-modal="true" aria-label={`${name}'s handwriting`}>
      <header className="hb-bar">
        <div className="brand">
          <NotebookMark />
          <span>Notebook</span>
        </div>
        <div className="hb-crumb">
          <span>{name}</span>
          <span aria-hidden="true">›</span>
          <b>Handwriting</b>
        </div>
        <div className="hb-end">
          <button className="hb-btn ghost" onClick={onClose}>
            Discard changes
          </button>
          <button className="hb-btn go" onClick={() => void save()}>
            Use this hand
          </button>
        </div>
      </header>

      <div className="hb-wrap">
        <section className="hb-panel">
          <div className="hb-ph">
            <h2>{name}'s hand</h2>
            <span>
              {done} of {GLYPHS.length} drawn
            </span>
          </div>
          <div className="hb-prog" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={GLYPHS.length} aria-label="Letters drawn">
            <i style={{ width: `${(done / GLYPHS.length) * 100}%` }} />
          </div>
          <div className="hb-glyphs" role="listbox" aria-label="Letters">
            {[...GLYPHS].map((ch) => {
              const isDrawn = drawn(draft, ch);
              return (
                <button
                  key={ch}
                  role="option"
                  aria-selected={ch === selChar}
                  aria-label={`${isDrawn ? "Drawn" : "Not drawn yet"}: ${ch}`}
                  className={`hb-g ${isDrawn ? "drawn" : "empty"}${ch === selChar ? " sel" : ""}`}
                  onClick={() => {
                    setSelChar(ch);
                    setVarIdx(0);
                  }}
                >
                  {ch}
                </button>
              );
            })}
          </div>
          <div className="hb-legend">
            <span>
              <i className="drawn" />
              Drawn
            </span>
            <span>
              <i className="empty" />
              Falls back to the base hand
            </span>
          </div>
        </section>

        <section className="hb-panel">
          <div className="hb-ph">
            <h2>Draw “{selChar}”</h2>
            <span>
              {kind} · variant {varIdx + 1} of {variantCount}
            </span>
          </div>
          <div className="hb-padwrap">
            <canvas
              ref={padRef}
              className="hb-pad"
              aria-label={`Drawing pad for ${selChar}. Draw between the guide lines.`}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
            />
            <div className="hb-tools">
              <p className="hb-k">Variants</p>
              <div className="hb-var">
                {Array.from({ length: variantCount }).map((_, vi) => (
                  <button
                    key={vi}
                    className={vi === varIdx ? "on" : ""}
                    aria-label={`Variant ${vi + 1}`}
                    aria-pressed={vi === varIdx}
                    onClick={() => setVarIdx(vi)}
                  >
                    {(variants[vi]?.length ?? 0) > 0 ? selChar : <small>{vi + 1}</small>}
                  </button>
                ))}
                {variants.length < MAX_VARIANTS && (variants[variants.length - 1]?.length ?? 0) > 0 && (
                  <button className="add" aria-label={`Draw variant ${variants.length + 1}`} onClick={addVariant}>
                    +
                  </button>
                )}
              </div>
              <p className="hb-note">The notebook picks a variant at random so repeated letters don't look stamped.</p>
              <button className="hb-tool" onClick={undoStroke} disabled={!strokes.length}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M9 14L4 9l5-5" />
                  <path d="M4 9h10a6 6 0 010 12h-3" />
                </svg>
                Undo stroke
              </button>
              <button className="hb-tool" onClick={clearLetter} disabled={!strokes.length}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M9 20h11M4.5 15.5l9-10 6.5 6-8.5 8.5H8.5z" />
                </svg>
                Clear letter
              </button>
              <div className="hb-nav">
                <button className="hb-tool center" onClick={() => go(-1)} aria-label={`Previous letter, ${prevChar}`}>
                  ‹ {prevChar}
                </button>
                <button className="hb-tool center" onClick={() => go(1)} aria-label={`Next letter, ${nextChar}`}>
                  {nextChar} ›
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="hb-panel hb-preview">
          <div className="hb-preview-text">
            <div className="hb-ph">
              <h2>Preview</h2>
              <span>Underlined letters aren't drawn yet</span>
            </div>
            <canvas ref={previewRef} className="hb-strip" aria-label={`Preview: ${PREVIEW_LINES.join(" ")}`} />
          </div>
          <div className="hb-sliders">
            {(
              [
                { key: "size", label: "Size", min: 70, max: 140, fmt: (v: number) => `${v}%` },
                { key: "slant", label: "Slant", min: -15, max: 15, fmt: (v: number) => `${v}°` },
                { key: "spacing", label: "Spacing", min: -20, max: 40, fmt: (v: number) => (v > 0 ? `+${v}` : `${v}`) },
                { key: "wobble", label: "Wobble", min: 0, max: 100, fmt: (v: number) => `${v}%` },
              ] as const
            ).map(({ key, label, min, max, fmt }) => (
              <div key={key} className="hb-sl">
                <label htmlFor={`hb-${key}`}>{label}</label>
                <input
                  id={`hb-${key}`}
                  type="range"
                  min={min}
                  max={max}
                  value={style[key]}
                  onChange={(e) => setStyle((h) => ({ ...h, [key]: Number(e.target.value) }))}
                />
                <output htmlFor={`hb-${key}`}>{fmt(style[key])}</output>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

/** How many of the 70 glyphs a hand has; re-exported for the status bar. */
export const glyphsDrawn = countDrawn;
