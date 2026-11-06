import { format } from "date-fns";
import { useMemo } from "react";
import { Group, Rect, Shape, Text } from "react-konva";
import { PAGE_HEIGHT, PAGE_WIDTH, type Element, type Page } from "../model/page";
import { ElementNode, FONT_BODY, FONT_DISPLAY } from "./ElementNode";
import { useCanvasTheme } from "./theme";

export const TITLE_X = 60;
export const TITLE_Y = 40;
const TITLE_SIZE = 36;
const SUBTITLE_SIZE = 14;
export const HEADER_H = 88;
export const RULE_STEP = 32;
export const MARGIN_X1 = 71;
export const MARGIN_X2 = 75;

const isBrush = (el: Element) => el.type === "stroke" && el.tool === "brush";

/** Brush strokes first so highlighting sits under everything else (SPEC: Paint brush). */
export function drawOrder(elements: Element[]): Element[] {
  return [...elements.filter(isBrush), ...elements.filter((el) => !isBrush(el))];
}

/** Ruled paper background: warm beige, red rules every 32 px, double margin line. */
export function PaperBackground() {
  const t = useCanvasTheme();
  const paper = t.token("--paper");
  const rule = t.token("--rule");
  const marginLine = t.token("--margin-line");
  return (
    <>
      <Rect x={0} y={0} width={PAGE_WIDTH} height={PAGE_HEIGHT} fill={paper} listening={false} />
      <Shape
        listening={false}
        perfectDrawEnabled={false}
        sceneFunc={(ctx) => {
          const c = ctx._context;
          // Red ruled lines every 32 px, starting below the header
          c.beginPath();
          c.strokeStyle = rule;
          c.lineWidth = 1;
          for (let y = HEADER_H + RULE_STEP; y < PAGE_HEIGHT; y += RULE_STEP) {
            c.moveTo(0, y + 0.5);
            c.lineTo(PAGE_WIDTH, y + 0.5);
          }
          c.stroke();
          // Double margin line: thick at x=71, thin at x=75
          c.beginPath();
          c.strokeStyle = marginLine;
          c.lineWidth = 1.5;
          c.moveTo(MARGIN_X1 + 0.5, 0);
          c.lineTo(MARGIN_X1 + 0.5, PAGE_HEIGHT);
          c.stroke();
          c.beginPath();
          c.strokeStyle = marginLine.replace("0.55", "0.32");
          c.lineWidth = 1;
          c.moveTo(MARGIN_X2 + 0.5, 0);
          c.lineTo(MARGIN_X2 + 0.5, PAGE_HEIGHT);
          c.stroke();
        }}
      />
    </>
  );
}

/**
 * The page title and "Page started" line, drawn in Konva for exports. On screen
 * the same text is an editable HTML input laid over the canvas at the same spot.
 */
export function PageTitle({ page }: { page: Page }) {
  const t = useCanvasTheme();
  return (
    <Group x={TITLE_X} y={TITLE_Y} listening={false}>
      <Text
        text={page.title}
        fontFamily={FONT_DISPLAY}
        fontStyle="600"
        fontSize={TITLE_SIZE}
        letterSpacing={-0.03 * TITLE_SIZE}
        lineHeight={1.1}
        fill={t.token("--ink-white")}
        width={900}
        wrap="none"
        ellipsis
      />
      <Text
        y={TITLE_SIZE * 1.1 + 8}
        text={`Page started ${format(new Date(page.createdAt), "EEE d MMM yyyy")}`}
        fontFamily={FONT_BODY}
        fontSize={SUBTITLE_SIZE}
        lineHeight={1.2}
        fill={t.token("--text-muted")}
      />
    </Group>
  );
}

/** A whole page, read-only: what exports and snapshots draw. */
export function PageScene({
  page,
  notebookPath,
}: {
  page: Page;
  notebookPath: string;
}) {
  const ordered = useMemo(() => drawOrder(page.elements), [page.elements]);
  return (
    <>
      <PaperBackground />
      <PageTitle page={page} />
      {ordered.map((el) => (
        <ElementNode
          key={el.id}
          el={el}
          notebookPath={notebookPath}
          draggable={false}
          hidden={false}
        />
      ))}
    </>
  );
}
