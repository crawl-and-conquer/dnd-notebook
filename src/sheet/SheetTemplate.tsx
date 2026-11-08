import Konva from "konva";
import { useEffect, useMemo, useRef } from "react";
import { Circle, Group, Rect, Shape } from "react-konva";
import { drawLaid, layoutText, type Laid } from "../handwriting/handLayout";
import { DEFAULT_HAND_STYLE, useFontsVersion, useHand } from "../canvas/HandContext";
import { useCanvasTheme, type CanvasTheme } from "../canvas/theme";
import { useTools } from "../store/tools";
import type { Hand } from "../model/hand";
import type { Character } from "../model/character";
import type { Sheet, SheetPageType, Trackers } from "../model/sheet";
import { layoutSheetPage, type Bubble, type Item, type Part } from "./layout";

export type ValueHit = { path: string; x: number; y: number; w: number; h: number; size: number; text: string };
export type BubbleHit = { act: Bubble; cx: number; cy: number };

const LABEL_FONT = (size = 10.5) => `700 ${size}px "Alegreya Sans"`;
const META_FONT = (size = 13) => `500 ${size}px "Alegreya Sans"`;
const DOT_R = 5.5;
const BUBBLE_R = 7.5;

let measure: CanvasRenderingContext2D | null = null;
function labelWidth(text: string, size?: number): number {
  measure ??= document.createElement("canvas").getContext("2d");
  if (!measure) return text.length * 7;
  measure.font = LABEL_FONT(size);
  measure.letterSpacing = `${0.12 * (size ?? 10.5)}px`;
  return measure.measureText(text.toUpperCase()).width;
}

type Drawn = { draw(c: CanvasRenderingContext2D): void; values: ValueHit[]; bubbles: BubbleHit[] };

