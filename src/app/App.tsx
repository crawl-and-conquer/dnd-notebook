import { useEffect } from "react";
import { HandContext, useWatchFonts } from "../canvas/HandContext";
import { SettingsPanel } from "../components/SettingsPanel";
import { StatusBar } from "../components/StatusBar";
import { Shelf } from "../components/Shelf";
import { Toolbar } from "../components/Toolbar";
import { CloseIcon } from "../components/Icons";
import { backend } from "../storage/backend";
import { useNotebook } from "../store/notebook";
import { TOOL_KEYS, useTools } from "../store/tools";
import { ExportDialog, useExportDialog } from "../components/ExportDialog";
import { NewCharacterDialog, useNewCharacterDialog } from "../components/NewCharacterDialog";
import { ImportDialog, useImportDialog } from "../components/ImportDialog";
import { ChangeFolderDialog, useChangeFolder } from "../components/ChangeFolderDialog";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { HandBuilder } from "../handwriting/HandBuilder";
import { useUpdates } from "./updates";
import { BookView } from "./BookView";

/** "Version x is ready" with Install and restart, or Later. */
function UpdatePrompt() {
  const { state, dismissed, install, dismiss } = useUpdates();
  if (dismissed || (state.kind !== "available" && state.kind !== "installing")) return null;
  return (
    <div className="notice update-notice" role="status">
      <span>
        {state.kind === "available"
          ? `Version ${state.version} of Adventurer's Notebook is ready to install.`
          : `Installing the update${state.percent !== null ? ` (${state.percent}%)` : ""}. The app will restart.`}
      </span>
      {state.kind === "available" && (
        <>
          <button className="small-button" onClick={dismiss}>
            Later
          </button>
          <button className="pill primary" onClick={() => void install()}>
            Install and restart
          </button>
        </>
      )}
    </div>
  );
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

/** True while any dialog or panel covers the book, so book shortcuts stay quiet. */
const overlayOpen = () => {
  const s = useNotebook.getState();
  return (
    s.settingsOpen ||
    s.pageListOpen ||
    s.handwritingOpen ||
    useExportDialog.getState().open ||
    useImportDialog.getState().open ||
    useNewCharacterDialog.getState().open ||
    useChangeFolder.getState().characterId !== null
  );
};

export function App() {
  const ready = useNotebook((s) => s.ready);
  const init = useNotebook((s) => s.init);
  const notice = useNotebook((s) => s.notice);
  const dismissNotice = useNotebook((s) => s.dismissNotice);
  useWatchFonts();

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (!ready || import.meta.env.DEV) return;
    if (useNotebook.getState().config.general.checkForUpdates) void useUpdates.getState().check();
  }, [ready]);

  useEffect(() => {
    if (!backend.isTauri) return;
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
      const off = await getCurrentWindow().onCloseRequested(async () => {
        try {
          await Promise.race([
            useNotebook.getState().flushSaves(),
            new Promise((resolve) => setTimeout(resolve, 3000)),
          ]);
        } catch (e) {
          console.error("Saving before close failed", e);
        }
      });
      if (disposed) off();
      else unlisten = off;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!backend.isTauri) return;
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void import("@tauri-apps/api/event").then(async ({ listen }) => {
      const off = await listen<{ notesPath: string; files: string[]; rescan: boolean }>(
        "notes-changed",
        (e) =>
          void useNotebook
            .getState()
            .applyOutsideChanges(e.payload.notesPath, e.payload.files, e.payload.rescan),
      );
      if (disposed) off();
      else unlisten = off;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useNotebook.getState();
      if (e.ctrlKey && e.key === ",") {
        e.preventDefault();
        s.setSettingsOpen(!s.settingsOpen);
        return;
      }
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "e") {
        e.preventDefault();
        useExportDialog.getState().setOpen(true);
        return;
      }
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "i") {
        e.preventDefault();
        if ("characterId" in s.view) useImportDialog.getState().setOpen(true);
        return;
      }
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        if ("characterId" in s.view && !s.settingsOpen && !useExportDialog.getState().open) {
          s.setPageListOpen(!s.pageListOpen);
        }
        return;
      }
      if (overlayOpen() || isTyping(e.target)) return;
      if (e.key === "PageDown" || e.key === "PageUp") {
        e.preventDefault();
        s.goToSpreadDelta(e.key === "PageDown" ? 1 : -1);
        return;
      }
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const key = e.key.toLowerCase();
      if (key === "g") {
        void s.updateConfig((c) => ({ ...c, general: { ...c.general, lockToLines: !c.general.lockToLines } }));
        return;
      }
      const tool = TOOL_KEYS[key];
      if (tool) useTools.getState().setTool(tool);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="app">
      <Toolbar />
      <main className="main">
        <Shelf />
        {ready ? <MainView /> : <div className="desk placeholder-view">Opening notebook…</div>}
      </main>
      <StatusBar />
      <SettingsPanel />
      <ExportDialog />
      <NewCharacterDialog />
      <ImportDialog />
      <ChangeFolderDialog />
      <ConfirmDialog />
      <UpdatePrompt />
      {notice && (
        <div className="notice" role="status">
          <span>{notice}</span>
          <button className="icon-button small" aria-label="Dismiss" onClick={dismissNotice}>
            <CloseIcon size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

function MainView() {
  const view = useNotebook((s) => s.view);
  const hasCharacters = useNotebook((s) => s.config.characters.some((c) => !c.archived));
  const characterId = "characterId" in view ? view.characterId : null;
  const ch = useNotebook((s) => (characterId ? s.characters[characterId] : null));
  const name = useNotebook((s) => s.config.characters.find((c) => c.id === characterId)?.name);
  const handwritingOpen = useNotebook((s) => s.handwritingOpen);
  const setHandwritingOpen = useNotebook((s) => s.setHandwritingOpen);
  const openSettings = useNotebook((s) => s.setSettingsOpen);

  if (!hasCharacters) {
    return (
      <section className="desk empty-desk">
        <div className="empty-card">
          <h2>Welcome to Adventurer's Notebook</h2>
          <p>Every character gets their own book on the shelf. Add your first one to begin.</p>
          <div className="form-actions">
            <button className="pill ghost" onClick={() => openSettings(true)}>
              Settings
            </button>
            <button className="pill primary" onClick={() => useNewCharacterDialog.getState().setOpen(true)}>
              New character
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (!characterId || !ch || ch.status === "loading") {
    return (
      <section className="desk empty-desk">
        <p className="placeholder-view">{characterId ? `Opening ${name ?? "notebook"}…` : "Choose a book from the shelf."}</p>
      </section>
    );
  }

  if (ch.status === "missing") {
    return (
      <section className="desk empty-desk">
        <div className="empty-card">
          <h2>Folder not found</h2>
          <p>
            {ch.notebookPath} is not available. The drive may be unplugged or the folder moved.
          </p>
          <div className="form-actions">
            <button className="pill ghost" onClick={() => useChangeFolder.getState().open(characterId)}>
              Change folder
            </button>
            <button
              className="pill primary"
              onClick={() => void useNotebook.getState().reloadCharacter(characterId)}
            >
              Try again
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <HandContext.Provider value={{ glyphs: ch.glyphs, hand: ch.character.hand }}>
      <BookView characterId={characterId} />
      {handwritingOpen && (
        <HandBuilder
          characterId={characterId}
          glyphs={ch.glyphs}
          hand={ch.character.hand}
          onClose={() => setHandwritingOpen(false)}
        />
      )}
    </HandContext.Provider>
  );
}
