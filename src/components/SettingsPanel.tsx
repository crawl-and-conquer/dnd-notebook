import { useCallback, useEffect, useState } from "react";
import { COVER_COLOURS } from "../model/character";
import { backend } from "../storage/backend";
import { notebookPathFor } from "../storage/paths";
import { useNotebook, visibleCharacters } from "../store/notebook";
import { CloseIcon, GripIcon } from "./Icons";
import { CoverPicker } from "./CoverPicker";
import { useDragReorder } from "./useDragReorder";
import { AiSection } from "./AiSettings";
import { ExportSection } from "./ExportSettings";
import { GeneralSection } from "./GeneralSettings";

type Section = "characters" | "ai" | "export" | "general";
const SECTIONS: { id: Section; label: string }[] = [
  { id: "characters", label: "Characters and folders" },
  { id: "ai", label: "AI" },
  { id: "export", label: "Export" },
  { id: "general", label: "General" },
];

export function SettingsPanel() {
  const open = useNotebook((s) => s.settingsOpen);
  const setOpen = useNotebook((s) => s.setSettingsOpen);
  const [section, setSection] = useState<Section>("characters");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;
  return (
    <>
      <div className="scrim" onClick={() => setOpen(false)} />
      <aside className="side-panel" role="dialog" aria-modal="true" aria-label="Settings">
        <header>
          <h2>Settings</h2>
          <button
            className="icon-button"
            aria-label="Close settings"
            onClick={() => setOpen(false)}
          >
            <CloseIcon />
          </button>
        </header>
        <div className="settings-body">
          <nav className="settings-nav" aria-label="Settings sections">
            {SECTIONS.map((s) => (
              <button key={s.id} aria-current={section === s.id} onClick={() => setSection(s.id)}>
                {s.label}
              </button>
            ))}
          </nav>
          <div className="settings-section">
            {section === "characters" && <CharactersSection />}
            {section === "ai" && <AiSection />}
            {section === "export" && <ExportSection />}
            {section === "general" && <GeneralSection />}
          </div>
        </div>
      </aside>
    </>
  );
}

