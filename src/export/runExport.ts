import { format } from "date-fns";
import type { ExportSettings, TabConfig } from "../model/config";
import { backend } from "../storage/backend";
import type { LoadedPage } from "../storage/notebook";
import { useNotebook, visibleTabs } from "../store/notebook";
import { cssVar } from "../canvas/theme";
import { pageToMarkdown, snapshotPath } from "./markdown";
import { pageBase, safeName, uniqueNamer } from "./names";
import {
  addNotebookPage,
  contentsPageCount,
  insertContents,
  newPdf,
  type PdfColours,
} from "./pdf";
import { bytesToBase64, renderPagePng } from "./render";

export type ExportScope = "all" | "tab" | "page";

export type ExportOptions = Omit<ExportSettings, "destination"> & {
  scope: ExportScope;
  tabId?: string;
  pageId?: string;
  destination: string;
};

export type ExportProgress = { done: number; total: number; label: string };
export type ExportResult = { root: string; pages: number; files: number; cancelled: boolean };

type Target = { tab: TabConfig; notesPath: string; pages: LoadedPage[] };

/** Which tabs and pages an export covers, from what is loaded. */
export function exportTargets(scope: ExportScope, tabId?: string, pageId?: string): Target[] {
  const s = useNotebook.getState();
  return visibleTabs(s.config)
    .filter((t) => scope === "all" || t.id === tabId)
    .flatMap((tab) => {
      const st = s.tabs[tab.id];
      if (st?.status !== "ok") return [];
      const pages = scope === "page" ? st.pages.filter((p) => p.page.id === pageId) : st.pages;
      return pages.length ? [{ tab, notesPath: st.notesPath, pages }] : [];
    });
}

function pdfColours(print: boolean): PdfColours {
  return print
    ? {
        background: cssVar("--print-paper"),
        text: cssVar("--print-text"),
        muted: cssVar("--print-text-muted"),
      }
    : { background: cssVar("--desk"), text: cssVar("--text"), muted: cssVar("--text-muted") };
}

const longDate = (iso: string) => format(new Date(iso), "EEE d MMM yyyy");

/**
 * Writes Markdown, PDF or both (SPEC: Export) into
 * `<destination>/notebook-export-<date>/<Tab>/...`, plus Reminders.md/.pdf.
 */
export async function runExport(
  opts: ExportOptions,
  onProgress: (p: ExportProgress) => void,
  signal?: AbortSignal,
): Promise<ExportResult> {
  const targets = exportTargets(opts.scope, opts.tabId, opts.pageId);
  const total = targets.reduce((n, t) => n + t.pages.length, 0);
  if (!total) throw new Error("There are no pages to export.");

  const today = new Date();
  const root = await backend.exportPrepareDir(opts.destination, format(today, "yyyy-MM-dd"));
  const md = opts.format !== "pdf";
  const pdf = opts.format !== "markdown";
  const colours = pdfColours(opts.printerFriendly);
  const grid = useNotebook.getState().config.general.gridSize;
  const tabFolder = uniqueNamer();
  let files = 0;
  let done = 0;

  const writeText = async (rel: string, text: string) => {
    await backend.exportWriteText(root, rel, text);
    files++;
  };
  const writeBytes = async (rel: string, bytes: Uint8Array) => {
    await backend.exportWrite(root, rel, bytesToBase64(bytes));
    files++;
  };

  for (const target of targets) {
    const dir = tabFolder(safeName(target.tab.name, "Tab"));
    const combine = pdf && opts.scope !== "page";
    const combined = combine ? await newPdf(`${target.tab.name}: notebook export`) : null;
    const offset = combine ? contentsPageCount(target.pages.length) : 0;
    const combinedTotal = offset + target.pages.length;

    for (const [i, loaded] of target.pages.entries()) {
      if (signal?.aborted) return { root, pages: done, files, cancelled: true };
      const page = loaded.page;
      const base = pageBase(loaded.fileName);
      onProgress({ done, total, label: `${target.tab.name}: ${page.title || "Untitled page"}` });

      const png = await renderPagePng(page, target.notesPath, {
        theme: opts.printerFriendly ? "print" : "screen",
        pixelRatio: 2,
        includeImages: opts.includeImages,
        grid,
      });

      if (md) {
        const r = pageToMarkdown(page, {
          tabName: target.tab.name,
          fileBase: base,
          includeImages: opts.includeImages,
          includeDone: opts.includeDone,
        });
        await writeText(`${dir}/${base}.md`, r.markdown);
        if (opts.includeImages) {
          await writeBytes(`${dir}/${snapshotPath(base)}`, png);
          for (const asset of r.assets) {
            await backend.exportCopyAsset(target.notesPath, asset, root, `${dir}/${asset}`);
            files++;
          }
        }
      }

      if (pdf) {
        const meta = {
          tabName: target.tab.name,
          pageTitle: page.title,
          created: longDate(page.createdAt),
        };
        const single = await newPdf(page.title || "Untitled page");
        await addNotebookPage(single.doc, single.fonts, png, meta, colours, 1, 1);
        await writeBytes(`${dir}/${base}.pdf`, await single.doc.save());
        if (combined) {
          await addNotebookPage(
            combined.doc,
            combined.fonts,
            png,
            meta,
            colours,
            offset + i + 1,
            combinedTotal,
          );
        }
      }
      done++;
    }

    if (combined) {
      insertContents(
        combined.doc,
        combined.fonts,
        colours,
        target.tab.name,
        `Notebook export, ${format(today, "EEE d MMM yyyy")}. ${target.pages.length} page${target.pages.length === 1 ? "" : "s"}.`,
        target.pages.map((p, i) => ({
          title: p.page.title,
          created: longDate(p.page.createdAt),
          pageNumber: offset + i + 1,
        })),
        combinedTotal,
      );
      await writeBytes(`${dir}/${dir} - all pages.pdf`, await combined.doc.save());
    }
  }

  onProgress({ done, total, label: "Finished" });
  return { root, pages: done, files, cancelled: false };
}
