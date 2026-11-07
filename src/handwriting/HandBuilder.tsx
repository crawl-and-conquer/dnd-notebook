import { getStroke } from "perfect-freehand";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Character } from "../model/character";
import {
  GLYPHS,
  PAD_ASCENDER_Y,
  PAD_BASELINE_Y,
  PAD_CAP_Y,
  PAD_DESCENDER_Y,
  PAD_H,
  PAD_W,
  PAD_XHEIGHT_Y,
  pickVariant,
  type GlyphsData,
} from "../model/hand";
import { glyphAdvance, glyphStrokePath } from "./glyphPaths";
import { useNotebook } from "../store/notebook";

const PREVIEW_TEXT = [
  "the quick brown fox jumps over",
  "Quick! Zither & drums — 6 gp.",
];

function pathFromOutline(outline: number[][]): string {
  if (outline.length === 0) return "";
  let d = `M${outline[0][0].toFixed(1)},${outline[0][1].toFixed(1)}`;
  for (let i = 1; i < outline.length; i++)
    d += `L${outline[i][0].toFixed(1)},${outline[i][1].toFixed(1)}`;
  return d + "Z";
}

function strokesToPath(stroke: number[], strokeWidth: number): string {
  if (stroke.length < 6) return "";
  const pts: [number, number, number][] = [];
  for (let i = 0; i + 2 < stroke.length; i += 3) {
    pts.push([stroke[i], stroke[i + 1], stroke[i + 2]]);
  }
  const outline = getStroke(pts, {
    size: strokeWidth,
    thinning: 0.4,
    smoothing: 0.5,
    streamline: 0.4,
    simulatePressure: false,
    last: true,
  });
  return pathFromOutline(outline);
}

/** Draw a live (in-progress) stroke on a canvas context. */
function drawLiveStroke(
  ctx: CanvasRenderingContext2D,
  pts: number[],
  strokeWidth: number,
  colour: string,
) {
  if (pts.length < 6) return;
  const points: [number, number, number][] = [];
  for (let i = 0; i + 2 < pts.length; i += 3) {
    points.push([pts[i], pts[i + 1], pts[i + 2]]);
  }
  const outline = getStroke(points, { size: strokeWidth, thinning: 0.4, smoothing: 0.5, streamline: 0.4, simulatePressure: false });
  if (outline.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) ctx.lineTo(outline[i][0], outline[i][1]);
  ctx.closePath();
  ctx.fillStyle = colour;
  ctx.fill();
}

/** Render all strokes for a variant onto a canvas (pad coords). */
function renderVariantToCanvas(
  ctx: CanvasRenderingContext2D,
  strokes: number[][],
  strokeWidth: number,
  colour: string,
  alpha = 1,
) {
  ctx.globalAlpha = alpha;
  for (const s of strokes) {
    const d = strokesToPath(s, strokeWidth);
    if (d) {
      ctx.fillStyle = colour;
      const p = new Path2D(d);
      ctx.fill(p);
    }
  }
  ctx.globalAlpha = 1;
}

type Props = {
  characterId: string;
  glyphs: GlyphsData;
  hand: Character["hand"];
  onClose(): void;
};

