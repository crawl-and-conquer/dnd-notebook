import { create } from "zustand";
import {
  defaultConfig,
  parseConfig,
  type AppConfig,
  type CharacterConfig,
} from "../model/config";
import {
  createPage,
  fileNumber,
  newId,
  nextFileNumber,
  parsePage,
  serialisePage,
  slugify,
  uniquePageFileName,
  type Element,
  type Page,
} from "../model/page";
import {
  newSectionId,
  readCharacter,
  serialiseCharacter,
  type Character,
  type Section,
} from "../model/character";
import { emptyGlyphs, parseGlyphs, serialiseGlyphs, type GlyphsData } from "../model/hand";
import {
  emptySheetData,
  emptyTrackers,
  parseSheetData,
  parseTrackers,
  serialiseSheet,
  serialiseTrackers,
  SHEET_PAGE_TYPES,
  longRest as longRestRule,
  shortRest as shortRestRule,
  type SheetData,
  type TrackerState,
  overrideValue,
  setPath,
} from "../model/sheet";
import { spellListPageCount, type Bubble } from "../sheet/layout";
import {
  emptyHistory,
  record,
  redo as redoStep,
  undo as undoStep,
  type History,
} from "../canvas/history";
import { backend } from "../storage/backend";
import {
  characterPath,
  glyphsPath,
  legacyGlyphsPath,
  notebookPathFor,
  pagePath,
  sectionPagesDir,
  sheetPath,
  trackersPath,
} from "../storage/paths";
import {
  forgetDiskText,
  knownDiskText,
  loadCharacter as loadCharacterFromDisk,
  rememberDiskText,
  savePage,
  type LoadedPage,
} from "../storage/notebook";
import { comparePageFiles } from "../model/page";

export const AUTOSAVE_DELAY_MS = 800;

/** State of one loaded character. */
export type CharacterState =
  | { status: "loading" }
  | { status: "missing"; notebookPath: string }
  | {
      status: "ok";
      notebookPath: string;
      character: Character;
      /** Pages per section id, in reading order. */
      sectionPages: Record<string, LoadedPage[]>;
      errors: string[];
      glyphs: GlyphsData;
      sheet: SheetData;
      trackers: TrackerState;
    };

export type SpreadPos = { characterId: string; sectionId: string; spreadIndex: number };
export type View = SpreadPos | { kind: "empty" };

/** A page on screen. `virtual` pages are blank paper that becomes a real file when written on. */
export type ShownPage = LoadedPage & { index: number; virtual: boolean };

export type SaveState =
  | { kind: "saved"; at?: Date }
  | { kind: "unsaved" }
  | { kind: "saving" }
  | { kind: "read-only"; reason: string }
  | { kind: "error"; message: string };

type NotebookStore = {
  ready: boolean;
  config: AppConfig;
  characters: Record<string, CharacterState>;
  view: View;
  save: SaveState;
  settingsOpen: boolean;
  pageListOpen: boolean;
  handwritingOpen: boolean;
  notice: string | null;
  flash: { elementId: string; nonce: number } | null;
  historyTick: number;
  /** Which page of the spread tools act on: 0 left, 1 right. */
  pageOffset: 0 | 1;

  setPageOffset(offset: 0 | 1): void;
  init(): Promise<void>;
  updateConfig(mutate: (c: AppConfig) => AppConfig): Promise<void>;
  addCharacter(input: {
    name: string;
    cover: string;
    folder: string;
    notebookPath: string;
  }): Promise<void>;
  renameCharacter(characterId: string, name: string): Promise<void>;
  setCharacterCover(characterId: string, cover: string): Promise<void>;
  archiveCharacter(characterId: string): Promise<void>;
  restoreCharacter(characterId: string): Promise<void>;
  moveCharacter(characterId: string, slot: number): Promise<void>;
  /** After a change of folder: point the character at `folder` and load it from there. */
  setCharacterFolder(characterId: string, folder: string): Promise<void>;
  reloadCharacter(characterId: string): Promise<void>;
  openCharacter(characterId: string): void;
  openSection(characterId: string, sectionId: string): void;

  addSection(characterId: string, name: string, colour: string): Promise<string | null>;
  updateSection(
    characterId: string,
    sectionId: string,
    patch: Partial<Pick<Section, "name" | "colour">>,
  ): Promise<void>;
  moveSection(characterId: string, sectionId: string, slot: number): Promise<void>;
  /** Removes a section; its folder (and any pages) goes to the Recycle Bin. */
  removeSection(characterId: string, sectionId: string): Promise<boolean>;

  setSettingsOpen(open: boolean): void;
  setPageListOpen(open: boolean): void;
  setHandwritingOpen(open: boolean): void;
  saveGlyphs(characterId: string, glyphs: GlyphsData): Promise<void>;
  updateHandSettings(characterId: string, hand: Character["hand"]): Promise<void>;
  setSheetData(characterId: string, sheet: SheetData): Promise<void>;
  /** A value typed on a sheet page: saved to sheet.json as an override, or to trackers.json for HP. */
  editSheetValue(characterId: string, path: string, text: string): Promise<void>;
  /** A bubble clicked on a sheet page: slots, uses, hit dice, death saves or a prepared spell. */
  toggleSheetBubble(characterId: string, act: Bubble): Promise<void>;
  /** Adds any sheet pages the sheet needs that the section does not have yet. */
  syncSheetPages(characterId: string): Promise<void>;
  /** The page at this position in a section, creating it (and any blank pages before it) if needed. */
  ensurePage(characterId: string, sectionId: string, index: number): Promise<LoadedPage | null>;
  updateTrackers(characterId: string, mutate: (t: TrackerState) => TrackerState): Promise<void>;
  longRest(characterId: string): Promise<void>;
  shortRest(characterId: string): Promise<void>;
  /** Puts the trackers back as they were before the last rest. */
  undoRest(characterId: string): Promise<void>;
  canUndoRest(characterId: string): boolean;
  dismissNotice(): void;

  /** Navigate to a spread by index in the current section. */
  goToSpread(index: number): void;
  /** Move by delta spreads (+1 next, -1 prev). */
  goToSpreadDelta(delta: number): void;
  /** Opens the spread holding the page with this id in the current section. */
  goToPage(pageId: string): void;

  /** Starts a new spread at the end of the current section. */
  newSpread(): Promise<void>;
  /** Kept for callers that add a single page: same as a new spread. */
  newPage(): Promise<void>;
  /** Sessions: a new spread titled "Session N" with today's date and a place field. */
  newSession(): Promise<void>;
  duplicatePage(characterId: string, sectionId: string, pageId: string): Promise<void>;
  deletePage(characterId: string, sectionId: string, pageId: string): Promise<boolean>;
  renamePage(characterId: string, sectionId: string, pageId: string, title: string): void;

  updatePage(mutate: (p: Page) => Page): void;
  updatePageIn(characterId: string, sectionId: string, pageId: string, mutate: (p: Page) => Page): void;
  editElements(mutate: (els: Element[]) => Element[]): void;
  undo(): void;
  redo(): void;
  flushSaves(): Promise<void>;
  /** `files` are `<sectionId>/<file>.page.json`, as the folder watcher reports them. */
  applyOutsideChanges(notebookPath: string, files: string[], rescan?: boolean): Promise<void>;
  clearFlash(): void;
};

