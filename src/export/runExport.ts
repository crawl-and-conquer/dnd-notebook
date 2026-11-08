import { format, parseISO } from "date-fns";
import type { CharacterConfig, ExportSettings } from "../model/config";
import type { Section } from "../model/character";
import { backend } from "../storage/backend";
import type { LoadedPage } from "../storage/notebook";
import { useNotebook, visibleCharacters } from "../store/notebook";
import { cssVar } from "../canvas/theme";
import { pageToMarkdown } from "./markdown";
import { pageBase, safeName, uniqueNamer } from "./names";
import { addSpreadPage, contentsPageCount, insertContents, newPdf, type PdfColours } from "./pdf";
import { bytesToBase64, renderSpreadPng, type RenderContext } from "./render";
import { sheetMarkdown } from "./sheetMarkdown";

export type ExportScope = "all" | "character" | "section" | "spread";

export type ExportOptions = Omit<ExportSettings, "destination"> & {
  scope: ExportScope;
  characterId?: string;
  sectionId?: string;
  spreadIndex?: number;
  destination: string;
};

export type ExportProgress = { done: number; total: number; label: string };
export type ExportResult = { root: string; pages: number; files: number; cancelled: boolean };

type Spread = { left: LoadedPage; right: LoadedPage | null; leftIndex: number };
type SectionTarget = { section: Section; spreads: Spread[] };
type Target = { character: CharacterConfig; sections: SectionTarget[] };

const pairs = (pages: LoadedPage[]): Spread[] => {
  const out: Spread[] = [];
  for (let i = 0; i < pages.length; i += 2) out.push({ left: pages[i], right: pages[i + 1] ?? null, leftIndex: i });
  return out;
};

/** Which characters, sections and spreads an export covers, from what is loaded. */
export function exportTargets(scope: ExportScope, characterId?: string, sectionId?: string, spreadIndex?: number): Target[] {
  const s = useNotebook.getState();
  return visibleCharacters(s.config)
    .filter((c) => scope === "all" || c.id === characterId)
    .flatMap((character) => {
      const ch = s.characters[character.id];
      if (ch?.status !== "ok") return [];
      const sections = ch.character.sections
        .filter((sec) => scope === "all" || scope === "character" || sec.id === sectionId)
        .map((section) => {
          let spreads = pairs(ch.sectionPages[section.id] ?? []);
          if (scope === "spread") spreads = spreads.filter((_, i) => i === spreadIndex);
          return { section, spreads };
        })
        .filter((x) => x.spreads.length > 0);
      return sections.length ? [{ character, sections }] : [];
    });
}

export const countPages = (targets: Target[]) =>
  targets.reduce((n, t) => n + t.sections.reduce((m, s) => m + s.spreads.reduce((k, sp) => k + (sp.right ? 2 : 1), 0), 0), 0);

function pdfColours(print: boolean): PdfColours {
  return print
    ? { background: "#ffffff", text: "#2b2622", muted: "#6f5a45" }
    : { background: cssVar("--desk") || "#2b2019", text: cssVar("--text") || "#f1e6d2", muted: cssVar("--text-muted") || "#bfae90" };
}

const longDate = (iso: string) => {
  try {
    return format(parseISO(iso), "EEE d MMM yyyy");
  } catch {
    return iso;
  }
};

/**
 * Writes Markdown, PDF or both (SPEC: Export) into a fresh `notebook-export-<date>` folder:
 * `<Character>/<Section>/0001-<slug>.md` per page, `.pdf` per spread, and `<Character>.pdf`
 * combining every section with a contents page.
 */