export function HandBuilder({ characterId, glyphs, hand, onClose }: Props) {
  const saveGlyphs = useNotebook((s) => s.saveGlyphs);
  const updateHandSettings = useNotebook((s) => s.updateHandSettings);

  const [localGlyphs, setLocalGlyphs] = useState<GlyphsData>(() => JSON.parse(JSON.stringify(glyphs)) as GlyphsData);
  const [localHand, setLocalHand] = useState<Character["hand"]>({ ...hand });
  const [selChar, setSelChar] = useState("a");
  const [varIdx, setVarIdx] = useState(0);

  const [livePoints, setLivePoints] = useState<number[]>([]);
  const drawing = useRef(false);

  const padRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);

  const currentStrokes = localGlyphs[selChar]?.[varIdx] ?? [];
  const numVariants = localGlyphs[selChar]?.length ?? 0;
  const drawnCount = GLYPHS.split("").filter((c) => (localGlyphs[c]?.length ?? 0) > 0 && (localGlyphs[c]?.[0]?.length ?? 0) > 0).length;
  const PAD_STROKE_W = 7;

  // Render the drawing pad
  const renderPad = useCallback(() => {
    const canvas = padRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.scale(dpr, dpr);
    }

    // Scale so pad coords (600x380) fill the canvas
    const sx = W / PAD_W;
    const sy = H / PAD_H;
    const sc = Math.min(sx, sy);
    const ox = (W - PAD_W * sc) / 2;
    const oy = (H - PAD_H * sc) / 2;

    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = "#f3e8d0";
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(sc, sc);

    // Guide lines
    const guides = [
      { y: PAD_ASCENDER_Y, label: "ASCENDER", dash: [], w: 1.5, alpha: 0.35 },
      { y: PAD_CAP_Y, label: "CAPITAL", dash: [3, 6], w: 1.5, alpha: 0.35 },
      { y: PAD_XHEIGHT_Y, label: "X-HEIGHT", dash: [8, 6], w: 1.5, alpha: 0.55 },
      { y: PAD_BASELINE_Y, label: "BASELINE", dash: [], w: 2.2, alpha: 0.8 },
      { y: PAD_DESCENDER_Y, label: "DESCENDER", dash: [], w: 1.5, alpha: 0.35 },
    ];
    for (const g of guides) {
      ctx.save();
      ctx.globalAlpha = g.alpha;
      ctx.strokeStyle = "rgba(201,74,62,1)";
      ctx.lineWidth = g.w;
      ctx.setLineDash(g.dash);
      ctx.beginPath();
      ctx.moveTo(110, g.y);
      ctx.lineTo(PAD_W - 16, g.y);
      ctx.stroke();

      ctx.globalAlpha = 0.7;
      ctx.fillStyle = "#a0493e";
      ctx.font = "700 11px 'Alegreya Sans', sans-serif";
      ctx.letterSpacing = "1.5px";
      ctx.fillText(g.label, 6, g.y - 2);
      ctx.restore();
    }

    // Ghost of previous variant (at reduced opacity)
    if (numVariants > 1) {
      const prevVi = (varIdx + numVariants - 1) % numVariants;
      const prevStrokes = localGlyphs[selChar]?.[prevVi] ?? [];
      renderVariantToCanvas(ctx, prevStrokes, PAD_STROKE_W, "#2b2622", 0.15);
    }

    // Committed strokes
    renderVariantToCanvas(ctx, currentStrokes, PAD_STROKE_W, "#2b2622", 1);

    // Live stroke
    if (livePoints.length >= 6) {
      drawLiveStroke(ctx, livePoints, PAD_STROKE_W, "#2b2622");
    }

    ctx.restore();
  }, [selChar, varIdx, localGlyphs, currentStrokes, livePoints, numVariants]);

  useEffect(() => { renderPad(); }, [renderPad]);

  // Render the preview canvas
  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.scale(dpr, dpr);
    }

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#f3e8d0";
    ctx.fillRect(0, 0, W, H);

    const fontSize = 38;
    const lineH = 48;
    const scale = (fontSize * (localHand.size / 100)) / 100;
    const spacing = localHand.spacing * scale;
    const strokeW = Math.max(1.5, fontSize * 0.025);
    const baselineY = fontSize * 0.78;
    const glyphOriginY = -(PAD_BASELINE_Y * scale) + baselineY;

    // Rule lines
    ctx.strokeStyle = "rgba(201,96,84,0.3)";
    ctx.lineWidth = 1;
    for (let ly = lineH; ly < H; ly += lineH) {
      ctx.beginPath();
      ctx.moveTo(68, ly);
      ctx.lineTo(W, ly);
      ctx.stroke();
    }
    // Margin line
    ctx.strokeStyle = "rgba(201,74,62,0.5)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(68, 0);
    ctx.lineTo(68, H);
    ctx.stroke();

    let charPos = 0;
    PREVIEW_TEXT.forEach((line, li) => {
      let x = 72;
      const lineY = li * lineH + 4;

      for (const ch of line) {
        if (ch === " ") {
          x += fontSize * 0.3 + spacing;
          charPos++;
          continue;
        }
        const g = localGlyphs[ch];
        if (!g || g.length === 0 || g[0].length === 0) {
          // Fallback: Caveat
          ctx.font = `400 ${fontSize}px 'Caveat', cursive`;
          ctx.fillStyle = "#8e2a2a";
          ctx.fillText(ch, x, lineY + fontSize * 0.78);
          // Underline for missing chars
          ctx.strokeStyle = "rgba(142,42,42,0.45)";
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 3]);
          ctx.beginPath();
          ctx.moveTo(x, lineY + fontSize * 0.9 + 4);
          ctx.lineTo(x + fontSize * 0.5, lineY + fontSize * 0.9 + 4);
          ctx.stroke();
          ctx.setLineDash([]);
          x += fontSize * 0.5 + spacing;
        } else {
          const vi = pickVariant(ch.charCodeAt(0), charPos, g.length);
          const variant = g[vi] ?? g[0];
          const opts = { scale, slant: localHand.slant, wobble: localHand.wobble, strokeWidth: strokeW };
          ctx.save();
          ctx.translate(x, lineY + glyphOriginY);
          ctx.fillStyle = "#2b2622";
          for (let si = 0; si < variant.length; si++) {
            const d = glyphStrokePath(variant[si], opts, ch.charCodeAt(0) * 0.137 + charPos * 0.019 + si * 0.07);
            if (d) {
              const p = new Path2D(d);
              ctx.fill(p);
            }
          }
          ctx.restore();
          x += glyphAdvance(variant) * scale + spacing;
        }
        charPos++;
      }
    });
  }, [localGlyphs, localHand]);

  // Pad pointer events
  function padCoords(e: React.PointerEvent<HTMLCanvasElement>): [number, number] {
    const canvas = padRef.current!;
    const rect = canvas.getBoundingClientRect();
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    const sc = Math.min(W / PAD_W, H / PAD_H);
    const ox = (W - PAD_W * sc) / 2;
    const oy = (H - PAD_H * sc) / 2;
    const x = (e.clientX - rect.left - ox) / sc;
    const y = (e.clientY - rect.top - oy) / sc;
    return [x, y];
  }

  function onPadDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const [x, y] = padCoords(e);
    setLivePoints([x, y, e.pressure || 0.5]);
  }

  function onPadMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const [x, y] = padCoords(e);
    setLivePoints((prev) => [...prev, x, y, e.pressure || 0.5]);
  }

  function onPadUp() {
    if (!drawing.current || livePoints.length < 6) {
      drawing.current = false;
      setLivePoints([]);
      return;
    }
    drawing.current = false;
    const stroke = [...livePoints];
    setLivePoints([]);
    setLocalGlyphs((prev) => {
      const existing = prev[selChar] ? [...prev[selChar]] : [[]];
      // Ensure the variant slot exists
      while (existing.length <= varIdx) existing.push([]);
      const updatedVariant = [...(existing[varIdx] ?? []), stroke];
      const updated = [...existing];
      updated[varIdx] = updatedVariant;
      return { ...prev, [selChar]: updated };
    });
  }

  function undoStroke() {
    setLocalGlyphs((prev) => {
      const existing = prev[selChar];
      if (!existing?.[varIdx]?.length) return prev;
      const updatedVariant = existing[varIdx].slice(0, -1);
      const updated = [...existing];
      updated[varIdx] = updatedVariant;
      // If the variant is now empty and it's the last one, remove it
      const cleaned = [...updated];
      while (cleaned.length > 0 && (cleaned[cleaned.length - 1]?.length ?? 0) === 0) {
        cleaned.pop();
      }
      return { ...prev, [selChar]: cleaned.length > 0 ? cleaned : [] };
    });
  }

  function clearLetter() {
    setLocalGlyphs((prev) => {
      const existing = prev[selChar];
      if (!existing?.[varIdx]?.length) return prev;
      const updated = [...existing];
      updated[varIdx] = [];
      const cleaned = [...updated];
      while (cleaned.length > 0 && (cleaned[cleaned.length - 1]?.length ?? 0) === 0) cleaned.pop();
      return { ...prev, [selChar]: cleaned };
    });
  }

  function addVariant() {
    setLocalGlyphs((prev) => {
      const existing = prev[selChar] ? [...prev[selChar]] : [[]];
      const newIdx = existing.length;
      existing.push([]);
      setVarIdx(newIdx);
      return { ...prev, [selChar]: existing };
    });
  }

  function navigate(delta: number) {
    const idx = GLYPHS.indexOf(selChar);
    const next = GLYPHS[(idx + delta + GLYPHS.length) % GLYPHS.length];
    setSelChar(next);
    setVarIdx(0);
  }

  async function save() {
    await saveGlyphs(characterId, localGlyphs);
    await updateHandSettings(characterId, localHand);
    onClose();
  }

  const prevChar = GLYPHS[(GLYPHS.indexOf(selChar) - 1 + GLYPHS.length) % GLYPHS.length];
  const nextChar = GLYPHS[(GLYPHS.indexOf(selChar) + 1) % GLYPHS.length];
  const isUppercase = selChar >= "A" && selChar <= "Z";
  const isLower = selChar >= "a" && selChar <= "z";
  const charLabel = isUppercase ? "Upper case" : isLower ? "Lower case" : "Symbol";

  return (
    <div className="hand-builder" role="dialog" aria-label="Handwriting builder">
      <div className="hand-builder-inner">
        {/* Header */}
        <div className="hb-header">
          <div className="hb-title">
            <h2>Handwriting</h2>
            <span>{drawnCount} of {GLYPHS.length} drawn</span>
          </div>
          <div className="hb-header-end">
            <button className="pill ghost" onClick={onClose}>Discard</button>
            <button className="pill primary" onClick={() => void save()}>Use this hand</button>
          </div>
        </div>

        <div className="hb-body">
          {/* Left: glyph grid */}
          <section className="hb-section hb-glyphs-section">
            <div className="hb-prog-wrap">
              <div
                className="hb-prog"
                role="progressbar"
                aria-valuenow={drawnCount}
                aria-valuemax={GLYPHS.length}
              >
                <div className="hb-prog-fill" style={{ width: `${(drawnCount / GLYPHS.length) * 100}%` }} />
              </div>
            </div>
            <div className="hb-glyph-grid" role="listbox" aria-label="Glyphs">
              {GLYPHS.split("").map((ch) => {
                const drawn = (localGlyphs[ch]?.length ?? 0) > 0 && (localGlyphs[ch]?.[0]?.length ?? 0) > 0;
                const sel = ch === selChar;
                return (
                  <button
                    key={ch}
                    role="option"
                    aria-selected={sel}
                    aria-label={`${drawn ? "Drawn" : "Not drawn yet"}: ${ch}`}
                    className={`hb-glyph${drawn ? " drawn" : ""}${sel ? " sel" : ""}`}
                    onClick={() => { setSelChar(ch); setVarIdx(0); }}
                  >
                    {ch}
                  </button>
                );
              })}
            </div>
            <div className="hb-legend">
              <span><i className="hb-legend-drawn" />Drawn</span>
              <span><i className="hb-legend-empty" />Falls back to Caveat</span>
            </div>
          </section>

          {/* Middle: drawing pad + controls */}
          <section className="hb-section hb-draw-section">
            <div className="hb-draw-header">
              <h3>Draw "{selChar}"</h3>
              <span>{charLabel} · variant {varIdx + 1} of {Math.max(numVariants, 1)}</span>
            </div>
            <div className="hb-padwrap">
              <canvas
                ref={padRef}
                className="hb-pad"
                onPointerDown={onPadDown}
                onPointerMove={onPadMove}
                onPointerUp={onPadUp}
                onPointerLeave={onPadUp}
              />
              <div className="hb-tools">
                <p className="hb-label">Variants</p>
                <div className="hb-variants">
                  {Array.from({ length: Math.max(numVariants, 1) }).map((_, vi) => {
                    const hasStrokes = (localGlyphs[selChar]?.[vi]?.length ?? 0) > 0;
                    return (
                      <button
                        key={vi}
                        className={`hb-var-btn${vi === varIdx ? " on" : ""}${!hasStrokes ? " empty" : ""}`}
                        aria-label={`Variant ${vi + 1}`}
                        aria-pressed={vi === varIdx}
                        onClick={() => setVarIdx(vi)}
                      >
                        {hasStrokes ? selChar : <span className="hb-var-num">{vi + 1}</span>}
                      </button>
                    );
                  })}
                  {numVariants < 3 && (
                    <button
                      className="hb-var-btn add"
                      aria-label={`Add variant ${numVariants + 1}`}
                      onClick={addVariant}
                    >
                      +
                    </button>
                  )}
                </div>
                <p className="hb-hint">The notebook picks a variant at random so repeated letters don't look stamped.</p>
                <button className="hb-tool-btn" onClick={undoStroke}>
                  <UndoIcon /> Undo stroke
                </button>
                <button className="hb-tool-btn" onClick={clearLetter}>
                  <ClearIcon /> Clear letter
                </button>
                <div className="hb-nav">
                  <button className="hb-tool-btn hb-nav-btn" onClick={() => navigate(-1)}>‹ {prevChar}</button>
                  <button className="hb-tool-btn hb-nav-btn" onClick={() => navigate(1)}>{nextChar} ›</button>
                </div>
              </div>
            </div>
          </section>

          {/* Right: preview + sliders */}
          <section className="hb-section hb-preview-section">
            <div className="hb-preview-header">
              <h3>Preview</h3>
              <span>Underlined = not drawn yet</span>
            </div>
            <canvas ref={previewRef} className="hb-preview-canvas" />
            <div className="hb-sliders">
              {([
                { key: "size" as const, label: "Size", min: 70, max: 140, fmt: (v: number) => `${v}%` },
                { key: "slant" as const, label: "Slant", min: -15, max: 15, fmt: (v: number) => `${v}°` },
                { key: "spacing" as const, label: "Spacing", min: -20, max: 40, fmt: (v: number) => (v >= 0 ? `+${v}` : `${v}`) },
                { key: "wobble" as const, label: "Wobble", min: 0, max: 100, fmt: (v: number) => `${v}%` },
              ] as const).map(({ key, label, min, max, fmt }) => (
                <div key={key} className="hb-slider-row">
                  <label htmlFor={`hb-${key}`}>{label}</label>
                  <input
                    id={`hb-${key}`}
                    type="range"
                    min={min}
                    max={max}
                    value={localHand[key]}
                    onChange={(e) => setLocalHand((h) => ({ ...h, [key]: Number(e.target.value) }))}
                  />
                  <output htmlFor={`hb-${key}`}>{fmt(localHand[key])}</output>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function UndoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 010 12h-3" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 20h11M4.5 15.5l9-10 6.5 6-8.5 8.5H8.5z" />
    </svg>
  );
}
