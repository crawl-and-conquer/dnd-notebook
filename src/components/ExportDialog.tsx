import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import {
  countPages,
  exportTargets,
  runExport,
  type ExportProgress,
  type ExportResult,
  type ExportScope,
} from "../export/runExport";
import { backend } from "../storage/backend";
import { currentSpreadPages, useNotebook } from "../store/notebook";
import { CloseIcon } from "./Icons";

export const useExportDialog = create<{ open: boolean; setOpen(o: boolean): void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

/** Documents, or wherever Settings says. */
export async function defaultDestination(saved: string): Promise<string> {
  if (saved) return saved;
  if (!backend.isTauri) return "C:/Demo/Exports";
  const { documentDir } = await import("@tauri-apps/api/path");
  return documentDir();
}

type Phase =
  | { kind: "form" }
  | { kind: "running"; progress: ExportProgress }
  | { kind: "done"; result: ExportResult }
  | { kind: "error"; message: string };

export function ExportDialog() {
  const open = useExportDialog((s) => s.open);
  if (!open) return null;
  return <Dialog />;
}

function Dialog() {
  const setOpen = useExportDialog((s) => s.setOpen);
  const defaults = useNotebook((s) => s.config.export);
  const view = useNotebook((s) => s.view);
  const characterId = "characterId" in view ? view.characterId : undefined;
  const sectionId = "characterId" in view ? view.sectionId : undefined;
  const spreadIndex = "characterId" in view ? view.spreadIndex : undefined;
  const name = useNotebook((s) => s.config.characters.find((c) => c.id === characterId)?.name);
  const sectionName = useNotebook((s) => {
    const ch = characterId ? s.characters[characterId] : undefined;
    return ch?.status === "ok" ? ch.character.sections.find((x) => x.id === sectionId)?.name : undefined;
  });
  const spread = useNotebook(useShallow(currentSpreadPages));

  const [scope, setScope] = useState<ExportScope>(characterId ? "character" : "all");
  const [format, setFormat] = useState(defaults.format);
  const [destination, setDestination] = useState("");
  const [includeImages, setIncludeImages] = useState(defaults.includeImages);
  const [includeDone, setIncludeDone] = useState(defaults.includeDone);
  const [printerFriendly, setPrinterFriendly] = useState(defaults.printerFriendly);
  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  const abort = useRef<AbortController | null>(null);
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void defaultDestination(defaults.destination).then(setDestination);
    firstField.current?.focus();
  }, [defaults.destination]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase.kind !== "running") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase.kind, setOpen]);

  const count = countPages(exportTargets(scope, characterId, sectionId, spreadIndex));

  const start = async () => {
    abort.current = new AbortController();
    setPhase({ kind: "running", progress: { done: 0, total: count, label: "Starting" } });
    try {
      const result = await runExport(
        { scope, characterId, sectionId, spreadIndex, format, destination, includeImages, includeDone, printerFriendly },
        (progress) => setPhase({ kind: "running", progress }),
        abort.current.signal,
      );
      setPhase({ kind: "done", result });
    } catch (e) {
      setPhase({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <>
      <div className="scrim" onClick={() => phase.kind !== "running" && setOpen(false)} />
      <div className="export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-title">
        <header>
          <h2 id="export-title">Export</h2>
          <button
            className="icon-button"
            aria-label="Close export"
            disabled={phase.kind === "running"}
            onClick={() => setOpen(false)}
          >
            <CloseIcon />
          </button>
        </header>

        {phase.kind === "form" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void start();
            }}
          >
            <fieldset>
              <legend>What to export</legend>
              <label>
                <input
                  type="radio"
                  name="scope"
                  ref={firstField}
                  checked={scope === "all"}
                  onChange={() => setScope("all")}
                />
                All characters
              </label>
              <label className={characterId ? "" : "disabled"}>
                <input
                  type="radio"
                  name="scope"
                  disabled={!characterId}
                  checked={scope === "character"}
                  onChange={() => setScope("character")}
                />
                This character{name ? `: ${name}` : ""}
              </label>
              <label className={sectionId ? "" : "disabled"}>
                <input
                  type="radio"
                  name="scope"
                  disabled={!sectionId}
                  checked={scope === "section"}
                  onChange={() => setScope("section")}
                />
                This section{sectionName ? `: ${sectionName}` : ""}
              </label>
              <label className={spread ? "" : "disabled"}>
                <input
                  type="radio"
                  name="scope"
                  disabled={!spread}
                  checked={scope === "spread"}
                  onChange={() => setScope("spread")}
                />
                This spread{spread ? `: ${spread.left.page.title || "Untitled page"}` : ""}
              </label>
            </fieldset>

            <fieldset>
              <legend>Format</legend>
              {(
                [
                  ["markdown", "Markdown"],
                  ["pdf", "PDF"],
                  ["both", "Both"],
                ] as const
              ).map(([id, label]) => (
                <label key={id}>
                  <input
                    type="radio"
                    name="format"
                    checked={format === id}
                    onChange={() => setFormat(id)}
                  />
                  {label}
                </label>
              ))}
            </fieldset>

            <div className="field">
              <span>Destination folder</span>
              <span className="inline-row">
                <code className="path" title={destination}>
                  {destination || "Choose a folder"}
                </code>
                <button
                  type="button"
                  className="small-button"
                  onClick={() =>
                    void backend
                      .chooseFolder("Choose where to export")
                      .then((f) => f && setDestination(f))
                  }
                >
                  Choose folder
                </button>
              </span>
              <span className="hint">
                A new notebook-export folder with today’s date is made inside it.
              </span>
            </div>

            <fieldset className="checks">
              <legend>Options</legend>
              <label>
                <input
                  type="checkbox"
                  checked={includeImages}
                  onChange={(e) => setIncludeImages(e.target.checked)}
                />
                Include images
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={includeDone}
                  onChange={(e) => setIncludeDone(e.target.checked)}
                />
                Include done items
              </label>
              <label className={format === "markdown" ? "disabled" : ""}>
                <input
                  type="checkbox"
                  checked={printerFriendly}
                  disabled={format === "markdown"}
                  onChange={(e) => setPrinterFriendly(e.target.checked)}
                />
                Printer friendly PDF (white paper, light blue grid, dark ink)
              </label>
            </fieldset>

            <div className="form-actions">
              <button type="button" className="pill ghost" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="pill primary" disabled={!destination || count === 0}>
                Export {count} page{count === 1 ? "" : "s"}
              </button>
            </div>
          </form>
        )}

        {phase.kind === "running" && (
          <div className="export-progress" role="status" aria-live="polite">
            <p>
              Exporting {Math.min(phase.progress.done + 1, phase.progress.total)} of{" "}
              {phase.progress.total}: {phase.progress.label}
            </p>
            <progress max={phase.progress.total} value={phase.progress.done} />
            <div className="form-actions">
              <button className="pill ghost" onClick={() => abort.current?.abort()}>
                Stop
              </button>
            </div>
          </div>
        )}

        {phase.kind === "done" && (
          <div className="export-progress" role="status">
            <p>
              {phase.result.cancelled ? "Stopped after" : "Exported"} {phase.result.pages} page
              {phase.result.pages === 1 ? "" : "s"} ({phase.result.files} files) to
            </p>
            <code className="path">{phase.result.root}</code>
            <div className="form-actions">
              <button className="pill ghost" onClick={() => setOpen(false)}>
                Close
              </button>
              <button
                className="pill primary"
                onClick={() =>
                  void backend.openInExplorer(phase.result.root).catch(() => undefined)
                }
              >
                Open folder
              </button>
            </div>
          </div>
        )}

        {phase.kind === "error" && (
          <div className="export-progress" role="alert">
            <p className="form-error">Export failed: {phase.message}</p>
            <div className="form-actions">
              <button className="pill ghost" onClick={() => setPhase({ kind: "form" })}>
                Back
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
