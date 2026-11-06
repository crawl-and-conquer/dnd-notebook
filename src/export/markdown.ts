import type { Element, Page } from "../model/page";
import { readingOrder } from "../model/readingOrder";

export type MarkdownOptions = {
  tabName: string;
  /** The page file name without `.page.json`; names the snapshot image. */
  fileBase: string;
  includeImages: boolean;
  includeDone: boolean;
};

export const snapshotPath = (fileBase: string) => `assets/${fileBase}-snapshot.png`;

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

/** One element as Markdown, or nothing for drawings. */
function elementMarkdown(
  el: Element,
  opts: MarkdownOptions,
  assets: string[],
): string | null {
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
      return `![Image](${el.asset})`;
    }
    default:
      return null;
  }
}

/**
 * A page as Markdown (SPEC: Export, Markdown): front matter, the page snapshot
 * first, then text in reading order. Returns the pasted images to copy.
 */
export function pageToMarkdown(
  page: Page,
  opts: MarkdownOptions,
): { markdown: string; assets: string[] } {
  const assets: string[] = [];
  const blocks: string[] = [];
  for (const el of readingOrder(page.elements)) {
    const md = elementMarkdown(el, opts, assets);
    if (md) blocks.push(md);
  }
  const front = [
    "---",
    `title: ${yaml(page.title || "Untitled page")}`,
    `tab: ${yaml(opts.tabName)}`,
    `created: ${page.createdAt}`,
    `updated: ${page.updatedAt}`,
    "---",
  ].join("\n");
  const parts = [front, "", `# ${page.title || "Untitled page"}`, ""];
  if (opts.includeImages) parts.push(`![Page snapshot](${snapshotPath(opts.fileBase)})`, "");
  parts.push(blocks.length ? blocks.join("\n\n") : "_No text on this page._", "");
  return { markdown: parts.join("\n"), assets: [...new Set(assets)] };
}