/** Lays out every item once (text in the hand included) and returns a draw function and click targets. */
function prepare(items: Item[], overrides: Set<string>, glyphs: Hand | null, style: Character["hand"], t: CanvasTheme): Drawn {
  const colour = (c?: string) => (c ? (c.startsWith("--") ? t.token(c) : c) : t.token("--ink-text"));
  const ops: ((c: CanvasRenderingContext2D) => void)[] = [];
  const values: ValueHit[] = [];
  const bubbleHits: BubbleHit[] = [];
  const box = t.token("--sheet-box");
  const fill = t.token("--sheet-box-fill");
  const label = t.token("--label");
  const screen = t.name === "screen";

  const laidText = (text: string, size: number, bold: boolean, key: string): Laid =>
    layoutText({ text: text || " ", width: 4000, fontSize: size, font: "hand", heading: bold, elementId: `sheet:${key}` }, glyphs, style);

  /** Draws text so its baseline sits at y, starting at x. Returns the width drawn. */
  const handAt = (text: string, x: number, y: number, size: number, bold: boolean, col: string | undefined, key: string) => {
    const laid = laidText(text, size, bold, key);
    const line = laid.lines[0];
    if (text) ops.push((c) => drawLaid(c, laid, style, { colour: colour(col) }, x, y - line.baseline));
    return line?.width ?? 0;
  };

  const pencilDot = (x: number, y: number) =>
    ops.push((c) => {
      c.fillStyle = label;
      c.beginPath();
      c.arc(x, y, 2, 0, Math.PI * 2);
      c.fill();
    });

  const blank = (x: number, y: number, w: number) => {
    if (!screen) return;
    ops.push((c) => {
      c.save();
      c.strokeStyle = "rgba(58,46,38,0.3)";
      c.setLineDash([2, 3]);
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(x, y + 3.5);
      c.lineTo(x + w, y + 3.5);
      c.stroke();
      c.restore();
    });
  };

  const drawLabel = (text: string, x: number, y: number, align: "left" | "center" | "right" = "left", size?: number) =>
    ops.push((c) => {
      c.save();
      c.font = LABEL_FONT(size);
      c.letterSpacing = `${0.12 * (size ?? 10.5)}px`;
      c.fillStyle = label;
      c.textAlign = align;
      c.fillText(text.toUpperCase(), x, y);
      c.restore();
    });

  const drawBubble = (cx: number, cy: number, filled: boolean, col: string | undefined, act: Bubble) => {
    const k = colour(col ?? "--sheet-box");
    ops.push((c) => {
      c.beginPath();
      c.arc(cx, cy, BUBBLE_R, 0, Math.PI * 2);
      if (filled) {
        c.fillStyle = k;
        c.fill();
      }
      c.lineWidth = 2;
      c.strokeStyle = k;
      c.stroke();
    });
    bubbleHits.push({ act, cx, cy });
  };

  for (const it of items) {
    switch (it.k) {
      case "box":
        ops.push((c) => {
          wobblyBox(c, it.x, it.y, it.w, it.h, it.v);
          c.fillStyle = fill;
          c.fill();
          c.lineWidth = 2;
          c.strokeStyle = box;
          c.stroke();
        });
        break;
      case "shield":
        ops.push((c) => {
          const { x, y, w, h } = it;
          c.beginPath();
          c.moveTo(x + w / 2, y);
          c.bezierCurveTo(x + w * 0.7, y + 6, x + w * 0.85, y + 4, x + w, y + 8);
          c.bezierCurveTo(x + w, y + h * 0.55, x + w * 0.85, y + h * 0.82, x + w / 2, y + h);
          c.bezierCurveTo(x + w * 0.15, y + h * 0.82, x, y + h * 0.55, x, y + 8);
          c.bezierCurveTo(x + w * 0.15, y + 4, x + w * 0.3, y + 6, x + w / 2, y);
          c.closePath();
          c.fillStyle = fill;
          c.fill();
          c.lineWidth = 2;
          c.strokeStyle = box;
          c.stroke();
        });
        break;
      case "oval":
        ops.push((c) => {
          c.beginPath();
          c.ellipse(it.x + it.w / 2, it.y + it.h / 2, it.w / 2, it.h / 2, -0.04, 0, Math.PI * 2);
          c.fillStyle = t.token("--paper");
          c.fill();
          c.lineWidth = 2;
          c.strokeStyle = box;
          c.stroke();
        });
        break;
      case "coin":
        ops.push((c) => {
          c.beginPath();
          c.arc(it.cx, it.cy, it.r, 0, Math.PI * 2);
          c.fillStyle = it.fill;
          c.fill();
          c.lineWidth = 2;
          c.strokeStyle = box;
          c.stroke();
        });
        break;
      case "dash":
        ops.push((c) => {
          c.save();
          c.setLineDash([4, 4]);
          c.lineWidth = 1.5;
          c.strokeStyle = "rgba(58,46,38,0.35)";
          c.beginPath();
          c.moveTo(it.x1, it.y1);
          c.lineTo(it.x2, it.y2);
          c.stroke();
          c.restore();
        });
        break;
      case "label":
        drawLabel(it.text, it.x, it.y, it.align, it.size);
        break;
      case "meta":
        ops.push((c) => {
          c.save();
          c.font = META_FONT(it.size);
          c.fillStyle = t.token("--muted-on-paper");
          c.textAlign = it.align ?? "left";
          c.fillText(it.text, it.x, it.y);
          c.restore();
        });
        break;
      case "title":
        ops.push((c) => {
          c.save();
          c.font = `700 30px Alegreya`;
          c.fillStyle = t.token("--ink-title");
          c.fillText(it.text, it.x, it.y);
          c.restore();
        });
        break;
      case "value": {
        let size = it.size;
        let text = it.text;
        let laid = laidText(text, size, !!it.bold, it.path ?? text);
        if (it.fit && laid.lines[0].width > it.w) {
          size = Math.max(it.size * 0.72, (it.size * it.w) / laid.lines[0].width);
          laid = laidText(text, size, !!it.bold, it.path ?? text);
          while (text.length > 1 && laid.lines[0].width > it.w) {
            text = `${text.slice(0, -2).trimEnd()}…`;
            laid = laidText(text, size, !!it.bold, it.path ?? text);
          }
        }
        const w = laid.lines[0].width;
        const x = it.align === "center" ? it.x + (it.w - w) / 2 : it.align === "right" ? it.x + it.w - w : it.x;
        if (text) {
          const l = laid;
          ops.push((c) => drawLaid(c, l, style, { colour: colour(it.colour) }, x, it.y - l.lines[0].baseline));
        } else if (it.path) {
          const bw = Math.min(it.w, Math.max(24, it.size * 1.4));
          blank(it.align === "center" ? it.x + (it.w - bw) / 2 : it.align === "right" ? it.x + it.w - bw : it.x, it.y, bw);
        }
        if (it.path && overrides.has(it.path)) pencilDot(x + Math.max(w, 10) + 4, it.y - size * 0.62);
        if (it.path) values.push({ path: it.path, x: it.x, y: it.y - size * 0.95, w: it.w, h: size * 1.25, size: it.size, text: it.text });
        break;
      }
      case "row": {
        let x = it.x;
        for (const p of it.parts) x = drawPart(p, x, it.y, it.x + it.w);
        break;
      }
    }
  }

  function drawPart(p: Part, x: number, y: number, right: number): number {
    switch (p.t) {
      case "gap":
        return x + p.w;
      case "label": {
        drawLabel(p.text, x, y - 2);
        return x + labelWidth(p.text) + (p.gap ?? 6);
      }
      case "dot":
        ops.push((c) => {
          c.beginPath();
          c.arc(x + DOT_R, y - 7, DOT_R, 0, Math.PI * 2);
          if (p.on) {
            c.fillStyle = "#4f6b32";
            c.fill();
          }
          c.lineWidth = 1.8;
          c.strokeStyle = "#4f6b32";
          c.stroke();
        });
        return x + DOT_R * 2 + 6;
      case "bubble":
        drawBubble(x + BUBBLE_R + 1, y - 7, p.filled, p.colour, p.act);
        return x + BUBBLE_R * 2 + 5;
      case "text": {
        const size = p.size ?? 22;
        let text = p.text;
        if (p.fit && text) {
          const room = right - x;
          if (room < 20) return x;
          while (text.length > 1 && laidText(text, size, !!p.bold, p.path ?? p.text).lines[0].width > room) {
            text = `${text.slice(0, Math.max(1, Math.floor(text.length * 0.92) - 1)).trimEnd()}…`;
          }
        }
        const w = text ? handAt(text, x, y, size, !!p.bold, p.colour, p.path ?? p.text) : 0;
        const width = Math.max(w, p.path ? (p.minW ?? 0) : 0);
        if (!p.text && p.path) blank(x, y, width || 24);
        if (p.path) {
          if (overrides.has(p.path)) pencilDot(x + width + 3, y - size * 0.62);
          values.push({ path: p.path, x, y: y - size * 0.95, w: Math.max(width, 24), h: size * 1.25, size, text: p.text });
        }
        return x + Math.max(width, !p.text && p.path ? 24 : 0);
      }
    }
  }

  return { draw: (c) => ops.forEach((op) => op(c)), values, bubbles: bubbleHits };
}

