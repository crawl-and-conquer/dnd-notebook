import { invoke } from "@tauri-apps/api/core";

/**
 * Thin, typed wrapper over the Rust file commands (src-tauri/src/commands/fs.rs).
 * When the UI runs in a plain browser (vite dev without Tauri), an in-memory
 * stand-in is used so the chrome can be previewed. It never touches disk.
 */
export type PrepareStatus = "created" | "existing" | "foreign";
export type PrepareResult = { status: PrepareStatus; notebookPath: string };
export type MoveNotebookResult = {
  /** `<new folder>/notebook` */
  notebookPath: string;
  /** Files copied and verified. */
  files: number;
  /** Why the old notebook folder could not go to the Recycle Bin, if it could not. */
  oldLeftBehind: string | null;
};

export interface Backend {
  readonly isTauri: boolean;
  readAppConfig(): Promise<string | null>;
  writeAppConfig(contents: string): Promise<void>;
  appConfigPath(): Promise<string>;
  /** Other small app-data files, such as the AI summary cache. */
  readAppFile(name: string): Promise<string | null>;
  writeAppFile(name: string, contents: string): Promise<void>;
  pathExists(path: string): Promise<boolean>;
  /**
   * Creates (or checks) `<folder>/notebook` with the character's default section dirs.
   * Returns "created", "existing" (this app's folder) or "foreign" (someone else's folder).
   */
  prepareCharacterFolder(
    folder: string,
    name: string,
    cover: string,
    allowForeign: boolean,
  ): Promise<PrepareResult>;
  /** File names (not paths) of every `*.page.json` in `<notebook>/pages/<sectionId>`. */
  listSectionPageFiles(notebookPath: string, sectionId: string): Promise<string[]>;
  readTextFile(path: string): Promise<string>;
  writeTextAtomic(path: string, contents: string): Promise<void>;
  /** Renames a file; fails if the target exists. */
  renameFile(from: string, to: string): Promise<void>;
  /** Moves a page file (and its `.bak`) to the Recycle Bin. Never a hard delete. */
  trashPageFile(path: string): Promise<void>;
  openInExplorer(path: string): Promise<void>;
  /**
   * Copies a notebook folder into `<toFolder>/notebook`, verifies every file, then moves the old
   * folder to the Recycle Bin. On any failure before that, the original is untouched.
   */
  moveNotebook(fromNotebook: string, toFolder: string): Promise<MoveNotebookResult>;
  /** Keeps the name and cover colour in `character.json` in step with app config. */
  updateCharacterMeta(notebookPath: string, name: string, cover: string): Promise<void>;
  /** Creates `hand`, `imports`, `assets` or `pages/<sectionId>` inside the notebook. */
  ensureNotebookDir(notebookPath: string, rel: string): Promise<void>;
  /** Moves a removed section's folder to the Recycle Bin. */
  trashSectionFolder(notebookPath: string, sectionId: string): Promise<void>;
  /** Keeps a copy of an imported PDF in `imports/`; returns its notebook-relative path. */
  saveImportCopy(notebookPath: string, fileName: string, pdfBase64: string): Promise<string>;
  /** Starts watching each `<notebook>/pages/<sectionId>`; changes arrive as `notes-changed` events. */
  watchNotebookFolder(notebookPath: string): Promise<void>;
  unwatchNotebookFolder(notebookPath: string): Promise<void>;
  /** Saves PNG bytes (base64) into `<notebook>/assets`, de-duplicated; returns `assets/<sha256>.png`. */
  saveAsset(notebookPath: string, pngBase64: string): Promise<string>;
  readAsset(notebookPath: string, rel: string): Promise<ArrayBuffer>;
  /** Export: a fresh `notebook-export-<date>` folder in `dest`, then files inside it only. */
  exportPrepareDir(dest: string, date: string): Promise<string>;
  exportWrite(root: string, rel: string, base64: string): Promise<void>;
  exportWriteText(root: string, rel: string, text: string): Promise<void>;
  exportCopyAsset(notebookPath: string, asset: string, root: string, rel: string): Promise<void>;
  /** API keys: saved to the OS credential store. Only the last four characters ever come back. */
  keyStatus(provider: string): Promise<string | null>;
  saveKey(provider: string, key: string): Promise<string>;
  removeKey(provider: string): Promise<void>;
  chooseFolder(title: string): Promise<string | null>;
}

