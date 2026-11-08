import { comparePageFiles, parsePage, serialisePage, type Page } from "../model/page";
import { backend } from "./backend";
import { notebookPathFor, pagePath, sectionPagesDir } from "./paths";

export type LoadedPage = {
  fileName: string;
  page: Page;
  readOnly: boolean;
  warning?: string;
};

/**
 * The exact text the app last read from or wrote to each page file, keyed by path. A watcher
 * event whose file still holds this text came from the app itself, not from outside.
 */
const knownText = new Map<string, string>();

export function knownDiskText(path: string): string | undefined {
  return knownText.get(path);
}

export function rememberDiskText(path: string, text: string): void {
  knownText.set(path, text);
}

export function forgetDiskText(path: string): void {
  knownText.delete(path);
}

export type SectionLoadResult =
  | { status: "ok"; pages: LoadedPage[]; errors: string[] }
  | { status: "missing" };

/** Reads every page in one section folder. Missing folder → "missing". */
export async function loadSectionPages(
  notebookPath: string,
  sectionId: string,
): Promise<SectionLoadResult> {
  const dir = sectionPagesDir(notebookPath, sectionId);
  if (!(await backend.pathExists(dir))) return { status: "missing" };

  const names = await backend.listSectionPageFiles(notebookPath, sectionId);
  const pages: LoadedPage[] = [];
  const errors: string[] = [];
  for (const fileName of names) {
    try {
      const path = pagePath(notebookPath, sectionId, fileName);
      const text = await backend.readTextFile(path);
      rememberDiskText(path, text);
      const parsed = parsePage(text);
      if (parsed.ok) {
        pages.push({
          fileName,
          page: parsed.page,
          readOnly: parsed.readOnly,
          warning: parsed.warning,
        });
      } else {
        errors.push(`${fileName}: ${parsed.error}`);
      }
    } catch (e) {
      errors.push(`${fileName}: ${String(e)}`);
    }
  }
  pages.sort(comparePageFiles);
  return { status: "ok", pages, errors };
}

export type CharacterLoadResult =
  | { status: "ok"; notebookPath: string; sectionPages: Record<string, LoadedPage[]>; errors: string[] }
  | { status: "missing"; notebookPath: string };

/** Loads all pages for all sections of a character. */
export async function loadCharacter(
  folder: string,
  sectionIds: string[],
): Promise<CharacterLoadResult> {
  const notebookPath = notebookPathFor(folder);
  if (!(await backend.pathExists(notebookPath))) return { status: "missing", notebookPath };

  const allErrors: string[] = [];
  const sectionPages: Record<string, LoadedPage[]> = {};
  await Promise.all(
    sectionIds.map(async (sid) => {
      const r = await loadSectionPages(notebookPath, sid);
      if (r.status === "ok") {
        sectionPages[sid] = r.pages;
        allErrors.push(...r.errors);
      } else {
        sectionPages[sid] = [];
      }
    }),
  );
  return { status: "ok", notebookPath, sectionPages, errors: allErrors };
}

export async function savePage(
  notebookPath: string,
  sectionId: string,
  fileName: string,
  page: Page,
): Promise<void> {
  const path = pagePath(notebookPath, sectionId, fileName);
  const text = serialisePage(page);
  rememberDiskText(path, text);
  await backend.writeTextAtomic(path, text);
}
