import { create } from "zustand";
import { useEffect, useMemo, useRef, useState } from "react";
import { parseDdbFields, type ParsedSheet } from "../import/ddb/fields";
import { peopleNames, routeDetails } from "../import/ddb/route";
import { applyImport, mergeSheet, type ImportParts } from "../import/applyImport";
import { readPdfFields, sha256Hex } from "../import/pdfFields";
import { getPath, hasSheet } from "../model/sheet";
import { drawnCount, GLYPHS } from "../model/hand";
import { spellListPageCount } from "../sheet/layout";
import { useNotebook } from "../store/notebook";
import { CloseIcon } from "./Icons";

export const useImportDialog = create<{
  open: boolean;
  file: File | null;
  setOpen(o: boolean): void;
  openWith(file: File): void;
}>((set) => ({
  open: false,
  file: null,
  setOpen: (open) => set({ open, file: null }),
  openWith: (file) => set({ open: true, file }),
}));

const TAB = {
  sheet: "#e0cf9e",
  backstory: "#d8c29a",
  likes: "#d9b7a2",
  dislikes: "#c9b6a8",
  wants: "#c6c7a0",
  notes: "#b9c3ae",
};

type Loaded = { name: string; data: ArrayBuffer; sha256: string; pages: number; parsed: ParsedSheet };

export function ImportDialog() {
  const open = useImportDialog((s) => s.open);
  const file = useImportDialog((s) => s.file);
  const view = useNotebook((s) => s.view);
  if (!open || !("characterId" in view)) return null;
  return <Dialog characterId={view.characterId} initialFile={file} onClose={() => useImportDialog.getState().setOpen(false)} />;
}

const quote = (s: string | null | undefined, n = 60) => {
  if (!s) return "";
  const one = s.replace(/\s+/g, " ").trim();
  return `"${one.length > n ? `${one.slice(0, n).trimEnd()}...` : one}"`;
};

const pageRange = (from: number, count: number) => (count <= 1 ? `page ${from}` : `pages ${from}–${from + count - 1}`);

