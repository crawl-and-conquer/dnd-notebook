import Konva from "konva";
import { memo } from "react";
import { Arrow, Ellipse, Group, Line, Path, Rect, Shape } from "react-konva";
import type { Element } from "../model/page";
import { drawLaid, layoutText } from "../handwriting/handLayout";
import { useAsset } from "./assets";
import { strokePath } from "./elements";
import { DEFAULT_HAND_STYLE, useFontsVersion, useHand } from "./HandContext";
import { HandText } from "./HandText";
import { cssVar, useCanvasTheme } from "./theme";

/** Reads a design token (CSS variable) so canvas colours match the chrome. */
export const token = cssVar;

export const FONT_BODY = "'Alegreya Sans', 'Helvetica Neue', Arial, sans-serif";
export const FONT_DISPLAY = "Alegreya, Georgia, serif";
export const FONT_HAND = "Caveat, cursive";
export const FONT_MONO = "'Share Tech Mono', monospace";
/** Checklist box size and the gap before its text (mockup 01: 17 px box, 10 px gap). */
export const CHECK_SIZE = 17;
export const CHECK_GAP = 10;

const HIT = 14;

/** Kept for callers that cleared Konva's text measure cache when fonts loaded. */
export function clearMeasureCache() {}

type Checklist = Extract<Element, { type: "checklist" }>;

/** Row positions for a checklist: each item takes as many 32 px lines as its text needs. */
export function useChecklistRows(el: Checklist) {
  const ctx = useHand();
  useFontsVersion((s) => s.version);
  const textW = Math.max(40, el.w - CHECK_SIZE - CHECK_GAP);
  let y = 0;
  return el.items.map((item) => {
    const spec = {
      text: item.text || " ",
      width: textW,
      fontSize: 26,
      font: el.font,
      elementId: `${el.id}:${item.id}`,
    };
    const laid = layoutText(spec, ctx?.glyphs ?? null, ctx?.hand ?? DEFAULT_HAND_STYLE);
    const row = { item, y, h: laid.height, spec, baseline: laid.lines[0]?.baseline ?? 25 };
    y += laid.height;
    return row;
  });
}

// ----- the node -----

type Props = {
  el: Element;
  notebookPath: string;
  draggable: boolean;
  hidden: boolean;
  /** False while drawing, so pen strokes start on top of existing writing. */
  listening?: boolean;
  dragBoundFunc?: (pos: Konva.Vector2d) => Konva.Vector2d;
  onDragEnd?: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onDblClick?: (id: string) => void;
  onToggleItem?: (elementId: string, itemId: string) => void;
};

function ElementNodeImpl(p: Props) {
  const { el } = p;
  return (
    <Group
      id={el.id}
      name="element"
      x={el.x}
      y={el.y}
      rotation={el.rotation}
      draggable={p.draggable}
      listening={p.listening ?? true}
      visible={!p.hidden}
      dragBoundFunc={p.dragBoundFunc}
      onDragEnd={p.onDragEnd}
      onDblClick={() => p.onDblClick?.(el.id)}
      onDblTap={() => p.onDblClick?.(el.id)}
    >
      <Body {...p} />
    </Group>
  );
}

export const ElementNode = memo(ElementNodeImpl);

