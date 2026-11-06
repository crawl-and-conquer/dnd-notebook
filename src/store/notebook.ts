import { create } from "zustand";
import {
  defaultConfig,
  parseConfig,
  type AppConfig,
  type CharacterConfig,
} from "../model/config";
import {
  createPage,
  newId,
  pageFileName,
  parsePage,
  uniquePageFileName,
  type Element,
  type Page,
} from "../model/page";
import {
  createCharacter,
  parseCharacter,
  type Character,
} from "../model/character";
import {
  emptyHistory,
  record,
  redo as redoStep,
  undo as undoStep,
  type History,
} from "../canvas/history";
import { backend } from "../storage/backend";
import { pagePath } from "../storage/paths";
import {
  forgetDiskText,
  knownDiskText,
  loadCharacter as loadCharacterFromDisk,
  rememberDiskText,
  savePage,
  type LoadedPage,
} from "../storage/notebook";

export const AUTOSAVE_DELAY_MS = 800;

/** State of one loaded character. */
export type CharacterState =
  | { status: "loading" }
  | { status: "missing"; notebookPath: string }
  | {
      status: "ok";
      notebookPath: string;
      character: Character;
      /** Pages per section id, in file/created order. */
      sectionPages: Record<string, LoadedPage[]>;
      errors: string[];
    };

export type SpreadPos = { characterId: string; sectionId: string; spreadIndex: number };
export type View = SpreadPos | { kind: "empty" };

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
  notice: string | null;
  flash: { elementId: string; nonce: number } | null;
  historyTick: number;

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
  reloadCharacter(characterId: string): Promise<void>;
  openCharacter(characterId: string): void;
  openSection(characterId: string, sectionId: string): void;
  setSettingsOpen(open: boolean): void;
  setPageListOpen(open: boolean): void;
  dismissNotice(): void;

  /** Navigate to a spread by absolute index in the current section. */
  goToSpread(index: number): void;
  /** Move by delta spreads (+1 next, -1 prev). */
  goToSpreadDelta(delta: number): void;

  newPage(): Promise<void>;
  duplicatePage(characterId: string, sectionId: string, pageId: string): Promise<void>;
  deletePage(characterId: string, sectionId: string, pageId: string): Promise<boolean>;
  renamePage(characterId: string, sectionId: string, pageId: string, title: string): void;

  updatePage(mutate: (p: Page) => Page): void;
  updatePageIn(characterId: string, sectionId: string, pageId: string, mutate: (p: Page) => Page): void;
  editElements(mutate: (els: Element[]) => Element[]): void;
  undo(): void;
  redo(): void;
  flushSaves(): Promise<void>;
  applyOutsideChanges(notebookPath: string, fileNames: string[], rescan?: boolean): Promise<void>;
  clearFlash(): void;
};

const histories = new Map<string, History<Element[]>>();

export function historyFor(pageId: string | undefined): { canUndo: boolean; canRedo: boolean } {
  const h = pageId ? histories.get(pageId) : undefined;
  return { canUndo: !!h && h.past.length > 0, canRedo: !!h && h.future.length > 0 };
}

const sameElements = (a: Element[], b: Element[]) =>
  a.length === b.length && a.every((el, i) => el === b[i]);

export const visibleCharacters = (c: AppConfig): CharacterConfig[] =>
  c.characters.filter((ch) => !ch.archived).sort((a, b) => a.order - b.order);

/** Returns the two pages for the current spread, or just the left page if at the last odd page. */
export function currentSpreadPages(
  s: Pick<NotebookStore, "view" | "characters">,
): { left: LoadedPage | null; right: LoadedPage | null; spreadIndex: number; spreadCount: number } | null {
  if (!("characterId" in s.view)) return null;
  const { characterId, sectionId, spreadIndex } = s.view;
  const ch = s.characters[characterId];
  if (!ch || ch.status !== "ok") return null;
  const pages = ch.sectionPages[sectionId] ?? [];
  const spreadCount = Math.ceil(pages.length / 2);
  const leftIdx = spreadIndex * 2;
  const left = pages[leftIdx] ?? null;
  const right = pages[leftIdx + 1] ?? null;
  return { left, right, spreadIndex, spreadCount };
}