function Dialog({ characterId, initialFile, onClose }: { characterId: string; initialFile: File | null; onClose(): void }) {
  const ch = useNotebook((s) => s.characters[characterId]);
  const name = useNotebook((s) => s.config.characters.find((c) => c.id === characterId)?.name ?? "");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [phase, setPhase] = useState<"choose" | "reading" | "review" | "working" | "done">("choose");
  const [error, setError] = useState<string | null>(null);
  const [parts, setParts] = useState<ImportParts>({
    core: true,
    kit: true,
    spells: true,
    backstory: true,
    likes: true,
    dislikes: true,
    wants: true,
    notes: true,
  });
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [hand, setHand] = useState(true);
  const [mode, setMode] = useState<"update" | "replace">("update");
  const [keep, setKeep] = useState<Set<string>>(new Set());
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const ok = ch?.status === "ok" ? ch : null;
  const oldSheet = ok?.sheet;
  const [reimport] = useState(() => !!oldSheet && hasSheet(oldSheet));
  const overrides = oldSheet?.overrides ?? [];

  useEffect(() => setKeep(new Set(overrides)), [overrides.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  const read = async (f: File) => {
    setError(null);
    if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") {
      setError(`${f.name} is not a PDF. Export the character sheet from D&D Beyond as a PDF and choose that.`);
      return;
    }
    setPhase("reading");
    try {
      const data = await f.arrayBuffer();
      const { fields, pages } = await readPdfFields(data);
      const parsed = parseDdbFields(fields);
      if (!Object.values(parsed.found).some(Boolean)) {
        setError("This PDF does not look like a D&D Beyond character sheet: none of its fields were found.");
        setPhase("choose");
        return;
      }
      setLoaded({ name: f.name, data, sha256: await sha256Hex(data), pages, parsed });
      setTyped({});
      setParts((p) => ({ ...p, core: parsed.found.core, kit: parsed.found.features, spells: parsed.found.spells }));
      setPhase("review");
    } catch (e) {
      setError(`Could not read the PDF: ${String(e)}`);
      setPhase("choose");
    }
  };

  useEffect(() => {
    if (initialFile) void read(initialFile);
  }, [initialFile]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase !== "working") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [phase, onClose]);

  const sheet = loaded?.parsed.sheet;
  const routed = useMemo(() => (sheet ? routeDetails(sheet) : null), [sheet]);
  const spellPages = sheet ? spellListPageCount(sheet) : 1;
  const sc = sheet?.spellcasting;
  const maxLevel = sc ? Math.max(0, ...sc.spells.map((s) => s.level)) : 0;
  const ord = ["cantrips", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];

  type Row = { key: keyof ImportParts; what: string; quote?: string; dest: string; colour: string; show: boolean };
  const rows: Row[] = sheet
    ? ([
        { key: "core", what: "Abilities, saves, skills, HP, attacks", dest: "Sheet · pages 1–2", colour: TAB.sheet, show: loaded!.parsed.found.core },
        {
          key: "kit",
          what: "Features, traits, feats, slots, coin and pack",
          dest: "Sheet · pages 3–4",
          colour: TAB.sheet,
          show: loaded!.parsed.found.features,
        },
        {
          key: "spells",
          what: sc?.spells.length ? `Full spell list, cantrips to ${ord[maxLevel]} level` : "Spell list",
          dest: `Sheet · ${pageRange(5, spellPages)}`,
          colour: TAB.sheet,
          show: loaded!.parsed.found.spells,
        },
        {
          key: "backstory",
          what: "Character backstory and appearance",
          quote: quote(sheet.details.backstory),
          dest: "Backstory",
          colour: TAB.backstory,
          show: !!routed?.backstory || !!routed?.glance.length,
        },
        { key: "likes", what: "Likes", quote: quote(routed?.likes[0]), dest: "Likes", colour: TAB.likes, show: !!routed?.likes.length },
        { key: "dislikes", what: "Dislikes", quote: quote(routed?.dislikes[0]), dest: "Dislikes", colour: TAB.dislikes, show: !!routed?.dislikes.length },
        { key: "wants", what: "Wants, ideals and bonds", quote: quote(routed?.wants[0]), dest: "Wants", colour: TAB.wants, show: !!routed?.wants.length },
        {
          key: "notes",
          what: "Allies, friend and foe",
          quote: routed ? peopleNames(routed.people).join(", ") || quote(routed.notes[0]) : "",
          dest: "Notes",
          colour: TAB.notes,
          show: !!routed && (routed.people.length > 0 || routed.notes.length > 0),
        },
      ] as Row[]).filter((r) => r.show)
    : [];

  const sheetRows = (["core", "kit", "spells"] as const).filter((k) => rows.some((r) => r.key === k) && parts[k]).length;
  const tabRows = rows.filter((r) => !["core", "kit", "spells"].includes(r.key) && parts[r.key]).length;
  const replacing = reimport ? overrides.filter((p) => !keep.has(p)) : [];
  const footer = !sheet
    ? ""
    : reimport && mode === "update"
      ? `Updates the sheet numbers${tabRows ? ` and adds anything new to ${tabRows} tab${tabRows > 1 ? "s" : ""}` : ""}. Your pen marks and trackers stay.`
      : reimport && mode === "replace"
        ? "Replaces the sheet pages: anything you drew on them goes to the Recycle Bin. Other tabs only gain text."
        : `${sheetRows ? `Fills ${4 + spellPages} sheet pages` : "Leaves the sheet as it is"} and ${tabRows ? `writes in ${tabRows} tab${tabRows === 1 ? "" : "s"}` : "no other tabs"}. Nothing you've written is touched.`;

  const go = async () => {
    if (!loaded || !ok) return;
    if (reimport && mode === "replace" && !confirmReplace) {
      setConfirmReplace(true);
      return;
    }
    setPhase("working");
    setError(null);
    try {
      const r = await applyImport({
        characterId,
        file: { name: loaded.name, data: loaded.data, sha256: loaded.sha256 },
        sheet: loaded.parsed.sheet,
        parts,
        typed,
        keepOverrides: [...keep],
        hand,
        mode,
      });
      setResult(
        `Done. ${r.sheetPages ? `${r.sheetPages} sheet page${r.sheetPages > 1 ? "s" : ""} added` : "Sheet updated"}${
          r.tabsFilled.length ? `; wrote in ${r.tabsFilled.join(", ")}` : ""
        }.`,
      );
      setPhase("done");
    } catch (e) {
      setError(String(e));
      setPhase("review");
    }
  };

  const glyphsDrawn = ok ? drawnCount(ok.glyphs) : 0;
  const preview = sheet && oldSheet ? mergeSheet(oldSheet, sheet, { parts, typed, keepOverrides: [...keep], mode }) : null;

  return (
    <>
      <div className="scrim" onClick={() => phase !== "working" && onClose()} />
      <section
        className="import-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="imp-title"
        onDragOver={(e) => {
          if ([...e.dataTransfer.types].includes("Files")) e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files[0];
          if (f) void read(f);
        }}
      >
        <div className="mh">
          <div>
            <h1 id="imp-title">{reimport ? "Re-import the character sheet" : "Import a character sheet"}</h1>
            <p>
              Drop in a PDF from D&amp;D Beyond. The numbers become notebook pages you can write over, and the backstory bits
              go to the right tabs.
            </p>
          </div>
          <button className="x" aria-label="Close" onClick={onClose} disabled={phase === "working"}>
            <CloseIcon size={18} />
          </button>
        </div>

        {phase === "choose" || phase === "reading" ? (
          <div className="mb-empty">
            <button
              className="drop big"
              onClick={() => fileRef.current?.click()}
              disabled={phase === "reading"}
              aria-describedby={error ? "imp-error" : undefined}
            >
              {phase === "reading" ? (
                "Reading the PDF…"
              ) : (
                <>
                  <span className="pdf">PDF</span>
                  <span>
                    Drop the D&amp;D Beyond PDF here, or <u>choose a file</u>
                  </span>
                  <small>It's read on this computer; nothing is uploaded.</small>
                </>
              )}
            </button>
            {error && (
              <p className="form-error" id="imp-error" role="alert">
                {error}
              </p>
            )}
          </div>
        ) : phase === "done" ? (
          <div className="mb-empty">
            <p className="done-msg" role="status">
              {result}
            </p>
          </div>
        ) : (
          <div className="mb">
            <div className="left">
              <div>
                <p className="k">File</p>
                <div className="file">
                  <span className="pdf">PDF</span>
                  <div>
                    <div className="fn">{loaded!.name}</div>
                    <div className="fs">
                      {loaded!.pages} page{loaded!.pages === 1 ? "" : "s"} · D&amp;D Beyond layout
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <p className="k">Found</p>
                <div className="found">
                  <div className="nm">{sheet!.identity.name ?? name}</div>
                  <p>{[sheet!.identity.classLevel, sheet!.features?.find((f) => f.group === "Druid" && /Circle|Subclass/.test(f.name))?.text.match(/\|\s*([^\n•]+)/)?.[1]?.trim()].filter(Boolean).join(" · ")}</p>
                  <p>{[sheet!.identity.species, sheet!.identity.background].filter(Boolean).join(" · ")}</p>
                  <p>
                    {[
                      sheet!.combat.maxHp !== null && `${sheet!.combat.maxHp} HP`,
                      sheet!.combat.ac !== null && `AC ${sheet!.combat.ac}`,
                      sc?.saveDc != null && `spell DC ${sc.saveDc}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </div>
              {loaded!.parsed.unread.length > 0 && (
                <div>
                  <p className="k">Couldn't read</p>
                  <div className="unread">
                    {loaded!.parsed.unread.map((u) => (
                      <label key={u.path}>
                        <span>{u.label}</span>
                        <input
                          type="text"
                          placeholder="Type it in"
                          value={typed[u.path] ?? ""}
                          onChange={(e) => setTyped((t) => ({ ...t, [u.path]: e.target.value }))}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <button className="drop" onClick={() => fileRef.current?.click()}>
                Wrong sheet? Drop another PDF here, or <u>choose a file</u>
              </button>
            </div>

            <div className="right">
              <p className="k">Where it goes</p>
              {rows.map((r) => (
                <div className="row" key={r.key}>
                  <input
                    type="checkbox"
                    id={`imp-${r.key}`}
                    checked={parts[r.key]}
                    onChange={(e) => setParts((p) => ({ ...p, [r.key]: e.target.checked }))}
                  />
                  <label htmlFor={`imp-${r.key}`}>
                    <div className="what">{r.what}</div>
                    {r.quote && <div className="quote">{r.quote}</div>}
                  </label>
                  <span className="dest" style={{ background: r.colour }}>
                    {r.dest}
                  </span>
                </div>
              ))}

              {reimport && mode === "update" && overrides.length > 0 && (
                <div className="overrides">
                  <p className="k">Values you typed by hand</p>
                  <p className="hint">Ticked ones stay as you typed them; unticked ones take the new sheet's value.</p>
                  {overrides.map((p) => (
                    <label key={p} className="ov">
                      <input
                        type="checkbox"
                        checked={keep.has(p)}
                        onChange={(e) =>
                          setKeep((k) => {
                            const n = new Set(k);
                            if (e.target.checked) n.add(p);
                            else n.delete(p);
                            return n;
                          })
                        }
                      />
                      <span className="ov-path">{p.replace(/\./g, " › ")}</span>
                      <span className="ov-vals">
                        keep <b>{String(getPath(oldSheet, p) ?? "—")}</b> instead of <b>{String(getPath(sheet, p) ?? "—")}</b>
                      </span>
                    </label>
                  ))}
                </div>
              )}

              <div className="opts">
                <label className="opt">
                  <input type="checkbox" role="switch" checked={hand} onChange={(e) => setHand(e.target.checked)} />
                  <span className="switch" aria-hidden="true" />
                  <span>Write it in {name}'s hand</span>
                  <span className="opt-note">
                    {glyphsDrawn} of {GLYPHS.length} letters drawn, the rest fall back to the base hand
                  </span>
                </label>
                {reimport && (
                  <div className="opt">
                    <span>Re-import</span>
                    <div className="seg" role="group" aria-label="Re-import behaviour">
                      <button className={mode === "update" ? "on" : ""} aria-pressed={mode === "update"} onClick={() => setMode("update")}>
                        Update numbers, keep my marks
                      </button>
                      <button
                        className={mode === "replace" ? "on" : ""}
                        aria-pressed={mode === "replace"}
                        onClick={() => {
                          setMode("replace");
                          setConfirmReplace(false);
                        }}
                      >
                        Replace pages
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="mf">
          <span className="note">
            {phase === "review" && confirmReplace
              ? "Replace the sheet pages? Marks drawn on them go to the Recycle Bin. Press Replace pages to go ahead."
              : phase === "review"
                ? footer
                : ""}
            {phase === "review" && replacing.length > 0 && mode === "update"
              ? ` ${replacing.length} typed value${replacing.length > 1 ? "s" : ""} will be replaced.`
              : ""}
          </span>
          {error && phase === "review" && (
            <span className="form-error" role="alert">
              {error}
            </span>
          )}
          {phase === "done" ? (
            <button className="btn go" onClick={onClose}>
              Close
            </button>
          ) : (
            <>
              <button className="btn ghost" onClick={onClose} disabled={phase === "working"}>
                Cancel
              </button>
              <button
                className="btn go"
                disabled={phase !== "review" || !preview || !Object.values(parts).some(Boolean)}
                onClick={() => void go()}
              >
                {phase === "working" ? "Filling…" : confirmReplace ? "Replace pages" : reimport ? "Update the notebook" : "Fill the notebook"}
              </button>
            </>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void read(f);
          }}
        />
      </section>
    </>
  );
}
