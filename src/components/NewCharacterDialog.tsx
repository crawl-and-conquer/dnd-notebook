import { create } from "zustand";
import { useEffect, useState } from "react";
import { COVER_COLOURS } from "../model/character";
import { backend } from "../storage/backend";
import { notebookPathFor } from "../storage/paths";
import { useNotebook } from "../store/notebook";
import { CoverPicker } from "./CoverPicker";
import { CloseIcon } from "./Icons";

export const useNewCharacterDialog = create<{ open: boolean; setOpen(o: boolean): void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

export function NewCharacterDialog() {
  const open = useNewCharacterDialog((s) => s.open);
  const setOpen = useNewCharacterDialog((s) => s.setOpen);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;
  return <Dialog onClose={() => setOpen(false)} />;
}

function Dialog({ onClose }: { onClose(): void }) {
  const addCharacter = useNotebook((s) => s.addCharacter);
  const [name, setName] = useState("");
  const [cover, setCover] = useState<string>(COVER_COLOURS[0].value);
  const [folder, setFolder] = useState<string | null>(null);
  const [foreignPath, setForeignPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose() {
    setError(null);
    setForeignPath(null);
    const f = await backend.chooseFolder("Choose a folder for this character");
    if (f) setFolder(f);
  }

  async function confirm(allowForeign: boolean) {
    if (!folder || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await backend.prepareCharacterFolder(folder, name.trim(), cover, allowForeign);
      if (r.status === "foreign" && !allowForeign) {
        setForeignPath(r.notebookPath);
        return;
      }
      await addCharacter({ name: name.trim(), cover, folder, notebookPath: r.notebookPath });
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
      <div className="new-character-dialog" role="dialog" aria-modal="true" aria-labelledby="new-char-title">
        <header>
          <h2 id="new-char-title">New character</h2>
          <button className="icon-button" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void confirm(false);
          }}
        >
          <label className="field">
            Name
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Thorin Oakenshield"
              autoFocus
            />
          </label>

          <div className="field">
            <span id="new-char-cover-label">Cover colour</span>
            <CoverPicker value={cover} onChange={setCover} labelledBy="new-char-cover-label" />
          </div>

          <div className="field">
            Folder
            <div className="inline-row">
              <button type="button" className="small-button" onClick={() => void choose()}>
                Choose folder
              </button>
              {folder && (
                <span className="path-preview" title={notebookPathFor(folder)}>
                  {notebookPathFor(folder)}
                </span>
              )}
            </div>
            <span className="hint">
              A <code>notebook</code> folder will be created inside the folder you choose.
            </span>
          </div>

          {foreignPath && (
            <div className="form-warning" role="alert">
              {foreignPath} already exists and was not made by this app. The app will add{" "}
              <code>character.json</code> and section folders to it, leaving your existing files
              alone.
              <div className="form-actions" style={{ marginTop: 10 }}>
                <button type="button" className="small-button" onClick={() => setForeignPath(null)}>
                  Choose another folder
                </button>
                <button type="button" className="small-button" onClick={() => void confirm(true)}>
                  Use this folder
                </button>
              </div>
            </div>
          )}

          {error && <p className="form-error">{error}</p>}

          <div className="form-actions">
            <button type="button" className="pill ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="pill primary"
              disabled={busy || !folder || !name.trim()}
            >
              Create character
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