function Body({ el, notebookPath, onToggleItem }: Props) {
  const t = useCanvasTheme();
  switch (el.type) {
    case "stroke":
      return (
        <Path
          data={strokePath(el)}
          fill={t.ink(el.colour)}
          opacity={el.opacity}
          strokeWidth={0}
          hitStrokeWidth={HIT}
          perfectDrawEnabled={false}
          shadowForStrokeEnabled={false}
        />
      );
    case "line":
      return (
        <Line
          points={el.points}
          stroke={t.ink(el.colour)}
          strokeWidth={el.width}
          lineCap="round"
          hitStrokeWidth={HIT}
          perfectDrawEnabled={false}
        />
      );
    case "arrow":
      return (
        <Arrow
          points={el.points}
          stroke={t.ink(el.colour)}
          fill={t.ink(el.colour)}
          strokeWidth={el.width}
          pointerLength={8 + el.width * 2}
          pointerWidth={8 + el.width * 2}
          lineCap="round"
          lineJoin="round"
          hitStrokeWidth={HIT}
          perfectDrawEnabled={false}
        />
      );
    case "rect":
      return (
        <Rect
          width={el.w}
          height={el.h}
          stroke={t.ink(el.colour)}
          strokeWidth={el.width}
          dash={el.dashed ? [el.width * 3, el.width * 2.5] : undefined}
          cornerRadius={4}
          hitStrokeWidth={HIT}
          perfectDrawEnabled={false}
        />
      );
    case "ellipse":
      return (
        <Ellipse
          x={el.w / 2}
          y={el.h / 2}
          radiusX={el.w / 2}
          radiusY={el.h / 2}
          stroke={t.ink(el.colour)}
          strokeWidth={el.width}
          dash={el.dashed ? [el.width * 3, el.width * 2.5] : undefined}
          hitStrokeWidth={HIT}
          perfectDrawEnabled={false}
        />
      );
    case "text":
      return (
        <HandText
          spec={{
            text: el.text,
            width: el.w,
            fontSize: el.fontSize,
            font: el.font,
            heading: el.heading,
            elementId: el.id,
          }}
          colour={t.ink(el.colour)}
        />
      );
    case "checklist":
      return <ChecklistBody el={el} onToggleItem={onToggleItem} />;
    case "image":
      return <ImageBody el={el} notebookPath={notebookPath} />;
  }
}

/** A hand-drawn checkbox: uneven corners, tilted a little, with a tick when done. */
function CheckBox({ done, colour, seed }: { done: boolean; colour: string; seed: number }) {
  return (
    <Shape
      perfectDrawEnabled={false}
      sceneFunc={(ctx, shape) => {
        const c = ctx._context;
        const s = CHECK_SIZE;
        c.save();
        c.translate(s / 2, s / 2);
        c.rotate(((-4 + (seed % 5) - 2) * Math.PI) / 180);
        c.translate(-s / 2, -s / 2);
        c.strokeStyle = colour;
        c.lineWidth = 2;
        c.lineJoin = "round";
        c.beginPath();
        if (c.roundRect) c.roundRect(1, 1, s - 2, s - 2, [3, 5, 2, 4]);
        else c.rect(1, 1, s - 2, s - 2);
        c.stroke();
        if (done) {
          c.lineWidth = 2.5;
          c.lineCap = "round";
          c.beginPath();
          c.moveTo(3, 7);
          c.lineTo(7, 13);
          c.lineTo(15, -3);
          c.stroke();
        }
        c.restore();
        ctx.fillStrokeShape(shape);
      }}
      hitFunc={(ctx, shape) => {
        ctx.beginPath();
        ctx.rect(-6, -6, CHECK_SIZE + 12, CHECK_SIZE + 12);
        ctx.closePath();
        ctx.fillStrokeShape(shape);
      }}
    />
  );
}

function ChecklistBody({
  el,
  onToggleItem,
}: {
  el: Checklist;
  onToggleItem?: (elementId: string, itemId: string) => void;
}) {
  const t = useCanvasTheme();
  const ink = t.ink(el.colour);
  const rows = useChecklistRows(el);
  const total = rows.length ? rows[rows.length - 1].y + rows[rows.length - 1].h : 32;
  return (
    <>
      {/* Invisible backing so the whole list is clickable and draggable. */}
      <Rect width={el.w} height={total} fill="rgba(0,0,0,0.001)" />
      {rows.map(({ item, y, spec, baseline }, i) => (
        <Group key={item.id} y={y} name={`checklist-item ci-${item.id}`}>
          <Group
            name="checkbox"
            y={baseline - CHECK_SIZE + 1}
            onClick={(e) => {
              e.cancelBubble = true;
              onToggleItem?.(el.id, item.id);
            }}
            onTap={(e) => {
              e.cancelBubble = true;
              onToggleItem?.(el.id, item.id);
            }}
          >
            <CheckBox done={item.done} colour={ink} seed={i * 7 + item.id.charCodeAt(0)} />
          </Group>
          <HandText
            x={CHECK_SIZE + CHECK_GAP}
            spec={spec}
            colour={ink}
            strike={item.done}
            opacity={item.done ? 0.7 : 1}
          />
        </Group>
      ))}
    </>
  );
}

