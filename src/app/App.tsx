import { useEffect } from "react";
import { PaperStage } from "../canvas/PaperStage";
import { HandContext } from "../canvas/HandContext";
import { SettingsPanel } from "../components/SettingsPanel";
import { StatusBar } from "../components/StatusBar";
import { Shelf } from "../components/Shelf";
import { SectionTabs } from "../components/SectionTabs";
import { CloseIcon } from "../components/Icons";
import { backend } from "../storage/backend";
import { currentSpreadPages, useNotebook } from "../store/notebook";
import { TOOL_KEYS, useTools } from "../store/tools";
import { CatchUpPanel } from "../components/CatchUpPanel";
import { ExportDialog, useExportDialog } from "../components/ExportDialog";
import { NewCharacterDialog, useNewCharacterDialog } from "../components/NewCharacterDialog";
import { ImportDialog, useImportDialog } from "../components/ImportDialog";
import { HandBuilder } from "../handwriting/HandBuilder";
import { SheetPage } from "../sheet/SheetPage";
import { useUpdates } from "./updates";
import { useShallow } from "zustand/react/shallow";

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

function isTyping(t: EventTarget | null): boolean {
  return (
    t instanceof HTMLElement &&
    (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))
  );
}

export function App() {
  const ready = useNotebook((s) => s.ready);
  const init = useNotebook((s) => s.init);
  const notice = useNotebook((s) => s.notice);
  const dismissNotice = useNotebook((s) => s.dismissNotice);

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
      const win = getCurrentWindow();
      const off = await win.onCloseRequested(async () => {
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
        useImportDialog.getState().setOpen(true);
        return;
      }
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        if ("characterId" in s.view && !s.settingsOpen && !useExportDialog.getState().open) {
          s.setPageListOpen(!s.pageListOpen);
        }
        return;
      }
      if (
        isTyping(e.target) ||
        e.ctrlKey ||
        e.altKey ||
        e.metaKey ||
        s.settingsOpen ||
        s.pageListOpen ||
        useExportDialog.getState().open
      )
        return;
      const key = e.key.toLowerCase();
      if (key === "g") {
        void s.updateConfig((c) => ({
          ...c,
          general: { ...c.general, lockToLines: !c.general.lockToLines },
        }));
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
      <main className="main">
        {ready ? <MainView /> : <div className="placeholder-view">Opening notebook…</div>}
        <CatchUpPanel />
      </main>
      <StatusBar />
      <SettingsPanel />
      <ExportDialog />
      <NewCharacterDialog />
      <ImportDialog />
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
  const config = useNotebook((s) => s.config);
  const spread = useNotebook(useShallow(currentSpreadPages));
  const updatePage = useNotebook((s) => s.updatePage);
  const setPageOffset = useNotebook((s) => s.setPageOffset);
  const openSettings = useNotebook((s) => s.setSettingsOpen);
  const openNewChar = useNewCharacterDialog((s) => s.setOpen);
  const handwritingOpen = useNotebook((s) => s.handwritingOpen);
  const setHandwritingOpen = useNotebook((s) => s.setHandwritingOpen);

  const hasCharacters = config.characters.some((c) => !c.archived);
  const characterId = "characterId" in view ? view.characterId : null;
  const ch = useNotebook((s) => (characterId ? s.characters[characterId] : null));

  if (!hasCharacters) {
    return (
      <div className="layout">
        <div className="empty-state">
          <div>
            <h2>Welcome to Adventurer's Notebook</h2>
            <p>Create your first character to get started.</p>
            <div className="actions">
              <button className="pill primary" onClick={() => openNewChar(true)}>
                New character
              </button>
              <button className="pill ghost" onClick={() => openSettings(true)}>
                Settings
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!characterId || !ch) {
    return (
      <div className="layout">
        <Shelf />
        <div className="empty-state">
          <div>
            <p>Select a character from the shelf.</p>
          </div>
        </div>
      </div>
    );
  }

  if (ch.status === "loading") {
    return (
      <div className="layout">
        <Shelf />
        <div className="placeholder-view">
          Opening {config.characters.find((c) => c.id === characterId)?.name}…
        </div>
      </div>
    );
  }

  if (ch.status === "missing") {
    return (
      <div className="layout">
        <Shelf />
        <div className="empty-state">
          <div>
            <h2>Folder not found</h2>
            <p>
              {ch.notebookPath} is not available. The drive may be unplugged or the folder moved.
            </p>
            <div className="actions">
              <button className="pill primary" onClick={() => openSettings(true)}>
                Settings
              </button>
              <button
                className="pill ghost"
                onClick={() => void useNotebook.getState().reloadCharacter(characterId)}
              >
                Try again
              </button>
            </div>
          </div>
        </div>
        <SectionTabs characterId={characterId} />
      </div>
    );
  }

  // ok status — show spread
  if (!spread) {
    return (
      <div className="layout">
        <Shelf />
        <div className="empty-state">
          <div>
            <h2>No pages yet</h2>
            <p>Start the first page.</p>
            <div className="actions">
              <button className="pill primary" onClick={() => void useNotebook.getState().newPage()}>
                New page
              </button>
            </div>
          </div>
        </div>
        <SectionTabs characterId={characterId} />
      </div>
    );
  }

  const { left, right } = spread;
  const handCtx = ch.status === "ok" ? { glyphs: ch.glyphs, hand: ch.character.hand } : null;
  const isSheetSection = ch.status === "ok" &&
    ch.character.sections.find((s) => s.id === ("characterId" in view ? view.sectionId : ""))?.kind === "sheet";

  return (
    <HandContext.Provider value={handCtx}>
      <div className="layout">
        <Shelf />
        <div className="cover">
          <div className="spread">
            {left && (
              <div className="spread-page spread-left">
                <PaperStage
                  page={left.page}
                  readOnly={left.readOnly}
                  notebookPath={ch.notebookPath}
                  onTitleChange={(title) => updatePage((p) => ({ ...p, title }))}
                  onActivate={() => setPageOffset(0)}
                />
                {left.page.sheetPageType && ch.status === "ok" && (
                  <div className="sheet-overlay">
                    <SheetPage
                      page={left.page}
                      characterId={characterId}
                      sheet={ch.sheet}
                      trackers={ch.trackers}
                    />
                  </div>
                )}
              </div>
            )}
            {right ? (
              <div className="spread-page spread-right">
                <PaperStage
                  page={right.page}
                  readOnly={right.readOnly}
                  notebookPath={ch.notebookPath}
                  onTitleChange={(title) => updatePage((p) => ({ ...p, title }))}
                  onActivate={() => setPageOffset(1)}
                />
                {right.page.sheetPageType && ch.status === "ok" && (
                  <div className="sheet-overlay">
                    <SheetPage
                      page={right.page}
                      characterId={characterId}
                      sheet={ch.sheet}
                      trackers={ch.trackers}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="spread-page spread-right spread-blank" aria-hidden="true" />
            )}
          </div>
          {isSheetSection && ch.status === "ok" && (
            <div className="sheet-rest-bar">
              <button
                className="small-button sh-rest-btn"
                onClick={() => void useNotebook.getState().shortRest(characterId)}
              >
                Short rest
              </button>
              <button
                className="small-button sh-rest-btn"
                onClick={() => void useNotebook.getState().longRest(characterId)}
              >
                Long rest
              </button>
            </div>
          )}
        </div>
        <SectionTabs characterId={characterId} />
        {handwritingOpen && ch.status === "ok" && (
          <HandBuilder
            characterId={characterId}
            glyphs={ch.glyphs}
            hand={ch.character.hand}
            onClose={() => setHandwritingOpen(false)}
          />
        )}
      </div>
    </HandContext.Provider>
  );
}