const tauriBackend: Backend = {
  isTauri: true,
  readAppConfig: () => invoke<string | null>("read_app_config"),
  writeAppConfig: (contents) => invoke("write_app_config", { contents }),
  appConfigPath: () => invoke<string>("app_config_path"),
  readAppFile: (name) => invoke<string | null>("read_app_file", { name }),
  writeAppFile: (name, contents) => invoke("write_app_file", { name, contents }),
  pathExists: (path) => invoke<boolean>("path_exists", { path }),
  prepareCharacterFolder: (folder, name, cover, allowForeign) =>
    invoke<PrepareResult>("prepare_character_folder", { folder, name, cover, allowForeign }),
  listSectionPageFiles: (notebookPath, sectionId) =>
    invoke<string[]>("list_section_page_files", { notebookPath, sectionId }),
  readTextFile: (path) => invoke<string>("read_text_file", { path }),
  writeTextAtomic: (path, contents) => invoke("write_text_atomic", { path, contents }),
  renameFile: (from, to) => invoke("rename_file", { from, to }),
  trashPageFile: (path) => invoke("trash_page_file", { path }),
  openInExplorer: (path) => invoke("open_in_explorer", { path }),
  moveNotebook: (fromNotebook, toFolder) =>
    invoke<MoveNotebookResult>("move_notebook", { fromNotebook, toFolder }),
  updateCharacterMeta: (notebookPath, name, cover) =>
    invoke("update_character_meta", { notebookPath, name, cover }),
  ensureNotebookDir: (notebookPath, rel) => invoke("ensure_notebook_dir", { notebookPath, rel }),
  trashSectionFolder: (notebookPath, sectionId) =>
    invoke("trash_section_folder", { notebookPath, sectionId }),
  saveImportCopy: (notebookPath, fileName, dataBase64) =>
    invoke<string>("save_import_copy", { notebookPath, fileName, dataBase64 }),
  watchNotebookFolder: (notebookPath) => invoke("watch_notebook_folder", { notebookPath }),
  unwatchNotebookFolder: (notebookPath) => invoke("unwatch_notebook_folder", { notebookPath }),
  saveAsset: (notebookPath, dataBase64) => invoke<string>("save_asset", { notebookPath, dataBase64 }),
  readAsset: (notebookPath, rel) => invoke<ArrayBuffer>("read_asset", { notebookPath, rel }),
  exportPrepareDir: (dest, date) => invoke<string>("export_prepare_dir", { dest, date }),
  exportWrite: (root, rel, dataBase64) => invoke("export_write", { root, rel, dataBase64 }),
  exportWriteText: (root, rel, text) => invoke("export_write_text", { root, rel, text }),
  exportCopyAsset: (notebookPath, asset, root, rel) =>
    invoke("export_copy_asset", { notebookPath, asset, root, rel }),
  keyStatus: (provider) => invoke<string | null>("key_status", { provider }),
  saveKey: (provider, key) => invoke<string>("save_key", { provider, key }),
  removeKey: (provider) => invoke("remove_key", { provider }),
  chooseFolder: async (title) => {
    // Dev builds only: end-to-end scripts queue answers here, because the native picker
    // cannot be driven over the debugging port. Release builds compile this out.
    if (import.meta.env.DEV) {
      const queue = (window as { __e2eFolders?: string[] }).__e2eFolders;
      if (queue?.length) return queue.shift() ?? null;
    }
    const { open } = await import("@tauri-apps/plugin-dialog");
    const r = await open({ directory: true, multiple: false, title });
    return typeof r === "string" ? r : null;
  },
};

