import type { Page } from "../model/page";
import { readingOrder } from "../model/readingOrder";

/** SPEC M8: the last three sessions' text, and snapshots of their spreads if the model takes images. */
export const RECAP_SESSIONS = 3;

/** One session: its first page and the pages written after it, up to the next session. */
export type SessionGroup = { start: number; end: number; page: Page };

/** Splits a Sessions section into sessions. Pages before the first session page are left out. */
export function sessionGroups(pages: Page[]): SessionGroup[] {
  const out: SessionGroup[] = [];
  pages.forEach((page, i) => {
    if (page.session) {
      if (out.length) out[out.length - 1].end = i;
      out.push({ start: i, end: pages.length, page });
    }
  });
  return out;
}

/** The sessions to recap for the session starting at `index`: up to three before it, oldest first. */
export function sessionsBefore(pages: Page[], index: number, count = RECAP_SESSIONS): SessionGroup[] {
  return sessionGroups(pages)
    .filter((g) => g.start < index)
    .slice(-count);
}

function pageText(page: Page): string {
  const lines: string[] = [];
  for (const el of readingOrder(page.elements)) {
    if (el.type === "text" && el.text.trim() && !el.sticky) lines.push(el.text.trim());
    if (el.type === "checklist") {
      for (const item of el.items) if (item.text.trim()) lines.push(`- [${item.done ? "x" : " "}] ${item.text.trim()}`);
    }
    if (el.type === "image" && el.caption.trim()) lines.push(`(Photo: ${el.caption.trim()})`);
  }
  return lines.join("\n");
}

/** The text sent to the model: each session's heading, date and place, then what was written. */
export function recapText(pages: Page[], groups: SessionGroup[]): string {
  if (!groups.length) return "(No earlier sessions in this notebook.)";
  return groups
    .map((g) => {
      const s = g.page.session!;
      const head = `## ${g.page.title || `Session ${s.number}`} (${s.date}${s.place ? `, ${s.place}` : ""})`;
      const body = pages
        .slice(g.start, g.end)
        .map(pageText)
        .filter(Boolean)
        .join("\n");
      return `${head}\n${body || "(Nothing written, or only drawings.)"}`;
    })
    .join("\n\n");
}
