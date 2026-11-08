import { format, parseISO } from "date-fns";
import { useMemo } from "react";
import { Rect, Shape } from "react-konva";
import { PAGE_HEIGHT, PAGE_WIDTH, type Element, type Page } from "../model/page";
import type { Sheet, Trackers } from "../model/sheet";
import { SheetTemplate } from "../sheet/SheetTemplate";
import { ElementNode } from "./ElementNode";
import { useCanvasTheme } from "./theme";

export const HEADER_H = 88;
export const RULE_STEP = 32;
export const MARGIN_X1 = 71;
export const MARGIN_X2 = 75;

const isBrush = (el: Element) => el.type === "stroke" && el.tool === "brush";

/** Brush strokes first so highlighting sits under everything else (SPEC: Paint brush). */
export function drawOrder(elements: Element[]): Element[] {
  return [...elements.filter(isBrush), ...elements.filter((el) => !isBrush(el))];
}

/** The first rule sits at y 95 (the header band above it has none); then every 32 px. */
export const FIRST_RULE_Y = 95;

/** Ruled paper: warm beige with a soft highlight, red rules every 32 px, double margin line. */
export function PaperBackground() {
  const t = useCanvasTheme();
  const paper = t.token("--paper");
  const highlight = t.token("--paper-highlight");
  const rule = t.token("--rule");
  const margin = t.token("--margin-line");
  const marginThin = t.token("--margin-line-thin");
  return (
    <>
      <Rect x={0} y={0} width={PAGE_WIDTH} height={PAGE_HEIGHT} fill={paper} listening={false} />
      <Shape
        listening={false}
        perfectDrawEnabled={false}
        sceneFunc={(ctx) => {
          const c = ctx._context;
          // Soft light from the top left, fading out by 70% of the way across.
          if (highlight && !/,\s*0\)$/.test(highlight)) {
            const cx = PAGE_WIDTH * 0.35;
            const cy = PAGE_HEIGHT * 0.25;
            const g = c.createRadialGradient(cx, cy, 0, cx, cy, PAGE_HEIGHT * 0.7);
            g.addColorStop(0, highlight);
            g.addColorStop(1, "rgba(236,220,186,0)");
            c.fillStyle = g;
            c.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
          }
          c.beginPath();
          c.strokeStyle = rule;
          c.lineWidth = 1;
          for (let y = FIRST_RULE_Y; y < PAGE_HEIGHT; y += RULE_STEP) {
            c.moveTo(0, y + 0.5);
            c.lineTo(PAGE_WIDTH, y + 0.5);
          }
          c.stroke();
          c.beginPath();
          c.strokeStyle = margin;
          c.lineWidth = 1.5;
          c.moveTo(MARGIN_X1 + 0.75, 0);
          c.lineTo(MARGIN_X1 + 0.75, PAGE_HEIGHT);
          c.stroke();
          c.beginPath();
          c.strokeStyle = marginThin;
          c.lineWidth = 1;
          c.moveTo(MARGIN_X2 + 0.5, 0);
          c.lineTo(MARGIN_X2 + 0.5, PAGE_HEIGHT);
          c.stroke();
        }}
      />
    </>
  );
}

/** What a page needs to draw itself off screen as it looks in the book. */
export type SceneContext = {
  notebookPath: string;
  side: "l" | "r";
  /** Position in the section (0-based); the right page shows "p. index + 1". */
  index: number;
  /** The facing page's title, for a right page with no title of its own. */
  otherTitle: string;
  /** "Druid 3 · 40 HP" on a session's first page. */
  pill: string | null;
  sheet?: { sheet: Sheet; trackers: Trackers; name: string };
};

const ukDate = (iso: string) => {
  try {
    return format(parseISO(iso), "EEE d MMM yyyy");
  } catch {
    return iso;
  }
};

/** The page header as the book shows it, drawn in Konva so exports match the screen. */
export function PageHeaderScene({ page, ctx }: { page: Page; ctx: SceneContext }) {
  const t = useCanvasTheme();
  return (
    <Shape
      listening={false}
      sceneFunc={(c) => {
        const g = c._context;
        g.save();
        g.textBaseline = "alphabetic";
        const meta = (text: string, x: number, y: number, align: CanvasTextAlign = "left") => {
          g.font = `500 13px "Alegreya Sans"`;
          g.fillStyle = t.token("--muted-on-paper");
          g.textAlign = align;
          g.fillText(text, x, y);
        };
        if (ctx.side === "r") {
          meta(page.title || `${ctx.otherTitle}, cont.`, 92, 74);
          meta(`p. ${ctx.index + 1}`, PAGE_WIDTH - 36, 74, "right");
        } else {
          g.font = `700 30px Alegreya`;
          g.fillStyle = t.token("--ink-title");
          g.fillText(page.title, 92, 52, PAGE_WIDTH - 92 - 36 - (ctx.pill ? 130 : 0));
          meta(
            page.session
              ? [ukDate(page.session.date), page.session.place].filter(Boolean).join(" · ")
              : `Started ${ukDate(page.createdAt)}`,
            92,
            76,
          );
          if (ctx.pill) {
            g.font = `600 12px "Alegreya Sans"`;
            const w = g.measureText(ctx.pill).width + 20;
            const x = PAGE_WIDTH - 36 - w;
            g.beginPath();
            g.roundRect?.(x, 50, w, 26, 13);
            g.fillStyle = "rgba(142,42,42,0.06)";
            g.fill();
            g.lineWidth = 1.5;
            g.strokeStyle = "rgba(142,42,42,0.45)";
            g.stroke();
            g.fillStyle = "#7d2626";
            g.textAlign = "left";
            g.fillText(ctx.pill, x + 10, 67);
          }
        }
        g.restore();
      }}
    />
  );
}

/** A whole page, read-only, as the book shows it: what exports and snapshots draw. */
export function PageScene({ page, ctx }: { page: Page; ctx: SceneContext }) {
  const ordered = useMemo(() => drawOrder(page.elements), [page.elements]);
  return (
    <>
      <PaperBackground />
      {page.sheetPageType && ctx.sheet ? (
        <SheetTemplate
          type={page.sheetPageType}
          index={page.sheetIndex ?? 0}
          sheet={ctx.sheet.sheet}
          trackers={ctx.sheet.trackers}
          characterName={ctx.sheet.name}
        />
      ) : (
        <PageHeaderScene page={page} ctx={ctx} />
      )}
      {ordered.map((el) => (
        <ElementNode key={el.id} el={el} notebookPath={ctx.notebookPath} draggable={false} hidden={false} />
      ))}
    </>
  );
}
