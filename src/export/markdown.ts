import type { Element, Page } from "../model/page";
import { readingOrder } from "../model/readingOrder";

export type MarkdownOptions = {
  character: string;
  section: string;
  /** The spread snapshot image, relative to the Markdown file, or null for none. */
  snapshot: string | null;
  includeImages: boolean;
  includeDone: boolean;
  /** Extra Markdown after the snapshot: the tables of a character sheet page. */
  extra?: string;
};

/** Stops typed text being read as Markdown syntax at the start of a line. */
function escapeLine(line: string): string {
  return line.replace(/^(\s*)([#>+*-]|\d+[.)])(\s)/, "$1\\$2$3");
}

const yaml = (s: string) => JSON.stringify(s);

function paragraph(text: string): string {
  return text
    .split(/\r?\n/)
    .map((l) => escapeLine(l.trimEnd()))
    .join("  \n");
}

/** One element as Markdown, or nothing for drawings. Handwriting exports as its plain text. */
function elementMarkdown(el: Element, opts: MarkdownOptions, assets: string[]): string | null {
  switch (el.type) {
    case "text": {
      if (!el.text.trim()) return null;
      if (el.heading) return `## ${el.text.replace(/\s+/g, " ").trim()}`;
      return paragraph(el.text.trim());
    }
    case "checklist": {
      const lines = el.items
        .filter((i) => opts.includeDone || !i.done)
        .map((i) => `- [${i.done ? "x" : " "}] ${i.text.replace(/\s+/g, " ").trim()}`);
      return lines.length ? lines.join("\n") : null;
    }
    case "image": {
      if (!opts.includeImages) return null;
      assets.push(el.asset);
      const alt = el.caption ? el.caption.replace(/[[\]]/g, "") : "Photo";
      return `![${alt}](${el.asset})`;
    }
    default:
      return null;
  }
}

/**
 * A page as Markdown (SPEC: Export, Markdown): front matter (character, section, page,
 * created, updated), the spread snapshot, then text in reading order. Returns the photos to copy.
 */
export function pageToMarkdown(page: Page, opts: MarkdownOptions): { markdown: string; assets: string[] } {
  const assets: string[] = [];
  const blocks: string[] = [];
  for (const el of readingOrder(page.elements)) {
    const md = elementMarkdown(el, opts, assets);
    if (md) blocks.push(md);
  }
  const front = [
    "---",
    `character: ${yaml(opts.character)}`,
    `section: ${yaml(opts.section)}`,
    `page: ${yaml(page.title || "Untitled page")}`,
    ...(page.session
      ? [`session: ${page.session.number}`, `date: ${page.session.date}`, `place: ${yaml(page.session.place)}`]
      : []),
    `created: ${page.createdAt}`,
    `updated: ${page.updatedAt}`,
    "---",
  ].join("\n");
  const parts = [front, "", `# ${page.title || "Untitled page"}`, ""];
  if (opts.snapshot) parts.push(`![Spread](${opts.snapshot})`, "");
  if (opts.extra) parts.push(opts.extra, "");
  if (blocks.length) parts.push(blocks.join("\n\n"), "");
  else if (!opts.extra) parts.push("_No text on this page._", "");
  return { markdown: parts.join("\n"), assets: [...new Set(assets)] };
}