/**
 * A box with uneven, hand-drawn corners: the mockups' border radii
 * (255 15 225 15 / 15 225 15 255 and its mirror), scaled down the way CSS does.
 */
export function wobblyBox(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, v: 1 | 2) {
  const [hr, vr] =
    v === 1
      ? [
          [255, 15, 225, 15],
          [15, 225, 15, 255],
        ]
      : [
          [15, 225, 15, 255],
          [255, 15, 225, 15],
        ];
  const f = Math.min(1, w / (hr[0] + hr[1]), w / (hr[3] + hr[2]), h / (vr[0] + vr[3]), h / (vr[1] + vr[2]));
  const [tlH, trH, brH, blH] = hr.map((r) => r * f);
  const [tlV, trV, brV, blV] = vr.map((r) => r * f);
  c.beginPath();
  c.moveTo(x + tlH, y);
  c.lineTo(x + w - trH, y);
  c.ellipse(x + w - trH, y + trV, trH, trV, 0, -Math.PI / 2, 0);
  c.lineTo(x + w, y + h - brV);
  c.ellipse(x + w - brH, y + h - brV, brH, brV, 0, 0, Math.PI / 2);
  c.lineTo(x + blH, y + h);
  c.ellipse(x + blH, y + h - blV, blH, blV, 0, Math.PI / 2, Math.PI);
  c.lineTo(x, y + tlV);
  c.ellipse(x + tlH, y + tlV, tlH, tlV, 0, Math.PI, Math.PI * 1.5);
  c.closePath();
}