/** The left page (or right if no left), for tools and element edits. */
export function currentPageOf(
  s: Pick<NotebookStore, "view" | "characters">,
): { characterId: string; sectionId: string; loaded: LoadedPage; index: number; count: number } | null {
  if (!("characterId" in s.view)) return null;
  const { characterId, sectionId, spreadIndex } = s.view;
  const ch = s.characters[characterId];
  if (!ch || ch.status !== "ok") return null;
  const pages = ch.sectionPages[sectionId] ?? [];
  if (pages.length === 0) return null;
  const idx = Math.min(spreadIndex * 2, pages.length - 1);
  return { characterId, sectionId, loaded: pages[idx], index: idx, count: pages.length };
}

// ----- autosave plumbing -----

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const pending = new Map<string, () => Promise<void>>();
const inFlight = new Map<string, Promise<void>>();
const outsideQueue = new Map<string, Promise<void>>();
const watched = new Map<string, string>();

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

export const useNotebook = create<NotebookStore>((set, get) => {
  async function persistConfig(config: AppConfig) {
    await backend.writeAppConfig(JSON.stringify(config, null, 2) + "\n");
  }

  function setCharacter(characterId: string, state: CharacterState) {
    set((s) => ({ characters: { ...s.characters, [characterId]: state } }));
  }

  function rememberLast(characterId: string, sectionId?: string) {
    const c = get().config;
    if (c.lastOpened.characterId === characterId && c.lastOpened.sectionId === sectionId) return;
    void get().updateConfig((cfg) => ({
      ...cfg,
      lastOpened: { characterId, sectionId },
    }));
  }

  function savePageNow(characterId: string, sectionId: string, pageId: string): Promise<void> {
    const key = `${characterId}:${sectionId}:${pageId}`;
    const run = writePage(characterId, sectionId, pageId).finally(() => {
      if (inFlight.get(key) === run) inFlight.delete(key);
    });
    inFlight.set(key, run);
    return run;
  }

  async function writePage(characterId: string, sectionId: string, pageId: string) {
    const ch = get().characters[characterId];
    if (!ch || ch.status !== "ok") return;
    const pages = ch.sectionPages[sectionId] ?? [];
    const loaded = pages.find((p) => p.page.id === pageId);
    if (!loaded || loaded.readOnly) return;
    set({ save: { kind: "saving" } });
    try {
      let fileName = loaded.fileName;
      const stem = pageFileName(loaded.page).replace(/\.page\.json$/, "");
      const matches = new RegExp(
        `^${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(-\\d+)?\\.page\\.json$`,
      );
      if (!matches.test(fileName)) {
        const taken = new Set(pages.filter((p) => p !== loaded).map((p) => p.fileName));
        const next = uniquePageFileName(loaded.page, taken);
        const from = pagePath(ch.notebookPath, sectionId, fileName);
        if (await backend.pathExists(from)) {
          await backend.renameFile(from, pagePath(ch.notebookPath, sectionId, next));
        }
        forgetDiskText(from);
        fileName = next;
        await savePage(ch.notebookPath, sectionId, fileName, loaded.page);
      } else {
        await savePage(ch.notebookPath, sectionId, fileName, loaded.page);
      }
      const cur = get().characters[characterId];
      if (cur?.status === "ok") {
        const updatedPages = (cur.sectionPages[sectionId] ?? []).map((p) =>
          p.page.id === pageId ? { ...p, fileName } : p,
        );
        setCharacter(characterId, {
          ...cur,
          sectionPages: { ...cur.sectionPages, [sectionId]: updatedPages },
        });
      }
      set({ save: pending.size === 0 ? { kind: "saved", at: new Date() } : { kind: "unsaved" } });
    } catch (e) {
      set({ save: { kind: "error", message: String(e) } });
    }
  }

  function dropPage(characterId: string, sectionId: string, pageId: string) {
    histories.delete(pageId);
    const ch = get().characters[characterId];
    if (ch?.status !== "ok") return;
    const pages = ch.sectionPages[sectionId] ?? [];
    const index = pages.findIndex((p) => p.page.id === pageId);
    if (index < 0) return;
    const updated = pages.filter((p) => p.page.id !== pageId);
    setCharacter(characterId, { ...ch, sectionPages: { ...ch.sectionPages, [sectionId]: updated } });

    // If we dropped the current page, move to neighbour
    const view = get().view;
    if ("characterId" in view && view.characterId === characterId && view.sectionId === sectionId) {
      const spreadIndex = Math.floor(Math.min(index, Math.max(0, updated.length - 1)) / 2);
      set({ view: { ...view, spreadIndex: Math.max(0, spreadIndex) } });
    }
  }

  function syncCharacterJson(characterId: string) {
    const cfg = get().config.characters.find((c) => c.id === characterId);
    const state = get().characters[characterId];
    if (!cfg || state?.status !== "ok") return;
    void backend.updateCharacterMeta(state.notebookPath, cfg.name, cfg.cover).catch(() => undefined);
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

  async function addPage(characterId: string, sectionId: string, page: Page) {
    const ch = get().characters[characterId];
    if (!ch || ch.status !== "ok") return;
    const pages = ch.sectionPages[sectionId] ?? [];
    const taken = new Set(pages.map((p) => p.fileName));
    const fileName = uniquePageFileName(page, taken);
    const updated = [...pages, { fileName, page, readOnly: false }];
    setCharacter(characterId, { ...ch, sectionPages: { ...ch.sectionPages, [sectionId]: updated } });
    const spreadIndex = Math.floor((updated.length - 1) / 2);
    set({ view: { characterId, sectionId, spreadIndex } });
    rememberLast(characterId, sectionId);
    try {
      await savePage(ch.notebookPath, sectionId, fileName, page);
      set({ save: { kind: "saved", at: new Date() } });
    } catch (e) {
      set({ save: { kind: "error", message: String(e) } });
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
    notice: null,
    flash: null,
    historyTick: 0,

    async init() {
      const config = parseConfig(await backend.readAppConfig());
      const visible = visibleCharacters(config);
      const last = config.lastOpened;
      const startChar = visible.find((c) => c.id === last.characterId) ?? visible[0];
      set({
        config,
        characters: Object.fromEntries(
          visible.map((c) => [c.id, { status: "loading" } as CharacterState]),
        ),
        view: startChar
          ? { characterId: startChar.id, sectionId: last.sectionId ?? "sessions", spreadIndex: 0 }
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

    async addCharacter({ name, cover, folder, notebookPath }) {
      const id = newId();
      const order = Math.max(-1, ...get().config.characters.map((c) => c.order)) + 1;
      const cfg: CharacterConfig = { id, name, cover, folder, order, archived: false, excludeFromAi: false };
      await get().updateConfig((c) => ({ ...c, characters: [...c.characters, cfg] }));
      setCharacter(id, { status: "loading" });
      await get().reloadCharacter(id);
      void notebookPath;
      get().openCharacter(id);
    },

    async renameCharacter(characterId, name) {
      if (!name.trim()) return;
      await get().updateConfig((c) => ({
        ...c,
        characters: c.characters.map((ch) =>
          ch.id === characterId ? { ...ch, name: name.trim() } : ch,
        ),
      }));
      syncCharacterJson(characterId);
    },

    async setCharacterCover(characterId, cover) {
      await get().updateConfig((c) => ({
        ...c,
        characters: c.characters.map((ch) =>
          ch.id === characterId ? { ...ch, cover } : ch,
        ),
      }));
      syncCharacterJson(characterId);
    },

    async archiveCharacter(characterId) {
      await get().updateConfig((c) => ({
        ...c,
        characters: c.characters.map((ch) =>
          ch.id === characterId ? { ...ch, archived: true } : ch,
        ),
      }));
      watchFolder(characterId, null);
      const view = get().view;
      if ("characterId" in view && view.characterId === characterId) {
        const next = visibleCharacters(get().config).find((c) => c.id !== characterId);
        set({
          view: next
            ? { characterId: next.id, sectionId: "sessions", spreadIndex: 0 }
            : { kind: "empty" },
        });
      }
    },

    async restoreCharacter(characterId) {
      await get().updateConfig((c) => ({
        ...c,
        characters: c.characters.map((ch) =>
          ch.id === characterId ? { ...ch, archived: false } : ch,
        ),
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
      reordered.splice(Math.min(slot, reordered.length), 0, moved);
      await get().updateConfig((c) => ({
        ...c,
        characters: c.characters.map((ch) => {
          const pos = reordered.findIndex((r) => r.id === ch.id);
          return pos >= 0 ? { ...ch, order: pos } : ch;
        }),
      }));
    },

    async reloadCharacter(characterId) {
      const cfg = get().config.characters.find((c) => c.id === characterId);
      if (!cfg) return;
      const result = await loadCharacterFromDisk(
        cfg.folder,
        // Load section ids from the character's default sections for now;
        // after loading character.json we'd use those sections.
        ["sessions", "backstory", "likes", "dislikes", "wants", "notes", "sheet"],
      );
      if (result.status === "missing") {
        setCharacter(characterId, { status: "missing", notebookPath: result.notebookPath });
        watchFolder(characterId, null);
        return;
      }

      // Try to load character.json for the section order and hand settings.
      let character: Character;
      try {
        const text = await backend.readTextFile(`${result.notebookPath}/character.json`);
        character = parseCharacter(text) ?? createCharacter(cfg.name, cfg.cover);
      } catch {
        character = createCharacter(cfg.name, cfg.cover);
      }

      setCharacter(characterId, {
        status: "ok",
        notebookPath: result.notebookPath,
        character,
        sectionPages: result.sectionPages,
        errors: result.errors,
      });
      watchFolder(characterId, result.notebookPath);

      // Open to last section if we're viewing this character.
      const view = get().view;
      if ("characterId" in view && view.characterId === characterId) {
        const v = view;
        const pages = result.sectionPages[v.sectionId] ?? [];
        const spreadIndex = Math.min(v.spreadIndex, Math.max(0, Math.ceil(pages.length / 2) - 1));
        set({ view: { ...v, spreadIndex } });
        rememberLast(characterId, v.sectionId);
        const loaded = pages[spreadIndex * 2];
        set({
          save: loaded?.readOnly
            ? { kind: "read-only", reason: loaded.warning ?? "" }
            : { kind: "saved" },
        });
      }
    },

    openCharacter(characterId) {
      const cfg = get().config.characters.find((c) => c.id === characterId);
      if (!cfg) return;
      const ch = get().characters[characterId];
      const sectionId = "sessions";
      set({ view: { characterId, sectionId, spreadIndex: 0 } });
      rememberLast(characterId, sectionId);
      if (!ch || ch.status === "missing") {
        setCharacter(characterId, { status: "loading" });
        void get().reloadCharacter(characterId);
      }
    },

    openSection(characterId, sectionId) {
      set({ view: { characterId, sectionId, spreadIndex: 0 } });
      rememberLast(characterId, sectionId);
    },

    setSettingsOpen(open) {
      set({ settingsOpen: open });
    },

    setPageListOpen(open) {
      set({ pageListOpen: open });
    },

    dismissNotice() {
      set({ notice: null });
    },

    goToSpread(index) {
      const view = get().view;
      if (!("characterId" in view)) return;
      const ch = get().characters[view.characterId];
      if (!ch || ch.status !== "ok") return;
      const pages = ch.sectionPages[view.sectionId] ?? [];
      const max = Math.max(0, Math.ceil(pages.length / 2) - 1);
      set({ view: { ...view, spreadIndex: Math.max(0, Math.min(index, max)) } });
    },

    goToSpreadDelta(delta) {
      const view = get().view;
      if (!("characterId" in view)) return;
      get().goToSpread(view.spreadIndex + delta);
    },

    async newPage() {
      const view = get().view;
      if (!("characterId" in view)) return;
      const { characterId, sectionId } = view;
      const page = createPage(new Date(), "Untitled page", sectionId);
      await addPage(characterId, sectionId, page);
    },

    async duplicatePage(characterId, sectionId, pageId) {
      const ch = get().characters[characterId];
      if (!ch || ch.status !== "ok") return;
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
      await addPage(characterId, sectionId, copy);
    },

    async deletePage(characterId, sectionId, pageId) {
      const ch = get().characters[characterId];
      if (!ch || ch.status !== "ok") return false;
      const pages = ch.sectionPages[sectionId] ?? [];
      const loaded = pages.find((p) => p.page.id === pageId);
      if (!loaded) return false;
      const key = `${characterId}:${sectionId}:${pageId}`;
      const inflight = inFlight.get(key);
      if (inflight) await inflight.catch(() => undefined);
      const path = pagePath(ch.notebookPath, sectionId, loaded.fileName);
      try {
        await backend.trashPageFile(path);
        forgetDiskText(path);
        dropPage(characterId, sectionId, pageId);
        return true;
      } catch (e) {
        set({ save: { kind: "error", message: String(e) } });
        return false;
      }
    },

    renamePage(characterId, sectionId, pageId, title) {
      if (!title.trim()) return;
      const ch0 = get().characters[characterId];
      if (ch0?.status === "ok") {
        const p0 = ch0.sectionPages[sectionId]?.find((p) => p.page.id === pageId);
        if (p0 && p0.page.title === title.trim()) return;
      }
      const ch = get().characters[characterId];
      if (!ch || ch.status !== "ok") return;
      const pages = ch.sectionPages[sectionId] ?? [];
      const loaded = pages.find((p) => p.page.id === pageId);
      if (!loaded) return;
      const updated = { ...loaded, page: { ...loaded.page, title: title.trim() } };
      const updatedPages = pages.map((p) => (p.page.id === pageId ? updated : p));
      setCharacter(characterId, { ...ch, sectionPages: { ...ch.sectionPages, [sectionId]: updatedPages } });
      const key = `${characterId}:${sectionId}:${pageId}`;
      scheduleSave(key, () => savePageNow(characterId, sectionId, pageId));
    },

    updatePage(mutate) {
      const cur = currentPageOf(get());
      if (!cur) return;
      const { characterId, sectionId, loaded } = cur;
      const page = mutate(loaded.page);
      if (page === loaded.page) return;
      const ch = get().characters[characterId];
      if (ch?.status !== "ok") return;
      const pages = ch.sectionPages[sectionId] ?? [];
      const updatedPages = pages.map((p) => (p.page.id === page.id ? { ...p, page } : p));
      setCharacter(characterId, { ...ch, sectionPages: { ...ch.sectionPages, [sectionId]: updatedPages } });
      set({ save: { kind: "unsaved" } });
      const key = `${characterId}:${sectionId}:${page.id}`;
      scheduleSave(key, () => savePageNow(characterId, sectionId, page.id));
    },

    updatePageIn(characterId, sectionId, pageId, mutate) {
      const ch = get().characters[characterId];
      if (ch?.status !== "ok") return;
      const pages = ch.sectionPages[sectionId] ?? [];
      const loaded = pages.find((p) => p.page.id === pageId);
      if (!loaded) return;
      const page = mutate(loaded.page);
      if (page === loaded.page) return;
      const updatedPages = pages.map((p) => (p.page.id === pageId ? { ...p, page } : p));
      setCharacter(characterId, { ...ch, sectionPages: { ...ch.sectionPages, [sectionId]: updatedPages } });
      set({ save: { kind: "unsaved" } });
      const key = `${characterId}:${sectionId}:${pageId}`;
      scheduleSave(key, () => savePageNow(characterId, sectionId, pageId));
    },

    editElements(mutate) {
      const cur = currentPageOf(get());
      if (!cur) return;
      const { loaded } = cur;
      const page = loaded.page;
      const h = histories.get(page.id) ?? emptyHistory<Element[]>();
      const next = mutate(page.elements);
      if (sameElements(next, page.elements)) return;
      const updated = record(h, next);
      histories.set(page.id, updated);
      set((s) => ({ historyTick: s.historyTick + 1 }));
      get().updatePage((p) => ({ ...p, elements: next }));
    },

    undo() {
      const cur = currentPageOf(get());
      if (!cur) return;
      const page = cur.loaded.page;
      const h = histories.get(page.id);
      if (!h || h.past.length === 0) return;
      const undoResult = undoStep(h, page.elements);
      if (!undoResult) return;
      histories.set(page.id, undoResult.history);
      set((s) => ({ historyTick: s.historyTick + 1 }));
      get().updatePage((p) => ({ ...p, elements: undoResult.value }));
    },

    redo() {
      const cur = currentPageOf(get());
      if (!cur) return;
      const page = cur.loaded.page;
      const h = histories.get(page.id);
      if (!h || h.future.length === 0) return;
      const redoResult = redoStep(h, page.elements);
      if (!redoResult) return;
      histories.set(page.id, redoResult.history);
      set((s) => ({ historyTick: s.historyTick + 1 }));
      get().updatePage((p) => ({ ...p, elements: redoResult.value }));
    },

    async flushSaves() {
      const jobs = [...pending.values()].map((job) => {
        const p = job();
        return p;
      });
      pending.clear();
      timers.forEach(clearTimeout);
      timers.clear();
      await Promise.all([...jobs, ...inFlight.values()].map((p) => p.catch(() => undefined)));
    },

    async applyOutsideChanges(notebookPath, fileNames, rescan) {
      // Find the character this notebook belongs to.
      const characterId = Object.entries(get().characters).find(
        ([, state]) => state.status === "ok" && state.notebookPath === notebookPath,
      )?.[0];
      if (!characterId) return;

      // Deduplicate into one queue per notebook path.
      const prev = outsideQueue.get(notebookPath) ?? Promise.resolve();
      const next = prev.then(async () => {
        if (rescan) {
          await get().reloadCharacter(characterId);
          return;
        }
        for (const fileName of fileNames) {
          await applyOutsideFile(characterId, fileName);
        }
      });
      outsideQueue.set(notebookPath, next.catch(() => undefined));
      await next;
    },

    clearFlash() {
      set({ flash: null });
    },
  };

  async function applyOutsideFile(characterId: string, fileName: string) {
    // fileName from the watcher is just the basename; we need to find which section it's in.
    const ch = get().characters[characterId];
    if (ch?.status !== "ok") return;

    // Search for the file across all sections.
    for (const [sectionId, pages] of Object.entries(ch.sectionPages)) {
      const existing = pages.find((p) => p.fileName === fileName);
      const path = existing
        ? pagePath(ch.notebookPath, sectionId, fileName)
        : null;

      if (!path) continue;

      const key = `${characterId}:${sectionId}:${existing?.page.id ?? ""}`;
      const writing = existing && inFlight.get(key);
      if (writing) await writing.catch(() => undefined);

      const exists = await backend.pathExists(path);
      const text = exists ? await backend.readTextFile(path).catch(() => null) : null;
      if (exists && text === null) continue;
      if (text !== null && text === knownDiskText(path)) return;

      const curCh = get().characters[characterId];
      if (curCh?.status !== "ok") return;
      const curPages = curCh.sectionPages[sectionId] ?? [];
      const unsaved = (pageId: string) =>
        pending.has(`${characterId}:${sectionId}:${pageId}`) ||
        inFlight.has(`${characterId}:${sectionId}:${pageId}`);

      if (text === null) {
        if (!existing) return;
        if (unsaved(existing.page.id)) {
          set({ notice: `"${existing.page.title}" was deleted outside the app while you had unsaved changes. Your version was kept.` });
          return;
        }
        forgetDiskText(path);
        dropPage(characterId, sectionId, existing.page.id);
        return;
      }

      const parsed = parsePage(text);
      if (!parsed.ok) return;
      const page = parsed.page;
      const byId = curPages.find((p) => p.page.id === page.id);
      const target = existing ?? byId;

      if (target && unsaved(target.page.id)) {
        set({ notice: `"${target.page.title}" was changed outside the app while you had unsaved changes. Your version was kept.` });
        return;
      }

      rememberDiskText(path, text);
      if (existing && existing.page.id !== page.id) dropPage(characterId, sectionId, existing.page.id);
      const freshCh = get().characters[characterId];
      if (freshCh?.status !== "ok") return;
      const freshPages = freshCh.sectionPages[sectionId] ?? [];
      const entry: LoadedPage = { fileName, page, readOnly: parsed.readOnly, warning: parsed.warning };
      const updatedPages = [...freshPages.filter((p) => p.page.id !== page.id), entry].sort((a, b) =>
        a.page.createdAt.localeCompare(b.page.createdAt),
      );
      histories.delete(page.id);
      setCharacter(characterId, {
        ...freshCh,
        sectionPages: { ...freshCh.sectionPages, [sectionId]: updatedPages },
      });
      set((s) => ({ historyTick: s.historyTick + 1 }));
      return;
    }
  }
});