// ----- photos (SPEC: Photos; mockups 01 and 02) -----

type Photo = Extract<Element, { type: "image" }>;
type Pad = { l: number; t: number; r: number; b: number };

/** Border around the picture: Print 10 / 10 / 10 / 30, Negative 24 / 12 / 26 / 12. */
export function photoPad(frame: Photo["frame"]): Pad {
  if (frame === "print") return { l: 10, t: 10, r: 10, b: 30 };
  if (frame === "negative") return { l: 12, t: 24, r: 12, b: 26 };
  return { l: 0, t: 0, r: 0, b: 0 };
}

/** Seeded pseudo-random in [0, 1), so each photo's tape is its own but never changes. */
function sr(seed: number, i: number): number {
  const x = Math.sin(seed * 9301 + i * 49297 + 7919) * 100000;
  return x - Math.floor(x);
}

let grain: HTMLCanvasElement | null = null;
/** A small tile of film grain, made once. */
function grainTile(): HTMLCanvasElement {
  if (grain) return grain;
  grain = document.createElement("canvas");
  grain.width = grain.height = 96;
  const c = grain.getContext("2d");
  if (c) {
    const d = c.createImageData(96, 96);
    let s = 1234567;
    for (let i = 0; i < d.data.length; i += 4) {
      s = (s * 16807) % 2147483647;
      const v = s % 255;
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
      d.data[i + 3] = 40;
    }
    c.putImageData(d, 0, 0);
  }
  return grain;
}

/** Tape torn at both ends, faintly striped, laid across a corner. */
function drawTape(c: CanvasRenderingContext2D, cx: number, cy: number, angle: number, seed: number, i: number, fill: string) {
  const len = 74 + sr(seed, i) * 14;
  const h = 24 + sr(seed, i + 1) * 4;
  const a = ((angle + (sr(seed, i + 2) - 0.5) * 12) * Math.PI) / 180;
  const L = len / 2;
  const H = h / 2;
  c.save();
  c.translate(cx, cy);
  c.rotate(a);
  c.beginPath();
  // Ragged long edges and torn, pointed ends (as the mockup's clip path).
  const top = [0.03, 0.12, 0.22, 0.34, 0.46, 0.58, 0.7, 0.82, 0.93];
  c.moveTo(-L, 0);
  top.forEach((f, k) => c.lineTo(-L + f * len, -H + (k % 2 ? 0.07 * h * (0.6 + sr(seed, i + 3 + k)) : 0)));
  c.lineTo(L, (sr(seed, i + 13) - 0.5) * 4);
  [...top].reverse().forEach((f, k) => c.lineTo(-L + f * len, H - (k % 2 ? 0.08 * h * (0.6 + sr(seed, i + 14 + k)) : 0)));
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  c.clip();
  c.fillStyle = "rgba(255,255,255,0.12)";
  for (let x = -L; x < L; x += 6) c.fillRect(x, -H, 2, h);
  c.restore();
}

