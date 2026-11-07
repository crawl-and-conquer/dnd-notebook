import Konva from "konva";
import { memo } from "react";
import { Arrow, Ellipse, Group, Image as KImage, Line, Path, Rect, Shape, Text } from "react-konva";
import type { Element } from "../model/page";
import { useAsset } from "./assets";
import { TEXT_STYLE, strokePath } from "./elements";
import { useHand } from "./HandContext";
import { HandText } from "./HandText";
import { cssVar, useCanvasTheme } from "./theme";

/** Reads a design token (CSS variable) so canvas colours match the chrome. */
export const token = cssVar;

export const FONT_BODY = "Satoshi, 'Helvetica Neue', Arial, sans-serif";
export const FONT_DISPLAY = "'Bricolage Grotesque', Satoshi, sans-serif";
export const LINE_HEIGHT = 1.4;
export const HEADING_LINE_HEIGHT = 1.15;
export const CHECK_SIZE = 18;
export const CHECK_GAP = 10;
export const ROW_GAP = 10;

const HIT = 14;

// ----- text measuring -----

let measurer: Konva.Text | null = null;
const measureCache = new Map<string, number>();
export function clearMeasureCache() {
  measureCache.clear();
}

type Font = {
  fontSize: number;
  fontFamily?: string;
  fontStyle?: string;
  lineHeight?: number;
  letterSpacing?: number;
};

function measurerWith(font: Font): Konva.Text {
  measurer ??= new Konva.Text({ wrap: "word" });
  measurer.setAttrs({
    fontFamily: font.fontFamily ?? FONT_BODY,
    fontStyle: font.fontStyle ?? "normal",
    lineHeight: font.lineHeight ?? LINE_HEIGHT,
    letterSpacing: font.letterSpacing ?? 0,
    fontSize: font.fontSize,
  });
  return measurer;
}

export function measureTextHeight(text: string, width: number, font: Font): number {
  const k = `h|${JSON.stringify(font)}|${width}|${text}`;
  const hit = measureCache.get(k);
  if (hit !== undefined) return hit;
  const m = measurerWith(font);
  m.setAttrs({ text: text || " ", width });
  const h = m.height();
  measureCache.set(k, h);
  return h;
}


const textFont = (el: Extract<Element, { type: "text" }>): Font =>
  el.heading
    ? {
        fontSize: el.fontSize,
        fontFamily: FONT_DISPLAY,
        fontStyle: "600",
        lineHeight: HEADING_LINE_HEIGHT,
        letterSpacing: -0.02 * el.fontSize,
      }
    : { fontSize: el.fontSize };

export function checklistRows(el: Extract<Element, { type: "checklist" }>) {
  const fontSize = TEXT_STYLE.checklist.fontSize;
  const textW = Math.max(40, el.w - CHECK_SIZE - CHECK_GAP);
  let y = 0;
  return el.items.map((item) => {
    const textH = Math.max(CHECK_SIZE + 2, measureTextHeight(item.text, textW, { fontSize }));
    const row = { item, y, h: textH, textH, textW, fontSize };
    y += textH + ROW_GAP;
    return row;
  });
}

// ----- the node -----

type Props = {
  el: Element;
  notebookPath: string;
  draggable: boolean;
  hidden: boolean;
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
  const hand = useHand();
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
    case "text": {
      const f = textFont(el);
      // Use hand rendering when glyphs are available and it's a plain (non-heading) text element
      if (hand && !el.heading) {
        return (
          <HandText
            text={el.text}
            width={el.w}
            fontSize={f.fontSize}
            colour={t.ink(el.colour)}
            glyphs={hand.glyphs}
            hand={hand.hand}
          />
        );
      }
      return (
        <Text
          text={el.text}
          width={el.w}
          fontSize={f.fontSize}
          fontFamily={f.fontFamily ?? FONT_BODY}
          fontStyle={f.fontStyle ?? "normal"}
          letterSpacing={f.letterSpacing ?? 0}
          lineHeight={f.lineHeight ?? LINE_HEIGHT}
          fill={t.ink(el.colour)}
          wrap="word"
        />
      );
    }
    case "checklist":
      return <Checklist el={el} onToggleItem={onToggleItem} />;
    case "image":
      return <ImageBody el={el} notebookPath={notebookPath} />;
  }
}