function CharactersSection() {
  const config = useNotebook((s) => s.config);
  const characters = useNotebook((s) => s.characters);
  const updateConfig = useNotebook((s) => s.updateConfig);
  const moveCharacter = useNotebook((s) => s.moveCharacter);
  const [adding, setAdding] = useState(config.characters.length === 0);
  const [error, setError] = useState<string | null>(null);
  const list = visibleCharacters(config);
  const ids = list.map((c) => c.id);
  const archived = config.characters
    .filter((c) => c.archived)
    .sort((a, b) => a.name.localeCompare(b.name));
  const onMove = useCallback(
    (id: string, slot: number) => void moveCharacter(id, slot),
    [moveCharacter],
  );
  const { listRef, drag, start, onClickCapture, dropMark } = useDragReorder<HTMLDivElement>(onMove);

  return (
    <>
      <h3>Characters and folders</h3>
      <p className="lead">
        Each character is tied to a folder. The app keeps its pages in a{" "}
        <code>notebook</code> folder inside it.
      </p>

      {list.length === 0 && !adding && <p className="lead">No characters yet.</p>}

      <div
        className={`client-list${drag ? " reordering" : ""}`}
        ref={listRef}
        onClickCapture={onClickCapture}
      >
        {list.map((c, i) => {
          const st = characters[c.id];
          const missing = st?.status === "missing";
          return (
            <div
              className={`client-row${drag?.id === c.id ? " dragging" : ""}`}
              key={c.id}
              data-reorder-id={c.id}
              data-drop={dropMark(ids, i)}
            >
              <button
                type="button"
                className="grip"
                aria-label={`Move ${c.name}. Drag, or use the up and down arrow keys.`}
                title="Drag to reorder"
                onPointerDown={start(c.id)}
                onKeyDown={(e) => {
                  if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
                  e.preventDefault();
                  const target = e.currentTarget.closest("[data-reorder-id]");
                  const from = visibleCharacters(useNotebook.getState().config).findIndex(
                    (x) => x.id === c.id,
                  );
                  void moveCharacter(c.id, e.key === "ArrowUp" ? from - 1 : from + 2);
                  requestAnimationFrame(() =>
                    target?.querySelector<HTMLButtonElement>(".grip")?.focus(),
                  );
                }}
              >
                <GripIcon size={18} />
              </button>
              <span className="marker" style={{ background: c.cover }} aria-hidden="true" />
              <div className="meta">
                <strong>{c.name}</strong>
                <span title={notebookPathFor(c.folder)}>
                  {missing ? "Folder not found: " : ""}
                  {notebookPathFor(c.folder)}
                </span>
              </div>
              <div className="row-actions">
                <label
                  className="exclude-ai"
                  title="Never send this character's notes to the AI provider"
                >
                  <input
                    type="checkbox"
                    checked={c.excludeFromAi}
                    onChange={(e) =>
                      void updateConfig((cfg) => ({
                        ...cfg,
                        characters: cfg.characters.map((x) =>
                          x.id === c.id ? { ...x, excludeFromAi: e.target.checked } : x,
                        ),
                      }))
                    }
                  />
                  Exclude from AI
                </label>
                <button
                  className="small-button"
                  disabled={missing}
                  onClick={() =>
                    void backend
                      .openInExplorer(notebookPathFor(c.folder))
                      .catch((e) => setError(String(e)))
                  }
                >
                  Open folder
                </button>
                <button
                  className="small-button"
                  onClick={() => void useNotebook.getState().archiveCharacter(c.id)}
                >
                  Archive
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {error && <p className="form-error">{error}</p>}

      {archived.length > 0 && (
        <section className="archived-clients" aria-labelledby="archived-heading">
          <h4 id="archived-heading">Archived</h4>
          <p className="lead">Hidden from the shelf. Their folders and pages are untouched.</p>
          {archived.map((c) => (
            <div className="client-row archived" key={c.id}>
              <span className="marker" style={{ background: c.cover }} aria-hidden="true" />
              <div className="meta">
                <strong>{c.name}</strong>
                <span title={notebookPathFor(c.folder)}>{notebookPathFor(c.folder)}</span>
              </div>
              <div className="row-actions">
                <button
                  className="small-button"
                  onClick={() => void useNotebook.getState().restoreCharacter(c.id)}
                >
                  Restore
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {adding ? (
        <AddCharacterForm onDone={() => setAdding(false)} canCancel={list.length > 0} />
      ) : (
        <button className="pill primary" style={{ marginTop: 12 }} onClick={() => setAdding(true)}>
          Add character
        </button>
      )}
    </>
  );
}

function AddCharacterForm({ onDone, canCancel }: { onDone: () => void; canCancel: boolean }) {
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
    const f = await backend.chooseFolder("Choose the character folder");
    if (f) setFolder(f);
  }

  async function confirm(allowForeign: boolean) {
    if (!folder || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await backend.prepareCharacterFolder(folder, name.trim(), cover, allowForeign);
      if (r.status === "foreign") {
        setForeignPath(r.notebookPath);
        return;
      }
      await addCharacter({ name: name.trim(), cover, folder, notebookPath: r.notebookPath });
      onDone();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="form-card"
      onSubmit={(e) => {
        e.preventDefault();
        void confirm(false);
      }}
    >
      <h3>Add character</h3>
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
        <span id="cover-label">Cover colour</span>
        <CoverPicker value={cover} onChange={setCover} labelledBy="cover-label" />
      </div>
      <div className="field">
        Folder
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" className="small-button" onClick={() => void choose()}>
            Choose folder
          </button>
          {folder && <span className="path-preview">{notebookPathFor(folder)}</span>}
        </div>
      </div>

      {foreignPath && (
        <div className="form-warning" role="alert">
          {foreignPath} already exists and was not made by this app. The app will add{" "}
          <code>character.json</code>, <code>pages</code> and <code>assets</code> to it and leave
          your existing files alone.
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
        {canCancel && (
          <button type="button" className="pill ghost" onClick={onDone}>
            Cancel
          </button>
        )}
        <button type="submit" className="pill primary" disabled={busy || !folder || !name.trim()}>
          Add character
        </button>
      </div>
    </form>
  );
}