function ImageBody({ el, notebookPath }: { el: Photo; notebookPath: string }) {
  const t = useCanvasTheme();
  const img = useAsset(notebookPath, el.asset);
  const hand = useHand();
  useFontsVersion((s) => s.version);
  if (!t.images) return null;

  const pad = photoPad(el.frame);
  const fx = -pad.l;
  const fy = -pad.t;
  const fw = el.w + pad.l + pad.r;
  const fh = el.h + pad.t + pad.b;
  const tape = t.token("--tape") || "rgba(238,226,192,.72)";
  const caption =
    el.frame === "print" && el.caption
      ? layoutText(
          { text: el.caption, width: Math.max(20, el.w - 4), fontSize: 19, font: "hand", heading: true, elementId: el.id },
          hand?.glyphs ?? null,
          hand?.hand ?? DEFAULT_HAND_STYLE,
        )
      : null;

  return (
    <Shape
      perfectDrawEnabled={false}
      sceneFunc={(ctx, shape) => {
        const c = ctx._context;
        c.save();
        if (el.frame !== "none") {
          c.save();
          c.shadowColor = el.frame === "print" ? "rgba(50,30,10,0.28)" : "rgba(30,18,6,0.32)";
          c.shadowBlur = 20;
          c.shadowOffsetY = 12;
          c.fillStyle = el.frame === "print" ? "#f8f4ea" : "#17120f";
          c.fillRect(fx, fy, fw, fh);
          c.restore();
        }
        if (el.frame === "negative") {
          // Sprocket holes along the top and bottom, in paper colour.
          c.fillStyle = "#e8dbbd";
          for (const y of [fy + 7, fy + fh - 17]) {
            for (let x = fx + 8 + 5; x + 9 <= fx + fw - 8; x += 21) {
              c.beginPath();
              if (c.roundRect) c.roundRect(x, y, 9, 10, 2);
              else c.rect(x, y, 9, 10);
              c.fill();
            }
          }
        }
        // The picture, with the film look laid over it (render only: the asset is untouched).
        if (img) c.drawImage(img, 0, 0, el.w, el.h);
        else {
          c.fillStyle = "rgba(0,0,0,0.06)";
          c.fillRect(0, 0, el.w, el.h);
        }
        if (img && el.filmLook) {
          c.save();
          c.beginPath();
          c.rect(0, 0, el.w, el.h);
          c.clip();
          const tint = c.createLinearGradient(0, 0, 0, el.h);
          tint.addColorStop(0, "rgba(255,170,80,0.14)");
          tint.addColorStop(1, "rgba(120,160,150,0.10)");
          c.fillStyle = tint;
          c.fillRect(0, 0, el.w, el.h);
          const r = Math.hypot(el.w, el.h) / 2;
          const v = c.createRadialGradient(el.w / 2, el.h / 2, 0, el.w / 2, el.h / 2, r);
          v.addColorStop(0, "rgba(45,22,6,0)");
          v.addColorStop(0.48, "rgba(45,22,6,0)");
          v.addColorStop(1, "rgba(45,22,6,0.5)");
          c.fillStyle = v;
          c.fillRect(0, 0, el.w, el.h);
          const pattern = c.createPattern(grainTile(), "repeat");
          if (pattern) {
            c.globalAlpha = 0.5;
            c.globalCompositeOperation = "overlay";
            c.fillStyle = pattern;
            c.fillRect(0, 0, el.w, el.h);
          }
          c.restore();
        }
        if (el.stamp) {
          c.save();
          c.font = "15px 'Share Tech Mono', monospace";
          c.textAlign = "right";
          c.textBaseline = "alphabetic";
          c.fillStyle = "#ff9b4d";
          c.shadowColor = "rgba(255,90,20,0.5)";
          c.shadowBlur = 8;
          const sx = el.w - 9;
          const sy = el.h - 8;
          c.fillText(el.stamp.split("").join(" "), sx, sy);
          c.shadowColor = "rgba(255,110,30,0.95)";
          c.shadowBlur = 3;
          c.fillText(el.stamp.split("").join(" "), sx, sy);
          c.restore();
        }
        if (caption) {
          const lw = caption.lines[0]?.width ?? 0;
          drawLaid(c, caption, hand?.hand ?? DEFAULT_HAND_STYLE, { colour: "#5a4636" }, (el.w - lw) / 2, el.h + 2 - 25 + 21);
        }
        if (el.frame === "negative") {
          c.save();
          c.font = "10px 'Share Tech Mono', monospace";
          c.fillStyle = "#d98a3a";
          c.fillText("▸ 1 4 A   4 0 0", fx + 14, fy + fh - 3.5);
          c.restore();
        }
        // Four strips of tape, one across each corner, overlapping the page.
        const s = el.tapeSeed;
        drawTape(c, fx + 10, fy + 5, -40, s, 0, tape);
        drawTape(c, fx + fw - 10, fy + 5, 40, s, 30, tape);
        drawTape(c, fx + 10, fy + fh - 5, 40, s, 60, tape);
        drawTape(c, fx + fw - 10, fy + fh - 5, -40, s, 90, tape);
        c.restore();
        ctx.fillStrokeShape(shape);
      }}
      hitFunc={(ctx, shape) => {
        ctx.beginPath();
        ctx.rect(fx, fy, fw, fh);
        ctx.closePath();
        ctx.fillStrokeShape(shape);
      }}
    />
  );
}