/**
 * A character sheet page drawn from sheet.json and trackers.json, under the page's own writing.
 * Values open an editor on double-click (or a click with the Text tool); bubbles toggle on click.
 */
export function SheetTemplate({
  type,
  index,
  sheet,
  trackers,
  characterName,
  onEdit,
  onBubble,
}: {
  type: SheetPageType;
  index: number;
  sheet: Sheet;
  trackers: Trackers;
  characterName: string;
  onEdit?(hit: ValueHit): void;
  onBubble?(act: Bubble): void;
}) {
  const t = useCanvasTheme();
  const ctx = useHand();
  const fonts = useFontsVersion((s) => s.version);
  const zoom = useTools((s) => s.zoom);
  const ref = useRef<Konva.Shape>(null);
  const style = ctx?.hand ?? DEFAULT_HAND_STYLE;
  const drawn = useMemo(() => {
    void fonts;
    const items = layoutSheetPage(type, index, sheet, trackers, characterName);
    return prepare(items, new Set(sheet.overrides), ctx?.glyphs ?? null, style, t);
  }, [type, index, sheet, trackers, characterName, ctx?.glyphs, style, t, fonts]);

  useEffect(() => {
    const s = ref.current;
    if (!s) return;
    s.clearCache();
    s.cache({ x: 0, y: 0, width: 570, height: 720, pixelRatio: Math.min(4, (window.devicePixelRatio || 1) * Math.max(1.5, zoom)) });
    s.getLayer()?.batchDraw();
  }, [drawn, zoom]);

  const interactive = !!onEdit;
  return (
    <Group>
      <Shape ref={ref} listening={false} perfectDrawEnabled={false} sceneFunc={(c) => drawn.draw(c._context)} />
      {interactive &&
        drawn.values.map((v) => (
          <Rect
            key={`v:${v.path}`}
            name="sheet-value"
            x={v.x - 2}
            y={v.y}
            width={v.w + 4}
            height={v.h}
            fill="rgba(0,0,0,0.001)"
            onDblClick={() => onEdit?.(v)}
            onDblTap={() => onEdit?.(v)}
            onClick={() => useTools.getState().tool === "text" && onEdit?.(v)}
            onMouseEnter={(e) => {
              const st = e.target.getStage();
              if (st && ["select", "text"].includes(useTools.getState().tool)) st.container().style.cursor = "text";
            }}
            onMouseLeave={(e) => {
              const st = e.target.getStage();
              if (st) st.container().style.cursor = "";
            }}
          />
        ))}
      {interactive &&
        drawn.bubbles.map((b, i) => (
          <Circle
            key={`b:${i}`}
            name="sheet-bubble"
            x={b.cx}
            y={b.cy}
            radius={BUBBLE_R + 3}
            fill="rgba(0,0,0,0.001)"
            onClick={() => onBubble?.(b.act)}
            onTap={() => onBubble?.(b.act)}
            onMouseEnter={(e) => {
              const st = e.target.getStage();
              if (st) st.container().style.cursor = "pointer";
            }}
            onMouseLeave={(e) => {
              const st = e.target.getStage();
              if (st) st.container().style.cursor = "";
            }}
          />
        ))}
    </Group>
  );
}
