import Konva from "konva";
import { memo } from "react";
import { Arrow, Ellipse, Group, Image as KImage, Line, Path, Rect, Text } from "react-konva";
import type { Element } from "../model/page";
import { useAsset } from "./assets";
import { TEXT_STYLE, strokePath } from "./elements";
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
  if (!img) {
    return (
      <Rect
        width={el.w}
        height={el.h}
        stroke={t.token("--line-strong")}
        dash={[6, 6]}
        strokeWidth={2}
      />
    );
  }
  return (
    <KImage
      image={img}
      width={el.w}
      height={el.h}
      shadowColor="#040818"
      shadowOpacity={0.45}
      shadowBlur={18}
      shadowOffsetY={6}
      perfectDrawEnabled={false}
    />
  );
}
