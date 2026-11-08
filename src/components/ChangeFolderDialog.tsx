import { useState } from "react";
import { create } from "zustand";
import { backend } from "../storage/backend";
import { notebookPathFor } from "../storage/paths";
import { useNotebook } from "../store/notebook";
import { CloseIcon } from "./Icons";

export const useChangeFolder = create<{ characterId: string | null; open(id: string | null): void }>(
  (set) => ({ characterId: null, open: (characterId) => set({ characterId }) }),
);

/**
 * Change a character's folder: either move the existing notebook there (copied, checked,
 * then the old copy goes to the Recycle Bin), or point at a notebook already in that folder.
 */
export function ChangeFolderDialog() {
  const characterId = useChangeFolder((s) => s.characterId);
  if (!characterId) return null;
  return <Dialog characterId={characterId} onClose={() => useChangeFolder.getState().open(null)} />;
}

function Dialog({ characterId, onClose }: { characterId: string; onClose(): void }) {
  const cfg = useNotebook((s) => s.config.characters.find((c) => c.id === characterId));
  const state = useNotebook((s) => s.characters[characterId]);
  const [folder, setFolder] = useState<string | null>(null);
  const [hasNotebook, setHasNotebook] = useState(false);
  const [mode, setMode] = useState<"move" | "point">("move");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!cfg) return null;
  const canMove = state?.status === "ok";

  async function choose() {
    setError(null);
    const f = await backend.chooseFolder(`Choose the new folder for ${cfg!.name}`);
    if (!f) return;
    setFolder(f);
    const exists = await backend.pathExists(notebookPathFor(f));
    setHasNotebook(exists);
    setMode(exists || !canMove ? "point" : "move");
  }

  async function apply() {
    if (!folder) return;
    setBusy(true);
    setError(null);
    const s = useNotebook.getState();
    try {
      if (mode === "move") {
        if (state?.status !== "ok") throw new Error("The current notebook folder is not available.");
        await s.flushSaves();
        const r = await backend.moveNotebook(state.notebookPath, folder);
        await s.setCharacterFolder(characterId, folder);
        if (r.oldLeftBehind) {
          useNotebook.setState({
            notice: `Moved ${r.files} files. The old folder could not go to the Recycle Bin (${r.oldLeftBehind}); remove it by hand when you are ready.`,
          });
        }
      } else {
        const r = await backend.prepareCharacterFolder(folder, cfg!.name, cfg!.cover, false);
        if (r.status === "foreign") {
          throw new Error(`${r.notebookPath} was not made by this app. Choose another folder.`);
        }
        await s.setCharacterFolder(characterId, folder);
      }
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="change-folder-title">
        <header>
          <h2 id="change-folder-title">Change {cfg.name}'s folder</h2>
          <button className="icon-button" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>
        <p className="lead">
          Now: <span className="path-preview">{notebookPathFor(cfg.folder)}</span>
        </p>
        <div className="field">
          New folder
          <div className="inline-row">
            <button type="button" className="small-button" onClick={() => void choose()}>
              Choose folder
            </button>
            {folder && <span className="path-preview">{notebookPathFor(folder)}</span>}
          </div>
        </div>
        {folder && (
          <fieldset className="choice-list">
            <legend className="visually-hidden">What to do</legend>
            <label className={!canMove || hasNotebook ? "disabled" : ""}>
              <input
                type="radio"
                name="folder-mode"
                checked={mode === "move"}
                disabled={!canMove || hasNotebook}
                onChange={() => setMode("move")}
              />
              <span>
                <strong>Move my notebook there</strong>
                <small>
                  Every file is copied and checked first; then the old folder goes to the Recycle Bin.
                  {hasNotebook && " Not possible: that folder already has a notebook."}
                </small>
              </span>
            </label>
            <label>
              <input
                type="radio"
                name="folder-mode"
                checked={mode === "point"}
                onChange={() => setMode("point")}
              />
              <span>
                <strong>Use the notebook in that folder</strong>
                <small>
                  {hasNotebook
                    ? "Opens the notebook already there. The old folder is left as it is."
                    : "Starts an empty notebook there. The old folder is left as it is."}
                </small>
              </span>
            </label>
          </fieldset>
        )}
        {error && <p className="form-error">{error}</p>}
        <div className="form-actions">
          <button className="pill ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="pill primary" disabled={!folder || busy} onClick={() => void apply()}>
            {mode === "move" ? "Move notebook" : "Use this folder"}
          </button>
        </div>
      </div>
    </>
  );
}