const histories = new Map<string, History<Element[]>>();
const restUndo = new Map<string, TrackerState[]>();

export function historyFor(pageId: string | undefined): { canUndo: boolean; canRedo: boolean } {
  const h = pageId ? histories.get(pageId) : undefined;
  return { canUndo: !!h && h.past.length > 0, canRedo: !!h && h.future.length > 0 };
}

const sameElements = (a: Element[], b: Element[]) =>
  a.length === b.length && a.every((el, i) => el === b[i]);

export const visibleCharacters = (c: AppConfig): CharacterConfig[] =>
  c.characters.filter((ch) => !ch.archived).sort((a, b) => a.order - b.order);

/** Spreads in a section: pages in pairs, the first page always on the left; never fewer than one. */
export const spreadCount = (pageCount: number) => Math.max(1, Math.ceil(pageCount / 2));

// ----- blank pages -----

/**
 * Blank pages shown where a spread has no page yet. They are cached so the same blank page
 * (and its id) comes back on every render until it is written on.
 */
const blanks = new Map<string, Page>();

function blankPage(
  characterId: string,
  section: Section | undefined,
  sectionId: string,
  index: number,
  pages: LoadedPage[],
): Page {
  const key = `${characterId}:${sectionId}:${index}`;
  let p = blanks.get(key);
  if (!p) {
    if (index % 2 === 1) {
      // A right-hand page continues whatever is on the left.
      const prev = pages[index - 1]?.page ?? blankPage(characterId, section, sectionId, index - 1, pages);
      p = createPage(new Date(), `${prev.title.replace(/, cont\.$/, "")}, cont.`, sectionId);
    } else if (section?.kind === "sessions") {
      const number = Math.max(0, ...pages.map((x) => x.page.session?.number ?? 0)) + 1;
      p = {
        ...createPage(new Date(), `Session ${number}`, sectionId),
        session: { number, date: todayIso(), place: "" },
      };
    } else {
      p = createPage(new Date(), index === 0 ? (section?.name ?? "Untitled page") : "Untitled page", sectionId);
    }
    blanks.set(key, p);
  }
  return p;
}

function todayIso(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function forgetBlanks(characterId: string, sectionId: string) {
  for (const k of [...blanks.keys()])
    if (k.startsWith(`${characterId}:${sectionId}:`)) blanks.delete(k);
}

// Selectors must return the same object for the same page, or React re-renders forever.
const shownCache = new WeakMap<LoadedPage, Map<number, ShownPage>>();
const blankCache = new WeakMap<Page, ShownPage>();

function shown(loaded: LoadedPage, index: number): ShownPage {
  let byIndex = shownCache.get(loaded);
  if (!byIndex) shownCache.set(loaded, (byIndex = new Map()));
  let s = byIndex.get(index);
  if (!s) byIndex.set(index, (s = { ...loaded, index, virtual: false }));
  return s;
}

function shownBlank(page: Page, index: number): ShownPage {
  let s = blankCache.get(page);
  if (!s || s.index !== index) {
    s = { fileName: "", page, readOnly: false, index, virtual: true };
    blankCache.set(page, s);
  }
  return s;
}

/** The two pages of the current spread; blank paper where there is no page yet. */
export function currentSpreadPages(
  s: Pick<NotebookStore, "view" | "characters">,
): { left: ShownPage; right: ShownPage; spreadIndex: number; spreadCount: number } | null {
  if (!("characterId" in s.view)) return null;
  const { characterId, sectionId, spreadIndex } = s.view;
  const ch = s.characters[characterId];
  if (!ch || ch.status !== "ok") return null;
  const pages = ch.sectionPages[sectionId] ?? [];
  const section = ch.character.sections.find((x) => x.id === sectionId);
  const side = (index: number): ShownPage =>
    pages[index]
      ? shown(pages[index], index)
      : shownBlank(blankPage(characterId, section, sectionId, index, pages), index);
  return {
    left: side(spreadIndex * 2),
    right: side(spreadIndex * 2 + 1),
    spreadIndex,
    spreadCount: Math.max(spreadCount(pages.length), spreadIndex + 1),
  };
}

/** The page tools act on (left or right of the spread, by `pageOffset`). */
export function currentPageOf(
  s: Pick<NotebookStore, "view" | "characters" | "pageOffset">,
): { characterId: string; sectionId: string; loaded: ShownPage; index: number; count: number } | null {
  const spread = currentSpreadPages(s);
  if (!spread || !("characterId" in s.view)) return null;
  const { characterId, sectionId } = s.view;
  const ch = s.characters[characterId];
  const count = ch?.status === "ok" ? (ch.sectionPages[sectionId] ?? []).length : 0;
  const loaded = s.pageOffset === 1 ? spread.right : spread.left;
  return { characterId, sectionId, loaded, index: loaded.index, count };
}

// ----- autosave plumbing -----

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const pending = new Map<string, () => Promise<void>>();
const inFlight = new Map<string, Promise<void>>();
const outsideQueue = new Map<string, Promise<void>>();
const watched = new Map<string, string>();
/** Where each character was last open, so switching back returns to the same spread. */
const lastViewOf = new Map<string, { sectionId: string; spreadIndex: number }>();

function scheduleSave(key: string, run: () => Promise<void>) {
  const old = timers.get(key);
  if (old) clearTimeout(old);
  pending.set(key, run);
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      const job = pending.get(key);
      pending.delete(key);
      void job?.();
    }, AUTOSAVE_DELAY_MS),
  );
}