function Checklist({
  el,
  onToggleItem,
}: {
  el: Extract<Element, { type: "checklist" }>;
  onToggleItem?: (elementId: string, itemId: string) => void;
}) {
  const t = useCanvasTheme();
  const ink = t.token("--ink-white");
  const mint = t.token("--mint");
  const muted = t.token("--text-muted");
  const rows = checklistRows(el);
  const total = rows.length ? rows[rows.length - 1].y + rows[rows.length - 1].h : CHECK_SIZE;
  return (
    <>
      {/* Invisible backing so the whole list is clickable and draggable. */}
      <Rect width={el.w} height={total} fill="rgba(0,0,0,0.001)" />
      {rows.map(({ item, y, textW, fontSize }) => (
        <Group key={item.id} y={y} name={`checklist-item ci-${item.id}`}>
          <Group
            name="checkbox"
            onClick={(e) => {
              e.cancelBubble = true;
              onToggleItem?.(el.id, item.id);
            }}
            onTap={(e) => {
              e.cancelBubble = true;
              onToggleItem?.(el.id, item.id);
            }}
          >
            <Rect
              y={2}
              width={CHECK_SIZE}
              height={CHECK_SIZE}
              stroke={item.done ? mint : ink}
              strokeWidth={2}
              hitStrokeWidth={8}
              fill="rgba(0,0,0,0.001)"
            />
            {item.done && (
              <Line
                points={[4, 11, 8, 15, 14, 6]}
                stroke={mint}
                strokeWidth={2}
                lineCap="round"
                lineJoin="round"
              />
            )}
          </Group>
          <Text
            x={CHECK_SIZE + CHECK_GAP}
            text={item.text}
            width={textW}
            fontSize={fontSize}
            fontFamily={FONT_BODY}
            lineHeight={LINE_HEIGHT}
            fill={item.done ? muted : ink}
            textDecoration={item.done ? "line-through" : ""}
            wrap="word"
          />
        </Group>
      ))}
    </>
  );
}

// Seeded pseudo-random in [0, 1)
function sr(seed: number, i: number): number {
  const x = Math.sin(seed * 9301 + i * 49297 + 7919) * 100000;
  return x - Math.floor(x);
}

type Pad = { l: number; t: number; r: number; b: number };
function framePad(frame: "print" | "negative" | "none"): Pad {
  if (frame === "print") return { l: 10, t: 10, r: 10, b: 30 };
  if (frame === "negative") return { l: 16, t: 24, r: 16, b: 24 };
  return { l: 0, t: 0, r: 0, b: 0 };
}

function TapeStrip({
  cx,
  cy,
  baseAngle,
  seed,
  si,
}: {
  cx: number;
  cy: number;
  baseAngle: number;
  seed: number;
  si: number;
}) {
  const len = 76 + sr(seed, si) * 10;
  const W = 26;
  const angle = baseAngle + (sr(seed, si + 1) - 0.5) * 10;
  return (
    <Shape
      x={cx}
      y={cy}
      listening={false}
      perfectDrawEnabled={false}
      sceneFunc={(ctx) => {
        const c = (ctx as unknown as { _context: CanvasRenderingContext2D })._context;
        const L = len / 2;
        const H = W / 2;
        const j = W * 0.3;
        const tl0 = (sr(seed, si + 2) - 0.5) * j;
        const tl1 = (sr(seed, si + 3) - 0.5) * j;
        const tr0 = (sr(seed, si + 4) - 0.5) * j;
        const tr1 = (sr(seed, si + 5) - 0.5) * j;
        c.save();
        c.rotate((angle * Math.PI) / 180);
        c.beginPath();
        c.moveTo(-L + tl0, -H);
        c.lineTo(-L + tl1, 0);
        c.lineTo(-L + tl0, H);
        c.lineTo(L + tr0, H);
        c.lineTo(L + tr1, 0);
        c.lineTo(L + tr0, -H);
        c.closePath();
        c.fillStyle = "rgba(238,226,192,.72)";
        c.fill();
        c.restore();
      }}
    />
  );
}

function SprocketRow({
  x0,
  y,
  frameWidth,
}: {
  x0: number;
  y: number;
  frameWidth: number;
}) {
  const holes: number[] = [];
  for (let x = 8; x < frameWidth - 8; x += 20) holes.push(x);
  return (
    <>
      {holes.map((hx, i) => (
        <Ellipse
          key={i}
          x={x0 + hx}
          y={y}
          radiusX={4}
          radiusY={4}
          fill="#ede5d0"
          listening={false}
        />
      ))}
    </>
  );
}