export async function runExport(
  opts: ExportOptions,
  onProgress: (p: ExportProgress) => void,
  signal?: AbortSignal,
): Promise<ExportResult> {
  const targets = exportTargets(opts.scope, opts.characterId, opts.sectionId, opts.spreadIndex);
  const total = countPages(targets);
  if (!total) throw new Error("There are no pages to export.");

  const today = new Date();
  const root = await backend.exportPrepareDir(opts.destination, format(today, "yyyy-MM-dd"));
  const md = opts.format !== "pdf";
  const pdf = opts.format !== "markdown";
  const colours = pdfColours(opts.printerFriendly);
  const renderOpts = { theme: opts.printerFriendly ? ("print" as const) : ("screen" as const), pixelRatio: 2, includeImages: opts.includeImages };
  const charFolder = uniqueNamer();
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
    const s = useNotebook.getState();
    const ch = s.characters[target.character.id];
    if (ch?.status !== "ok") continue;
    const name = target.character.name;
    const dir = charFolder(safeName(name, "Character"));
    const hand = { glyphs: ch.glyphs, hand: ch.character.hand };
    const sheetCtx = { sheet: ch.sheet, trackers: ch.trackers, name };
    const pill =
      ch.sheet.identity.classLevel || ch.sheet.combat.maxHp !== null
        ? [ch.sheet.identity.classLevel, ch.sheet.combat.maxHp !== null ? `${ch.sheet.combat.maxHp} HP` : null].filter(Boolean).join(" · ")
        : null;
    const spreadCount = target.sections.reduce((n, x) => n + x.spreads.length, 0);
    const combine = pdf && opts.scope !== "spread" && opts.scope !== "section";
    const combined = combine ? await newPdf(`${name}: notebook export`) : null;
    const offset = combine ? contentsPageCount(spreadCount) : 0;
    const contents: { title: string; created: string; pageNumber: number }[] = [];
    const sectionFolder = uniqueNamer();
    let spreadNo = 0;

    for (const { section, spreads } of target.sections) {
      const secDir = `${dir}/${sectionFolder(safeName(section.name, "Section"))}`;
      for (const sp of spreads) {
        if (signal?.aborted) return { root, pages: done, files, cancelled: true };
        const ctxFor = (lp: LoadedPage, side: "l" | "r", index: number, other: LoadedPage | null): RenderContext => ({
          notebookPath: ch.notebookPath,
          side,
          index,
          otherTitle: other?.page.title ?? "",
          pill: side === "l" && section.kind === "sessions" && lp.page.session ? pill : null,
          sheet: lp.page.sheetPageType ? sheetCtx : undefined,
          hand,
        });
        onProgress({ done, total, label: `${name}: ${section.name}, ${sp.left.page.title || "Untitled page"}` });
        const png = await renderSpreadPng(
          { page: sp.left.page, ctx: ctxFor(sp.left, "l", sp.leftIndex, sp.right) },
          sp.right ? { page: sp.right.page, ctx: ctxFor(sp.right, "r", sp.leftIndex + 1, sp.left) } : null,
          renderOpts,
        );
        const base = pageBase(sp.left.fileName);
        const snapshot = `assets/${base}-spread.png`;

        if (md) {
          if (opts.includeImages) await writeBytes(`${secDir}/${snapshot}`, png);
          for (const lp of [sp.left, sp.right].filter((x): x is LoadedPage => !!x)) {
            const r = pageToMarkdown(lp.page, {
              character: name,
              section: section.name,
              snapshot: opts.includeImages ? snapshot : null,
              includeImages: opts.includeImages,
              includeDone: opts.includeDone,
              extra:
                lp.page.sheetPageType
                  ? sheetMarkdown(lp.page.sheetPageType, lp.page.sheetIndex ?? 0, ch.sheet, ch.trackers)
                  : undefined,
            });
            await writeText(`${secDir}/${pageBase(lp.fileName)}.md`, r.markdown);
            if (opts.includeImages) {
              for (const asset of r.assets) {
                await backend.exportCopyAsset(ch.notebookPath, asset, root, `${secDir}/${asset}`);
                files++;
              }
            }
            done++;
          }
        } else done += sp.right ? 2 : 1;

        if (pdf) {
          const title = sp.right && sp.right.page.title && !/, cont\.$/.test(sp.right.page.title)
            ? `${sp.left.page.title} / ${sp.right.page.title}`
            : sp.left.page.title || "Untitled page";
          const meta = { character: name, section: section.name, title, date: longDate(sp.left.page.createdAt) };
          const single = await newPdf(title);
          await addSpreadPage(single.doc, single.fonts, png, meta, colours, 1, 1);
          await writeBytes(`${secDir}/${base}.pdf`, await single.doc.save());
          if (combined) {
            spreadNo++;
            await addSpreadPage(combined.doc, combined.fonts, png, meta, colours, offset + spreadNo, offset + spreadCount);
            contents.push({ title: `${section.name}: ${title}`, created: meta.date, pageNumber: offset + spreadNo });
          }
        }
      }
    }

    if (combined) {
      insertContents(
        combined.doc,
        combined.fonts,
        colours,
        name,
        `Notebook export, ${format(today, "EEE d MMM yyyy")}. ${spreadCount} spread${spreadCount === 1 ? "" : "s"}.`,
        contents,
        offset + spreadCount,
      );
      await writeBytes(`${dir}/${dir}.pdf`, await combined.doc.save());
    }
  }

  onProgress({ done, total, label: "Finished" });
  return { root, pages: done, files, cancelled: false };
}