let configWrite: ReturnType<typeof setTimeout> | undefined;

export const useNotebook = create<NotebookStore>((set, get) => {
  async function persistConfig(config: AppConfig) {
    await backend.writeAppConfig(JSON.stringify(config, null, 2) + "\n");
  }

  function setCharacter(characterId: string, state: CharacterState) {
    set((s) => ({ characters: { ...s.characters, [characterId]: state } }));
  }

  function okState(characterId: string) {
    const ch = get().characters[characterId];
    return ch?.status === "ok" ? ch : null;
  }

  function setPages(characterId: string, sectionId: string, pages: LoadedPage[]) {
    const ch = okState(characterId);
    if (!ch) return;
    setCharacter(characterId, { ...ch, sectionPages: { ...ch.sectionPages, [sectionId]: pages } });
  }

  /** Remembers the open spread; the config file is written at most twice a second. */
  function rememberLast(characterId: string, sectionId: string, spreadIndex: number) {
    lastViewOf.set(characterId, { sectionId, spreadIndex });
    const cur = get().config.lastOpened;
    if (
      cur.characterId === characterId &&
      cur.sectionId === sectionId &&
      cur.spreadIndex === spreadIndex
    )
      return;
    const config = { ...get().config, lastOpened: { characterId, sectionId, spreadIndex } };
    set({ config });
    clearTimeout(configWrite);
    configWrite = setTimeout(() => void persistConfig(get().config), 500);
  }

  function setView(characterId: string, sectionId: string, spreadIndex: number) {
    set({ view: { characterId, sectionId, spreadIndex }, pageOffset: 0 });
    rememberLast(characterId, sectionId, spreadIndex);
  }

  async function writeCharacter(characterId: string, character: Character) {
    const ch = okState(characterId);
    if (!ch) return;
    setCharacter(characterId, { ...ch, character });
    try {
      await backend.writeTextAtomic(characterPath(ch.notebookPath), serialiseCharacter(character));
    } catch (e) {
      set({ notice: `Could not save the character's sections: ${String(e)}` });
    }
  }

  function withPageOrder(character: Character, sectionId: string, pages: LoadedPage[]): Character {
    return {
      ...character,
      updatedAt: new Date().toISOString(),
      sections: character.sections.map((s) =>
        s.id === sectionId ? { ...s, pageOrder: pages.map((p) => p.page.id) } : s,
      ),
    };
  }

  function savePageNow(characterId: string, sectionId: string, pageId: string): Promise<void> {
    const key = `${characterId}:${sectionId}:${pageId}`;
    const run = writePage(characterId, sectionId, pageId).finally(() => {
      if (inFlight.get(key) === run) inFlight.delete(key);
    });
    inFlight.set(key, run);
    return run;
  }

  /** Saves a page; when its title changed, its file is renamed to match (keeping its number). */
  async function writePage(characterId: string, sectionId: string, pageId: string) {
    const ch = okState(characterId);
    if (!ch) return;
    const pages = ch.sectionPages[sectionId] ?? [];
    const loaded = pages.find((p) => p.page.id === pageId);
    if (!loaded || loaded.readOnly) return;
    set({ save: { kind: "saving" } });
    try {
      let fileName = loaded.fileName;
      const number = fileNumber(fileName);
      const slug = slugify(loaded.page.title);
      const matches =
        number !== null &&
        new RegExp(`^\\d{4,}-${slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(-\\d+)?\\.page\\.json$`).test(
          fileName,
        );
      if (number !== null && !matches) {
        const taken = new Set(pages.filter((p) => p !== loaded).map((p) => p.fileName));
        const next = uniquePageFileName(number, loaded.page.title, taken);
        const from = pagePath(ch.notebookPath, sectionId, fileName);
        if (await backend.pathExists(from)) {
          await backend.renameFile(from, pagePath(ch.notebookPath, sectionId, next));
        }
        forgetDiskText(from);
        fileName = next;
      }
      await savePage(ch.notebookPath, sectionId, fileName, loaded.page);
      const cur = okState(characterId);
      if (cur && fileName !== loaded.fileName) {
        setPages(
          characterId,
          sectionId,
          (cur.sectionPages[sectionId] ?? []).map((p) => (p.page.id === pageId ? { ...p, fileName } : p)),
        );
      }
      set({ save: pending.size === 0 ? { kind: "saved", at: new Date() } : { kind: "unsaved" } });
    } catch (e) {
      set({ save: { kind: "error", message: String(e) } });
    }
  }

  function dropPage(characterId: string, sectionId: string, pageId: string) {
    histories.delete(pageId);
    const ch = okState(characterId);
    if (!ch) return;
    const pages = ch.sectionPages[sectionId] ?? [];
    const index = pages.findIndex((p) => p.page.id === pageId);
    if (index < 0) return;
    const updated = pages.filter((p) => p.page.id !== pageId);
    forgetBlanks(characterId, sectionId);
    setPages(characterId, sectionId, updated);
    const view = get().view;
    if ("characterId" in view && view.characterId === characterId && view.sectionId === sectionId) {
      const max = spreadCount(updated.length) - 1;
      if (view.spreadIndex > max) setView(characterId, sectionId, max);
    }
  }

  function syncCharacterMeta(characterId: string) {
    const cfg = get().config.characters.find((c) => c.id === characterId);
    const ch = okState(characterId);
    if (!cfg || !ch) return;
    if (ch.character.name === cfg.name && ch.character.cover === cfg.cover) return;
    void writeCharacter(characterId, { ...ch.character, name: cfg.name, cover: cfg.cover });
  }

  function watchFolder(characterId: string, notebookPath: string | null) {
    const old = watched.get(characterId);
    if (old === notebookPath) return;
    if (old) {
      watched.delete(characterId);
      void backend.unwatchNotebookFolder(old).catch(() => undefined);
    }
    if (notebookPath) {
      watched.set(characterId, notebookPath);
      void backend.watchNotebookFolder(notebookPath).catch(() => watched.delete(characterId));
    }
  }

  /**
   * Turns blank pages into files: every blank page up to and including `index`, so writing on
   * the right page of an empty spread never makes it slide to the left.
   */
  async function materialise(
    characterId: string,
    sectionId: string,
    index: number,
    overrides?: (page: Page, at: number) => Page,
  ): Promise<LoadedPage | null> {
    const ch = okState(characterId);
    if (!ch) return null;
    const section = ch.character.sections.find((s) => s.id === sectionId);
    let pages = [...(ch.sectionPages[sectionId] ?? [])];
    if (index < pages.length) return pages[index];
    const created: LoadedPage[] = [];
    const taken = new Set(pages.map((p) => p.fileName));
    for (let at = pages.length; at <= index; at++) {
      let page = blankPage(characterId, section, sectionId, at, pages);
      if (overrides) page = overrides(page, at);
      const number = nextFileNumber([...taken]);
      const fileName = uniquePageFileName(number, page.title, taken);
      taken.add(fileName);
      const entry: LoadedPage = { fileName, page, readOnly: false };
      pages = [...pages, entry];
      created.push(entry);
    }
    forgetBlanks(characterId, sectionId);
    setPages(characterId, sectionId, pages);
    const cur = okState(characterId);
    if (cur) void writeCharacter(characterId, withPageOrder(cur.character, sectionId, pages));
    try {
      await backend.ensureNotebookDir(ch.notebookPath, `pages/${sectionId}`).catch(() => undefined);
      for (const p of created) await savePage(ch.notebookPath, sectionId, p.fileName, p.page);
      set({ save: { kind: "saved", at: new Date() } });
    } catch (e) {
      set({ save: { kind: "error", message: String(e) } });
    }
    return pages[index];
  }

  /** Appends pages so the next page lands on a left page, then returns that index. */
  function nextLeftIndex(count: number) {
    return count % 2 === 0 ? count : count + 1;
  }

  function changePage(
    characterId: string,
    sectionId: string,
    pageId: string,
    mutate: (p: Page) => Page,
  ) {
    const ch = okState(characterId);
    if (!ch) return;
    const pages = ch.sectionPages[sectionId] ?? [];
    const loaded = pages.find((p) => p.page.id === pageId);
    if (!loaded) {
      // A blank page being written on for the first time.
      const blank = [...blanks.entries()].find(
        ([k, p]) => k.startsWith(`${characterId}:${sectionId}:`) && p.id === pageId,
      );
      if (!blank) return;
      const index = Number(blank[0].split(":").pop());
      const page = mutate(blank[1]);
      if (page === blank[1]) return;
      blanks.set(blank[0], page);
      void materialise(characterId, sectionId, index);
      return;
    }
    if (loaded.readOnly) return;
    const page = mutate(loaded.page);
    if (page === loaded.page) return;
    const stamped = { ...page, updatedAt: new Date().toISOString() };
    setPages(
      characterId,
      sectionId,
      pages.map((p) => (p.page.id === pageId ? { ...p, page: stamped } : p)),
    );
    set({ save: { kind: "unsaved" } });
    const key = `${characterId}:${sectionId}:${pageId}`;
    scheduleSave(key, () => savePageNow(characterId, sectionId, pageId));
  }

  async function readOptional(path: string): Promise<string | null> {
    try {
      return (await backend.pathExists(path)) ? await backend.readTextFile(path) : null;
    } catch {
      return null;
    }
  }

  return {
    ready: false,
    config: defaultConfig(),
    characters: {},
    view: { kind: "empty" },
    save: { kind: "saved" },
    settingsOpen: false,
    pageListOpen: false,
    handwritingOpen: false,
    notice: null,
    flash: null,
    historyTick: 0,
    pageOffset: 0,

    async init() {
      const config = parseConfig(await backend.readAppConfig());
      const visible = visibleCharacters(config);
      const last = config.lastOpened;
      const startChar = visible.find((c) => c.id === last.characterId) ?? visible[0];
      if (startChar && startChar.id === last.characterId && last.sectionId) {
        lastViewOf.set(startChar.id, {
          sectionId: last.sectionId,
          spreadIndex: last.spreadIndex ?? 0,
        });
      }
      const start = startChar ? lastViewOf.get(startChar.id) : undefined;
      set({
        config,
        characters: Object.fromEntries(visible.map((c) => [c.id, { status: "loading" } as CharacterState])),
        view: startChar
          ? {
              characterId: startChar.id,
              sectionId: start?.sectionId ?? "sessions",
              spreadIndex: start?.spreadIndex ?? 0,
            }
          : { kind: "empty" },
        ready: true,
      });
      await Promise.all(visible.map((c) => get().reloadCharacter(c.id)));
    },

    async updateConfig(mutate) {
      const config = mutate(get().config);
      set({ config });
      await persistConfig(config);
    },

    async addCharacter({ name, cover, folder }) {
      const id = newId();
      const order = Math.max(-1, ...get().config.characters.map((c) => c.order)) + 1;
      const cfg: CharacterConfig = { id, name, cover, folder, order, archived: false, excludeFromAi: false };
      await get().updateConfig((c) => ({ ...c, characters: [...c.characters, cfg] }));
      setCharacter(id, { status: "loading" });
      await get().reloadCharacter(id);
      get().openCharacter(id);
    },

    async renameCharacter(characterId, name) {
      if (!name.trim()) return;
      await get().updateConfig((c) => ({
        ...c,
        characters: c.characters.map((ch) => (ch.id === characterId ? { ...ch, name: name.trim() } : ch)),
      }));
      syncCharacterMeta(characterId);
    },

    async setCharacterCover(characterId, cover) {
      await get().updateConfig((c) => ({
        ...c,
        characters: c.characters.map((ch) => (ch.id === characterId ? { ...ch, cover } : ch)),
      }));
      syncCharacterMeta(characterId);
    },

    async archiveCharacter(characterId) {
      await get().updateConfig((c) => ({
        ...c,
        characters: c.characters.map((ch) => (ch.id === characterId ? { ...ch, archived: true } : ch)),
      }));
      watchFolder(characterId, null);
      const view = get().view;
      if ("characterId" in view && view.characterId === characterId) {
        const next = visibleCharacters(get().config).find((c) => c.id !== characterId);
        if (next) get().openCharacter(next.id);
        else set({ view: { kind: "empty" } });
      }
    },

    async restoreCharacter(characterId) {
      await get().updateConfig((c) => ({
        ...c,
        characters: c.characters.map((ch) => (ch.id === characterId ? { ...ch, archived: false } : ch)),
      }));
      setCharacter(characterId, { status: "loading" });
      await get().reloadCharacter(characterId);
      get().openCharacter(characterId);
    },

    async moveCharacter(characterId, slot) {
      const visible = visibleCharacters(get().config);
      const idx = visible.findIndex((c) => c.id === characterId);
      if (idx < 0) return;
      const reordered = [...visible];
      const [moved] = reordered.splice(idx, 1);
      reordered.splice(Math.min(slot > idx ? slot - 1 : slot, reordered.length), 0, moved);
      await get().updateConfig((c) => ({
        ...c,
        characters: c.characters.map((ch) => {
          const pos = reordered.findIndex((r) => r.id === ch.id);
          return pos >= 0 ? { ...ch, order: pos } : ch;
        }),
      }));
    },

    async setCharacterFolder(characterId, folder) {
      await get().flushSaves();
      watchFolder(characterId, null);
      await get().updateConfig((c) => ({
        ...c,
        characters: c.characters.map((ch) => (ch.id === characterId ? { ...ch, folder } : ch)),
      }));
      setCharacter(characterId, { status: "loading" });
      await get().reloadCharacter(characterId);
    },

    async reloadCharacter(characterId) {
      const cfg = get().config.characters.find((c) => c.id === characterId);
      if (!cfg) return;
      const notebookPath = notebookPathFor(cfg.folder);
      if (!(await backend.pathExists(notebookPath))) {
        setCharacter(characterId, { status: "missing", notebookPath });
        watchFolder(characterId, null);
        return;
      }

      const charText = await readOptional(characterPath(notebookPath));
      const read = readCharacter(charText, { id: cfg.id, name: cfg.name, cover: cfg.cover });
      let character = read.character;
      let changed = read.changed;
      if (character.name !== cfg.name || character.cover !== cfg.cover) {
        character = { ...character, name: cfg.name, cover: cfg.cover };
        changed = true;
      }
      if (changed) {
        try {
          await backend.writeTextAtomic(characterPath(notebookPath), serialiseCharacter(character));
        } catch (e) {
          set({ notice: `Could not update ${cfg.name}'s character.json: ${String(e)}` });
        }
      }

      for (const s of character.sections) {
        if (!(await backend.pathExists(sectionPagesDir(notebookPath, s.id)))) {
          await backend.ensureNotebookDir(notebookPath, `pages/${s.id}`).catch(() => undefined);
        }
      }

      const result = await loadCharacterFromDisk(
        cfg.folder,
        character.sections.map((s) => s.id),
      );
      if (result.status === "missing") {
        setCharacter(characterId, { status: "missing", notebookPath: result.notebookPath });
        watchFolder(characterId, null);
        return;
      }

      let glyphs: GlyphsData = emptyGlyphs();
      const glyphText =
        (await readOptional(glyphsPath(notebookPath))) ??
        (await readOptional(legacyGlyphsPath(notebookPath)));
      if (glyphText) glyphs = parseGlyphs(glyphText);

      const sheetText = await readOptional(sheetPath(notebookPath));
      const sheet: SheetData = sheetText ? parseSheetData(sheetText) : emptySheetData();
      const trackersText = await readOptional(trackersPath(notebookPath));
      const trackers: TrackerState = trackersText
        ? parseTrackers(trackersText)
        : emptyTrackers();

      // The sheet section always holds its template pages (and enough spell-list pages).
      const sectionPages = { ...result.sectionPages };
      const sheetSection = character.sections.find((s) => s.kind === "sheet");
      if (sheetSection) {
        const added = sheetPagesToAdd(sectionPages[sheetSection.id] ?? [], sheet, sheetSection.id);
        sectionPages[sheetSection.id] = [...(sectionPages[sheetSection.id] ?? []), ...added];
        for (const lp of added) {
          try {
            await savePage(notebookPath, sheetSection.id, lp.fileName, lp.page);
          } catch {
            // shown as unsaved on first edit
          }
        }
      }
      for (const id of Object.keys(sectionPages)) sectionPages[id] = [...sectionPages[id]].sort(comparePageFiles);

      setCharacter(characterId, {
        status: "ok",
        notebookPath,
        character,
        sectionPages,
        errors: result.errors,
        glyphs,
        sheet,
        trackers,
      });
      watchFolder(characterId, notebookPath);
      if (result.errors.length) {
        set({ notice: `Some pages could not be opened: ${result.errors.join("; ")}` });
      }

      const view = get().view;
      if ("characterId" in view && view.characterId === characterId) {
        const sectionId = character.sections.some((s) => s.id === view.sectionId)
          ? view.sectionId
          : (character.sections[0]?.id ?? "sessions");
        const pages = sectionPages[sectionId] ?? [];
        const spreadIndex = Math.min(view.spreadIndex, spreadCount(pages.length) - 1);
        setView(characterId, sectionId, spreadIndex);
        const left = pages[spreadIndex * 2];
        set({
          save: left?.readOnly ? { kind: "read-only", reason: left.warning ?? "" } : { kind: "saved" },
        });
      }
    },

    openCharacter(characterId) {
      const cfg = get().config.characters.find((c) => c.id === characterId);
      if (!cfg) return;
      const ch = get().characters[characterId];
      const last = lastViewOf.get(characterId);
      setView(characterId, last?.sectionId ?? "sessions", last?.spreadIndex ?? 0);
      if (!ch || ch.status === "missing") {
        setCharacter(characterId, { status: "loading" });
        void get().reloadCharacter(characterId);
      }
    },

    openSection(characterId, sectionId) {
      setView(characterId, sectionId, 0);
    },

    async addSection(characterId, name, colour) {
      const ch = okState(characterId);
      if (!ch || !name.trim()) return null;
      const id = newSectionId(name, ch.character.sections.map((s) => s.id));
      try {
        await backend.ensureNotebookDir(ch.notebookPath, `pages/${id}`);
      } catch (e) {
        set({ notice: `Could not add the section: ${String(e)}` });
        return null;
      }
      const section: Section = { id, name: name.trim(), colour, kind: "free", pageOrder: [] };
      const cur = okState(characterId);
      if (!cur) return null;
      setCharacter(characterId, { ...cur, sectionPages: { ...cur.sectionPages, [id]: [] } });
      await writeCharacter(characterId, {
        ...cur.character,
        updatedAt: new Date().toISOString(),
        sections: [...cur.character.sections, section],
      });
      setView(characterId, id, 0);
      return id;
    },

    async updateSection(characterId, sectionId, patch) {
      const ch = okState(characterId);
      if (!ch) return;
      const name = patch.name?.trim();
      await writeCharacter(characterId, {
        ...ch.character,
        updatedAt: new Date().toISOString(),
        sections: ch.character.sections.map((s) =>
          s.id === sectionId
            ? { ...s, ...(name ? { name } : {}), ...(patch.colour ? { colour: patch.colour } : {}) }
            : s,
        ),
      });
    },

    async moveSection(characterId, sectionId, slot) {
      const ch = okState(characterId);
      if (!ch) return;
      const list = [...ch.character.sections];
      const from = list.findIndex((s) => s.id === sectionId);
      if (from < 0) return;
      const [moved] = list.splice(from, 1);
      const to = Math.max(0, Math.min(slot > from ? slot - 1 : slot, list.length));
      list.splice(to, 0, moved);
      if (list.every((s, i) => s === ch.character.sections[i])) return;
      await writeCharacter(characterId, {
        ...ch.character,
        updatedAt: new Date().toISOString(),
        sections: list,
      });
    },

    async removeSection(characterId, sectionId) {
      const ch = okState(characterId);
      if (!ch) return false;
      const section = ch.character.sections.find((s) => s.id === sectionId);
      if (!section || section.kind === "sheet" || ch.character.sections.length <= 1) return false;
      await get().flushSaves();
      try {
        await backend.trashSectionFolder(ch.notebookPath, sectionId);
      } catch (e) {
        set({ notice: String(e) });
        return false;
      }
      for (const p of ch.sectionPages[sectionId] ?? []) {
        histories.delete(p.page.id);
        forgetDiskText(pagePath(ch.notebookPath, sectionId, p.fileName));
      }
      forgetBlanks(characterId, sectionId);
      const cur = okState(characterId);
      if (!cur) return false;
      const sectionPages = { ...cur.sectionPages };
      delete sectionPages[sectionId];
      const sections = cur.character.sections.filter((s) => s.id !== sectionId);
      setCharacter(characterId, { ...cur, sectionPages });
      await writeCharacter(characterId, {
        ...cur.character,
        updatedAt: new Date().toISOString(),
        sections,
      });
      const view = get().view;
      if ("characterId" in view && view.characterId === characterId && view.sectionId === sectionId) {
        setView(characterId, sections[0].id, 0);
      }
      return true;
    },

    setSettingsOpen(open) {
      set({ settingsOpen: open });
    },

    setPageListOpen(open) {
      set({ pageListOpen: open });
    },

    setHandwritingOpen(open) {
      set({ handwritingOpen: open });
    },

    async saveGlyphs(characterId, glyphs) {
      const ch = okState(characterId);
      if (!ch) return;
      setCharacter(characterId, { ...ch, glyphs });
      try {
        await backend.ensureNotebookDir(ch.notebookPath, "hand").catch(() => undefined);
        await backend.writeTextAtomic(glyphsPath(ch.notebookPath), serialiseGlyphs(glyphs));
      } catch (e) {
        set({ notice: `Could not save the handwriting: ${String(e)}` });
      }
    },

    async updateHandSettings(characterId, hand) {
      const ch = okState(characterId);
      if (!ch) return;
      await writeCharacter(characterId, { ...ch.character, hand, updatedAt: new Date().toISOString() });
    },

    async setSheetData(characterId, sheet) {
      const ch = okState(characterId);
      if (!ch) return;
      setCharacter(characterId, { ...ch, sheet });
      try {
        await backend.writeTextAtomic(sheetPath(ch.notebookPath), serialiseSheet(sheet));
      } catch (e) {
        set({ notice: `Could not save the character sheet: ${String(e)}` });
      }
    },

    async updateTrackers(characterId, mutate) {
      const ch = okState(characterId);
      if (!ch) return;
      const trackers = mutate(ch.trackers);
      if (trackers === ch.trackers) return;
      setCharacter(characterId, { ...ch, trackers });
      try {
        await backend.writeTextAtomic(trackersPath(ch.notebookPath), serialiseTrackers(trackers));
      } catch (e) {
        set({ notice: `Could not save trackers: ${String(e)}` });
      }
    },

    async longRest(characterId) {
      const ch = okState(characterId);
      if (!ch) return;
      restUndo.set(characterId, [...(restUndo.get(characterId) ?? []), ch.trackers]);
      await get().updateTrackers(characterId, (tr) => longRestRule(tr, ch.sheet));
    },

    async shortRest(characterId) {
      const ch = okState(characterId);
      if (!ch) return;
      restUndo.set(characterId, [...(restUndo.get(characterId) ?? []), ch.trackers]);
      await get().updateTrackers(characterId, (tr) => shortRestRule(tr, ch.sheet));
    },

    async undoRest(characterId) {
      const stack = restUndo.get(characterId);
      const prev = stack?.pop();
      if (!prev) return;
      await get().updateTrackers(characterId, () => prev);
    },

    async editSheetValue(characterId, path, text) {
      const ch = okState(characterId);
      if (!ch) return;
      if (path.startsWith("trackers.")) {
        const sub = path.slice("trackers.".length);
        const t2 = text.trim().replace(/[−–]/g, "-");
        const n = t2 === "" || t2 === "—" ? null : Number(t2);
        if (n !== null && !Number.isFinite(n)) return;
        await get().updateTrackers(characterId, (tr) => setPath(tr, sub, n));
        return;
      }
      await get().setSheetData(characterId, overrideValue(ch.sheet, path, text));
    },

    async toggleSheetBubble(characterId, act) {
      const ch = okState(characterId);
      if (!ch) return;
      const step = (spent: number, i: number) => (i < spent ? i : i + 1);
      if (act.kind === "prepared") {
        const spell = ch.sheet.spellcasting?.spells[act.spell];
        if (!spell || spell.prepared === "always") return;
        const path = `spellcasting.spells.${act.spell}.prepared`;
        const next = setPath(ch.sheet, path, spell.prepared === "yes" ? "no" : "yes");
        await get().setSheetData(characterId, {
          ...next,
          overrides: next.overrides.includes(path) ? next.overrides : [...next.overrides, path],
        });
        return;
      }
      await get().updateTrackers(characterId, (tr) => {
        switch (act.kind) {
          case "slot":
            return { ...tr, slotsSpent: { ...tr.slotsSpent, [act.level]: step(tr.slotsSpent[act.level] ?? 0, act.i) } };
          case "feature":
            return { ...tr, featureUses: { ...tr.featureUses, [act.key]: step(tr.featureUses[act.key] ?? 0, act.i) } };
          case "hitdie":
            return { ...tr, hitDiceSpent: step(tr.hitDiceSpent, act.i) };
          case "death":
            return { ...tr, deathSaves: { ...tr.deathSaves, [act.which]: step(tr.deathSaves[act.which], act.i) } };
        }
      });
    },

    async ensurePage(characterId, sectionId, index) {
      await backend.ensureNotebookDir(okState(characterId)?.notebookPath ?? "", `pages/${sectionId}`).catch(() => undefined);
      return materialise(characterId, sectionId, index);
    },

    async syncSheetPages(characterId) {
      const ch = okState(characterId);
      const section = ch?.character.sections.find((s) => s.kind === "sheet");
      if (!ch || !section) return;
      const added = sheetPagesToAdd(ch.sectionPages[section.id] ?? [], ch.sheet, section.id);
      if (!added.length) return;
      const pages = [...(ch.sectionPages[section.id] ?? []), ...added].sort(comparePageFiles);
      setPages(characterId, section.id, pages);
      for (const lp of added) await savePage(ch.notebookPath, section.id, lp.fileName, lp.page).catch(() => undefined);
    },

    canUndoRest(characterId) {
      return (restUndo.get(characterId)?.length ?? 0) > 0;
    },

    dismissNotice() {
      set({ notice: null });
    },

    setPageOffset(offset) {
      set({ pageOffset: offset });
    },

    goToSpread(index) {
      const view = get().view;
      if (!("characterId" in view)) return;
      const ch = okState(view.characterId);
      if (!ch) return;
      const pages = ch.sectionPages[view.sectionId] ?? [];
      const max = spreadCount(pages.length) - 1;
      setView(view.characterId, view.sectionId, Math.max(0, Math.min(index, max)));
    },

    goToSpreadDelta(delta) {
      const view = get().view;
      if (!("characterId" in view)) return;
      get().goToSpread(view.spreadIndex + delta);
    },

    goToPage(pageId) {
      const view = get().view;
      if (!("characterId" in view)) return;
      const ch = okState(view.characterId);
      const index = (ch?.sectionPages[view.sectionId] ?? []).findIndex((p) => p.page.id === pageId);
      if (index >= 0) setView(view.characterId, view.sectionId, Math.floor(index / 2));
    },

    async newSpread() {
      const view = get().view;
      if (!("characterId" in view)) return;
      const { characterId, sectionId } = view;
      const ch = okState(characterId);
      if (!ch) return;
      const count = (ch.sectionPages[sectionId] ?? []).length;
      const at = nextLeftIndex(count);
      await materialise(characterId, sectionId, at, (page, i) =>
        i === at ? { ...page, title: "Untitled page" } : page,
      );
      setView(characterId, sectionId, at / 2);
    },

    async newPage() {
      await get().newSpread();
    },

    async newSession() {
      const view = get().view;
      if (!("characterId" in view)) return;
      const { characterId, sectionId } = view;
      const ch = okState(characterId);
      if (!ch) return;
      const pages = ch.sectionPages[sectionId] ?? [];
      const number = Math.max(0, ...pages.map((p) => p.page.session?.number ?? 0)) + 1;
      const at = nextLeftIndex(pages.length);
      const date = todayIso();
      await materialise(characterId, sectionId, at, (page, i) =>
        i === at ? { ...page, title: `Session ${number}`, session: { number, date, place: "" } } : page,
      );
      setView(characterId, sectionId, at / 2);
    },

    async duplicatePage(characterId, sectionId, pageId) {
      const ch = okState(characterId);
      if (!ch) return;
      const pages = ch.sectionPages[sectionId] ?? [];
      const loaded = pages.find((p) => p.page.id === pageId);
      if (!loaded) return;
      const now = new Date().toISOString();
      const copy: Page = {
        ...loaded.page,
        id: newId(),
        title: `${loaded.page.title} (copy)`,
        createdAt: now,
        updatedAt: now,
        elements: loaded.page.elements.map((el) => ({ ...el, id: newId() })),
      };
      const at = pages.length;
      await materialise(characterId, sectionId, at, (page, i) => (i === at ? copy : page));
      setView(characterId, sectionId, Math.floor(at / 2));
    },

    async deletePage(characterId, sectionId, pageId) {
      const ch = okState(characterId);
      if (!ch) return false;
      const pages = ch.sectionPages[sectionId] ?? [];
      const loaded = pages.find((p) => p.page.id === pageId);
      if (!loaded) return false;
      const key = `${characterId}:${sectionId}:${pageId}`;
      const t = timers.get(key);
      if (t) clearTimeout(t);
      timers.delete(key);
      pending.delete(key);
      const inflight = inFlight.get(key);
      if (inflight) await inflight.catch(() => undefined);
      const path = pagePath(ch.notebookPath, sectionId, loaded.fileName);
      try {
        await backend.trashPageFile(path);
        forgetDiskText(path);
        dropPage(characterId, sectionId, pageId);
        const cur = okState(characterId);
        if (cur) {
          void writeCharacter(
            characterId,
            withPageOrder(cur.character, sectionId, cur.sectionPages[sectionId] ?? []),
          );
        }
        return true;
      } catch (e) {
        set({ save: { kind: "error", message: String(e) } });
        return false;
      }
    },

    renamePage(characterId, sectionId, pageId, title) {
      const t = title.trim();
      if (!t) return;
      changePage(characterId, sectionId, pageId, (p) => (p.title === t ? p : { ...p, title: t }));
    },

    updatePage(mutate) {
      const cur = currentPageOf(get());
      if (!cur) return;
      changePage(cur.characterId, cur.sectionId, cur.loaded.page.id, mutate);
    },

    updatePageIn(characterId, sectionId, pageId, mutate) {
      changePage(characterId, sectionId, pageId, mutate);
    },

    editElements(mutate) {
      const cur = currentPageOf(get());
      if (!cur || cur.loaded.readOnly) return;
      const page = cur.loaded.page;
      const next = mutate(page.elements);
      if (sameElements(next, page.elements)) return;
      const h = histories.get(page.id) ?? emptyHistory<Element[]>();
      histories.set(page.id, record(h, next));
      set((s) => ({ historyTick: s.historyTick + 1 }));
      changePage(cur.characterId, cur.sectionId, page.id, (p) => ({ ...p, elements: next }));
    },

    undo() {
      const cur = currentPageOf(get());
      if (!cur) return;
      const page = cur.loaded.page;
      const h = histories.get(page.id);
      if (!h || h.past.length === 0) return;
      const r = undoStep(h, page.elements);
      if (!r) return;
      histories.set(page.id, r.history);
      set((s) => ({ historyTick: s.historyTick + 1 }));
      changePage(cur.characterId, cur.sectionId, page.id, (p) => ({ ...p, elements: r.value }));
    },

    redo() {
      const cur = currentPageOf(get());
      if (!cur) return;
      const page = cur.loaded.page;
      const h = histories.get(page.id);
      if (!h || h.future.length === 0) return;
      const r = redoStep(h, page.elements);
      if (!r) return;
      histories.set(page.id, r.history);
      set((s) => ({ historyTick: s.historyTick + 1 }));
      changePage(cur.characterId, cur.sectionId, page.id, (p) => ({ ...p, elements: r.value }));
    },

    async flushSaves() {
      const jobs = [...pending.values()].map((job) => job());
      pending.clear();
      timers.forEach(clearTimeout);
      timers.clear();
      await Promise.all([...jobs, ...inFlight.values()].map((p) => p.catch(() => undefined)));
      if (configWrite) {
        clearTimeout(configWrite);
        configWrite = undefined;
        await persistConfig(get().config).catch(() => undefined);
      }
    },

    async applyOutsideChanges(notebookPath, files, rescan) {
      const characterId = Object.entries(get().characters).find(
        ([, state]) => state.status === "ok" && state.notebookPath === notebookPath,
      )?.[0];
      if (!characterId) return;
      const prev = outsideQueue.get(notebookPath) ?? Promise.resolve();
      const next = prev.then(async () => {
        if (rescan) {
          await get().reloadCharacter(characterId);
          return;
        }
        for (const rel of files) {
          const slash = rel.indexOf("/");
          if (slash < 0) continue;
          await applyOutsideFile(characterId, rel.slice(0, slash), rel.slice(slash + 1));
        }
      });
      outsideQueue.set(notebookPath, next.catch(() => undefined));
      await next;
    },

    clearFlash() {
      set({ flash: null });
    },
  };

  async function applyOutsideFile(characterId: string, sectionId: string, fileName: string) {
    const ch = okState(characterId);
    if (!ch || !ch.character.sections.some((s) => s.id === sectionId)) return;
    const path = pagePath(ch.notebookPath, sectionId, fileName);
    const pages = ch.sectionPages[sectionId] ?? [];
    const existing = pages.find((p) => p.fileName === fileName);
    if (existing) {
      const writing = inFlight.get(`${characterId}:${sectionId}:${existing.page.id}`);
      if (writing) await writing.catch(() => undefined);
    }
    const exists = await backend.pathExists(path);
    const text = exists ? await backend.readTextFile(path).catch(() => null) : null;
    if (exists && text === null) return;
    if (text !== null && text === knownDiskText(path)) return;

    const unsaved = (pageId: string) =>
      pending.has(`${characterId}:${sectionId}:${pageId}`) ||
      inFlight.has(`${characterId}:${sectionId}:${pageId}`);

    if (text === null) {
      if (!existing) return;
      if (unsaved(existing.page.id)) {
        set({
          notice: `"${existing.page.title}" was deleted outside the app while you had unsaved changes. Your version was kept.`,
        });
        return;
      }
      forgetDiskText(path);
      dropPage(characterId, sectionId, existing.page.id);
      return;
    }

    const parsed = parsePage(text);
    if (!parsed.ok) return;
    const page = parsed.page;
    const cur = okState(characterId);
    if (!cur) return;
    const curPages = cur.sectionPages[sectionId] ?? [];
    const target = existing ?? curPages.find((p) => p.page.id === page.id);
    if (target && unsaved(target.page.id)) {
      set({
        notice: `"${target.page.title}" was changed outside the app while you had unsaved changes. Your version was kept.`,
      });
      return;
    }
    rememberDiskText(path, text);
    const entry: LoadedPage = { fileName, page, readOnly: parsed.readOnly, warning: parsed.warning };
    const others = curPages.filter((p) => p.page.id !== page.id && p.fileName !== fileName);
    histories.delete(page.id);
    forgetBlanks(characterId, sectionId);
    setPages(characterId, sectionId, [...others, entry].sort(comparePageFiles));
    set((s) => ({ historyTick: s.historyTick + 1 }));
  }
});

