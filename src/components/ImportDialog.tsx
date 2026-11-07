import { create } from "zustand";
import { useEffect, useRef, useState } from "react";
import { ocrPdf } from "../import/pdfOcr";
import { parseDdbSheet } from "../import/ddb/parser";
import { emptySheetData, type SheetData } from "../model/sheet";
import { useNotebook } from "../store/notebook";
import { CloseIcon } from "./Icons";

export const useImportDialog = create<{ open: boolean; setOpen(o: boolean): void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

type Phase = "idle" | "running" | "done" | "importing" | "error";

const DESTINATIONS = [
  {
    label: "Sheet — stats and combat",
    quote: "“Abilities, saves, HP, AC, attacks…”",
    sections: ["Sheet pages 1–2"],
  },
  {
    label: "Sheet — features and equipment",
    quote: "“Features, traits, spellcasting, coins…”",
    sections: ["Sheet pages 3–4"],
  },
  {
    label: "Sheet — spell list",
    quote: "“Cantrips, prepared spells, spell slots…”",
    sections: ["Sheet pages 5+"],
  },
  {
    label: "Backstory tab",
    quote: "“Backstory text, appearance, alignment…”",
    sections: ["Backstory"],
  },
  {
    label: "Likes tab",
    quote: "“Loves nature, enjoys cooking…”",
    sections: ["Likes"],
  },
  {
    label: "Dislikes tab",
    quote: "“Hates people nosing on his heartseed…”",
    sections: ["Dislikes"],
  },
  {
    label: "Notes tab",
    quote: "“Allies, organisations, flaws, notes…”",
    sections: ["Notes"],
  },
] as const;

function fieldValue(
  value: string | number | undefined | null,
  defaultValue: string | number,
): { text: string; found: boolean } {
  if (value === undefined || value === null) return { text: "Couldn't read", found: false };
  if (value === defaultValue) return { text: "Couldn't read", found: false };
  if (typeof value === "string" && value.trim() === "") return { text: "Couldn't read", found: false };
  return { text: String(value), found: true };
}

function ReadField({ label, value }: { label: string; value: ReturnType<typeof fieldValue> }) {
  return (
    <div className="import-field">
      <span className="import-field-label">{label}</span>
      <span className={`import-field-value${value.found ? "" : " not-found"}`}>
        {value.found ? value.text : "Couldn't read"}
      </span>
    </div>
  );
}

export function ImportDialog() {
  const open = useImportDialog((s) => s.open);
  const setOpen = useImportDialog((s) => s.setOpen);

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
  const [phase, setPhase] = useState<Phase>("idle");
  const [progressMsg, setProgressMsg] = useState("");
  const [sheet, setSheet] = useState<Partial<SheetData> | null>(null);
  const [mode, setMode] = useState<"update" | "replace">("update");
  const [destinations, setDestinations] = useState<boolean[]>(DESTINATIONS.map(() => true));
  const [errorMsg, setErrorMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const characterId = useNotebook((s) => ("characterId" in s.view ? s.view.characterId : null));
  const setSheetData = useNotebook((s) => s.setSheetData);
  const defaults = emptySheetData();

  async function runOcr(file: File) {
    setPhase("running");
    setProgressMsg("Loading libraries…");
    try {
      setProgressMsg("Loading Tesseract language data…");
      const words = await ocrPdf(file, (page, total) => {
        setProgressMsg(`Reading page ${page} of ${total}…`);
      });
      setProgressMsg("Parsing sheet…");
      const parsed = parseDdbSheet(words);
      setSheet(parsed);
      setPhase("done");
    } catch (e) {
      setErrorMsg(String(e));
      setPhase("error");
    }
  }

  async function doImport() {
    if (!sheet || !characterId) return;
    setPhase("importing");
    try {
      // Merge the parsed sheet with the existing one (update mode) or replace it
      const merged: SheetData =
        mode === "update"
          ? { ...defaults, ...sheet, schemaVersion: 1 }
          : { ...defaults, ...sheet, schemaVersion: 1 };
      await setSheetData(characterId, merged);
      onClose();
    } catch (e) {
      setErrorMsg(String(e));
      setPhase("error");
    }
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="import-dialog" role="dialog" aria-modal="true" aria-labelledby="import-title">
        <header>
          <h2 id="import-title">Import D&amp;D Beyond sheet</h2>
          <button className="icon-button" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>

        {phase === "idle" && (
          <div className="import-body">
            <p className="hint">
              Select the PDF exported from D&amp;D Beyond. Values are read by their position on the
              page; anything that cannot be read will show &ldquo;Couldn&rsquo;t read&rdquo; so you can type it in.
            </p>
            <label className="import-file-pick">
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,application/pdf"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void runOcr(f);
                }}
              />
              Choose PDF
            </label>
          </div>
        )}

        {phase === "running" && (
          <div className="import-body import-progress">
            <div className="import-spinner" aria-hidden="true" />
            <p>{progressMsg}</p>
            <p className="hint">This takes 2–3 minutes while the page images are processed.</p>
          </div>
        )}

        {phase === "done" && sheet && (
          <div className="import-body import-results">
            <section>
              <h3>What was found</h3>
              <div className="import-fields-grid">
                <ReadField label="Name" value={fieldValue(sheet.charName, defaults.charName)} />
                <ReadField label="Class" value={fieldValue(sheet.charClass, defaults.charClass)} />
                <ReadField label="Level" value={fieldValue(sheet.level, defaults.level)} />
                <ReadField label="Species" value={fieldValue(sheet.race, defaults.race)} />
                <ReadField label="Background" value={fieldValue(sheet.background, defaults.background)} />
                <ReadField label="Player" value={fieldValue(sheet.player, defaults.player)} />
              </div>
              <div className="import-fields-grid">
                <ReadField label="STR" value={fieldValue(sheet.abilities?.str, defaults.abilities.str)} />
                <ReadField label="DEX" value={fieldValue(sheet.abilities?.dex, defaults.abilities.dex)} />
                <ReadField label="CON" value={fieldValue(sheet.abilities?.con, defaults.abilities.con)} />
                <ReadField label="INT" value={fieldValue(sheet.abilities?.int, defaults.abilities.int)} />
                <ReadField label="WIS" value={fieldValue(sheet.abilities?.wis, defaults.abilities.wis)} />
                <ReadField label="CHA" value={fieldValue(sheet.abilities?.cha, defaults.abilities.cha)} />
              </div>
              <div className="import-fields-grid">
                <ReadField label="AC" value={fieldValue(sheet.ac, defaults.ac)} />
                <ReadField label="Speed" value={fieldValue(sheet.speed, defaults.speed)} />
                <ReadField label="Max HP" value={fieldValue(sheet.hp?.max, defaults.hp.max)} />
                <ReadField label="Hit dice" value={fieldValue(sheet.hitDice, defaults.hitDice)} />
                <ReadField label="Prof. bonus" value={fieldValue(sheet.proficiencyBonus, defaults.proficiencyBonus)} />
              </div>
            </section>

            <section>
              <h3>Where things go</h3>
              <div className="import-destinations">
                {DESTINATIONS.map((dest, i) => (
                  <label key={dest.label} className="import-dest-row">
                    <input
                      type="checkbox"
                      checked={destinations[i]}
                      onChange={(e) => {
                        const next = [...destinations];
                        next[i] = e.target.checked;
                        setDestinations(next);
                      }}
                    />
                    <span>
                      <span className="import-dest-label">{dest.label}</span>
                      <span className="import-dest-quote">{dest.quote}</span>
                    </span>
                  </label>
                ))}
              </div>
            </section>

            <section className="import-options">
              <h3>Options</h3>
              <label className="import-opt-row">
                <input
                  type="radio"
                  name="reimport-mode"
                  value="update"
                  checked={mode === "update"}
                  onChange={() => setMode("update")}
                />
                Update numbers, keep my marks
              </label>
              <label className="import-opt-row">
                <input
                  type="radio"
                  name="reimport-mode"
                  value="replace"
                  checked={mode === "replace"}
                  onChange={() => setMode("replace")}
                />
                Replace pages
              </label>
            </section>

            <footer className="form-actions">
              <p className="import-footer-note hint">
                {mode === "update"
                  ? "Updates sheet numbers. Nothing you have written is touched."
                  : "Replaces all sheet pages. Your drawn notes will be removed."}
              </p>
              <button className="pill ghost" onClick={onClose}>
                Cancel
              </button>
              <button
                className="pill primary"
                disabled={!characterId}
                onClick={() => void doImport()}
              >
                Import
              </button>
            </footer>
          </div>
        )}

        {phase === "importing" && (
          <div className="import-body import-progress">
            <div className="import-spinner" aria-hidden="true" />
            <p>Saving…</p>
          </div>
        )}

        {phase === "error" && (
          <div className="import-body">
            <p className="form-error">{errorMsg}</p>
            <div className="form-actions">
              <button className="pill ghost" onClick={onClose}>
                Close
              </button>
              <button className="pill" onClick={() => setPhase("idle")}>
                Try again
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