function createMemoryBackend(): Backend {
  const files = new Map<string, string>();
  const assets = new Map<string, ArrayBuffer>();
  const appFiles = new Map<string, string>();
  const keys = new Map<string, string>();
  const dirs = new Set<string>(["C:/Demo/Dawnrunner"]);
  let config: string | null = null;
  return {
    isTauri: false,
    readAppConfig: async () => config,
    writeAppConfig: async (c) => {
      config = c;
    },
    appConfigPath: async () => "(browser preview, not saved)",
    readAppFile: async (name) => appFiles.get(name) ?? null,
    writeAppFile: async (name, contents) => {
      appFiles.set(name, contents);
    },
    pathExists: async (p) => dirs.has(p) || files.has(p),
    prepareCharacterFolder: async (folder) => {
      const notebookPath = `${folder}/notebook`;
      const status: PrepareStatus = dirs.has(notebookPath) ? "existing" : "created";
      dirs.add(folder);
      dirs.add(notebookPath);
      dirs.add(`${notebookPath}/pages`);
      dirs.add(`${notebookPath}/assets`);
      for (const s of ["sessions", "backstory", "likes", "dislikes", "wants", "notes", "sheet"])
        dirs.add(`${notebookPath}/pages/${s}`);
      return { status, notebookPath };
    },
    listSectionPageFiles: async (notebookPath, sectionId) => {
      const prefix = `${notebookPath}/pages/${sectionId}/`;
      return [...files.keys()]
        .filter((k) => k.startsWith(prefix) && k.endsWith(".page.json"))
        .map((k) => k.slice(prefix.length))
        .sort();
    },
    readTextFile: async (p) => {
      const v = files.get(p);
      if (v === undefined) throw new Error(`File not found: ${p}`);
      return v;
    },
    writeTextAtomic: async (p, c) => {
      if (files.has(p)) files.set(`${p}.bak`, files.get(p) as string);
      files.set(p, c);
    },
    renameFile: async (from, to) => {
      if (files.has(to)) throw new Error(`A file named ${to} already exists`);
      const v = files.get(from);
      if (v === undefined) throw new Error(`File not found: ${from}`);
      files.delete(from);
      files.set(to, v);
    },
    // Browser preview has no Recycle Bin; the in-memory files simply go.
    trashPageFile: async (p) => {
      if (!files.has(p)) throw new Error(`File not found: ${p}`);
      files.delete(p);
      files.delete(`${p}.bak`);
    },
    openInExplorer: async () => undefined,
    updateCharacterMeta: async () => undefined,
    ensureNotebookDir: async (notebookPath, rel) => {
      dirs.add(`${notebookPath}/${rel}`);
    },
    trashSectionFolder: async (notebookPath, sectionId) => {
      const prefix = `${notebookPath}/pages/${sectionId}/`;
      for (const k of [...files.keys()]) if (k.startsWith(prefix)) files.delete(k);
      dirs.delete(`${notebookPath}/pages/${sectionId}`);
    },
    saveImportCopy: async (notebookPath, fileName, b64) => {
      files.set(`${notebookPath}/imports/${fileName}`, `(pdf, ${Math.round((b64.length * 3) / 4)} bytes)`);
      return `imports/${fileName}`;
    },
    // Browser preview: moves the in-memory files (there is no Recycle Bin to use).
    moveNotebook: async (fromNotebook, toFolder) => {
      const toNotebook = `${toFolder}/notebook`;
      if ([...files.keys()].some((k) => k.startsWith(`${toNotebook}/`))) {
        throw new Error(`${toNotebook} already exists and is not empty.`);
      }
      const moving = [...files.keys()].filter((k) => k.startsWith(`${fromNotebook}/`));
      for (const k of moving) {
        files.set(toNotebook + k.slice(fromNotebook.length), files.get(k) as string);
        files.delete(k);
      }
      for (const [k, v] of [...assets]) {
        if (!k.startsWith(`${fromNotebook}/`)) continue;
        assets.set(toNotebook + k.slice(fromNotebook.length), v);
        assets.delete(k);
      }
      for (const d of [...dirs]) {
        if (d === fromNotebook || d.startsWith(`${fromNotebook}/`)) {
          dirs.delete(d);
          dirs.add(toNotebook + d.slice(fromNotebook.length));
        }
      }
      dirs.add(toFolder);
      return { notebookPath: toNotebook, files: moving.length, oldLeftBehind: null };
    },
    // Nothing changes outside the app in the browser preview.
    watchNotebookFolder: async () => undefined,
    unwatchNotebookFolder: async () => undefined,
    saveAsset: async (notebookPath, b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
      const rel = `assets/${hex}.png`;
      assets.set(`${notebookPath}/${rel}`, bytes.buffer);
      return rel;
    },
    exportPrepareDir: async (dest, date) => {
      const root = `${dest}/notebook-export-${date}`;
      dirs.add(root);
      return root;
    },
    exportWrite: async (root, rel, b64) => {
      files.set(`${root}/${rel}`, `(binary, ${Math.round((b64.length * 3) / 4)} bytes)`);
    },
    exportWriteText: async (root, rel, text) => {
      files.set(`${root}/${rel}`, text);
    },
    exportCopyAsset: async (notebookPath, asset, root, rel) => {
      const v = assets.get(`${notebookPath}/${asset}`);
      if (v) assets.set(`${root}/${rel}`, v);
    },
    // Browser preview only: keeps the last four characters, never the key.
    keyStatus: async (p) => keys.get(p) ?? null,
    saveKey: async (p, k) => {
      keys.set(p, k.trim().slice(-4));
      return k.trim().slice(-4);
    },
    removeKey: async (p) => {
      keys.delete(p);
    },
    readAsset: async (notebookPath, rel) => {
      const v = assets.get(`${notebookPath}/${rel}`);
      if (!v) throw new Error(`Asset not found: ${rel}`);
      return v;
    },
    chooseFolder: async () =>
      window.prompt("Folder path (browser preview)", "C:/Demo/Dawnrunner"),
  };
}

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const backend: Backend = isTauri ? tauriBackend : createMemoryBackend();