/** Sheet pages the section is missing: the four core templates and enough spell-list pages. */
function sheetPagesToAdd(existing: LoadedPage[], sheet: SheetData, sectionId: string): LoadedPage[] {
  const have = new Set(existing.map((p) => `${p.page.sheetPageType}:${p.page.sheetIndex ?? 0}`));
  const want: { type: (typeof SHEET_PAGE_TYPES)[number]; index: number }[] = [
    ...SHEET_PAGE_TYPES.filter((x) => x !== "spell-list").map((type) => ({ type, index: 0 })),
    ...Array.from({ length: spellListPageCount(sheet) }, (_, index) => ({ type: "spell-list" as const, index })),
  ];
  const taken = new Set(existing.map((p) => p.fileName));
  let number = nextFileNumber(taken);
  const now = new Date().toISOString();
  const out: LoadedPage[] = [];
  for (const w of want) {
    if (have.has(`${w.type}:${w.index}`)) continue;
    const page: Page = {
      schemaVersion: 1,
      id: newId(),
      title: w.index ? `${SHEET_TITLES[w.type]}, cont.` : SHEET_TITLES[w.type],
      section: sectionId,
      sheetPageType: w.type,
      ...(w.type === "spell-list" ? { sheetIndex: w.index } : {}),
      createdAt: now,
      updatedAt: now,
      elements: [],
    };
    const fileName = uniquePageFileName(number++, page.title, taken);
    taken.add(fileName);
    out.push({ fileName, page, readOnly: false });
  }
  return out;
}

const SHEET_TITLES: Record<(typeof SHEET_PAGE_TYPES)[number], string> = {
  "core-left": "Character",
  "core-right": "Skills and attacks",
  features: "Features and traits",
  "spells-kit": "Spells and kit",
  "spell-list": "Spell list",
};

/** Serialises a page exactly as saved; exported for tests. */
export const pageText = serialisePage;