function ImageBody({
  el,
  notebookPath,
}: {
  el: Extract<Element, { type: "image" }>;
  notebookPath: string;
}) {
  const t = useCanvasTheme();
  const img = useAsset(notebookPath, el.asset);
  if (!t.images) return null;

  const pad = framePad(el.frame);
  const fw = el.w + pad.l + pad.r;
  const ftlX = -pad.l;
  const ftlY = -pad.t;
  const ftrX = el.w + pad.r;
  const ftrY = -pad.t;
  const fblX = -pad.l;
  const fblY = el.h + pad.b;
  const fbrX = el.w + pad.r;
  const fbrY = el.h + pad.b;

  if (!img) {
    return (
      <>
        {el.frame === "print" && (
          <Rect
            x={ftlX} y={ftlY} width={fw} height={el.h + pad.t + pad.b}
            fill="#f8f4ea"
            shadowColor="rgba(50,30,10,0.28)" shadowBlur={20} shadowOffsetY={12}
          />
        )}
        {el.frame === "negative" && (
          <Rect x={ftlX} y={ftlY} width={fw} height={el.h + pad.t + pad.b} fill="#17120f" />
        )}
        <Rect
          width={el.w} height={el.h}
          stroke={t.token("--line-strong")} dash={[6, 6]} strokeWidth={2}
        />
        <TapeStrip cx={ftlX} cy={ftlY} baseAngle={40} seed={el.tapeSeed} si={0} />
        <TapeStrip cx={ftrX} cy={ftrY} baseAngle={-40} seed={el.tapeSeed} si={6} />
        <TapeStrip cx={fblX} cy={fblY} baseAngle={-40} seed={el.tapeSeed} si={12} />
        <TapeStrip cx={fbrX} cy={fbrY} baseAngle={40} seed={el.tapeSeed} si={18} />
      </>
    );
  }

  return (
    <>
      {el.frame === "print" && (
        <Rect
          x={ftlX} y={ftlY} width={fw} height={el.h + pad.t + pad.b}
          fill="#f8f4ea"
          shadowColor="rgba(50,30,10,0.28)" shadowBlur={20} shadowOffsetY={12}
          perfectDrawEnabled={false}
        />
      )}
      {el.frame === "negative" && (
        <Rect
          x={ftlX} y={ftlY} width={fw} height={el.h + pad.t + pad.b}
          fill="#17120f" perfectDrawEnabled={false}
        />
      )}

      <KImage image={img} width={el.w} height={el.h} perfectDrawEnabled={false} />

      {el.filmLook && (
        <Rect
          width={el.w} height={el.h}
          fill="rgba(255,160,50,0.12)"
          listening={false} perfectDrawEnabled={false}
        />
      )}
      {el.filmLook && (
        <Rect
          width={el.w} height={el.h}
          fillRadialGradientStartPoint={{ x: el.w / 2, y: el.h / 2 }}
          fillRadialGradientEndPoint={{ x: el.w / 2, y: el.h / 2 }}
          fillRadialGradientStartRadius={Math.min(el.w, el.h) * 0.25}
          fillRadialGradientEndRadius={Math.max(el.w, el.h) * 0.78}
          fillRadialGradientColorStops={[0, "rgba(0,0,0,0)", 1, "rgba(0,0,0,0.3)"]}
          listening={false} perfectDrawEnabled={false}
        />
      )}

      {el.stamp && (
        <Text
          x={4} y={el.h - 20}
          width={el.w - 8}
          text={el.stamp}
          align="right"
          fontFamily="'Share Tech Mono', monospace"
          fontSize={11}
          fill="#ff9b4d"
          shadowColor="rgba(220,60,0,0.6)" shadowBlur={5}
          listening={false}
        />
      )}

      {el.frame === "print" && el.caption && (
        <Text
          x={2} y={el.h + 8}
          width={el.w - 4}
          text={el.caption}
          fontFamily={FONT_BODY}
          fontSize={12}
          fill="#2b2622"
          listening={false}
        />
      )}

      {el.frame === "negative" && (
        <>
          <Text
            x={ftlX + 4} y={ftlY + 4}
            text="▸ 14A  400"
            fontFamily="'Share Tech Mono', monospace"
            fontSize={9}
            fill="#ff7a00"
            listening={false}
          />
          <SprocketRow x0={ftlX} y={ftlY + 11} frameWidth={fw} />
          <SprocketRow x0={ftlX} y={el.h + pad.b - 13} frameWidth={fw} />
        </>
      )}

      <TapeStrip cx={ftlX} cy={ftlY} baseAngle={40} seed={el.tapeSeed} si={0} />
      <TapeStrip cx={ftrX} cy={ftrY} baseAngle={-40} seed={el.tapeSeed} si={6} />
      <TapeStrip cx={fblX} cy={fblY} baseAngle={-40} seed={el.tapeSeed} si={12} />
      <TapeStrip cx={fbrX} cy={fbrY} baseAngle={40} seed={el.tapeSeed} si={18} />
    </>
  );
}
