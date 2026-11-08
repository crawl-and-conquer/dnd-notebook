import { format, parseISO } from "date-fns";
import { useLayoutEffect, useRef, useState } from "react";
import { create } from "zustand";
import { useNotebook } from "../store/notebook";
import { hasSheet } from "../model/sheet";
import { useImportDialog } from "../components/ImportDialog";
import type { ValueHit } from "./SheetTemplate";

type Edit = { characterId: string; pageId: string; hit: ValueHit };

export const useSheetEdit = create<{ edit: Edit | null; open(e: Edit | null): void }>((set) => ({
  edit: null,
  open: (edit) => set({ edit }),
}));

/** A box to type a sheet value in, laid over the value in the base hand at its size. */
export function SheetValueEditor({ pageId }: { pageId: string }) {
  const edit = useSheetEdit((s) => (s.edit?.pageId === pageId ? s.edit : null));
  if (!edit) return null;
  return <Editor key={edit.hit.path} edit={edit} />;
}

function Editor({ edit }: { edit: Edit }) {
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(edit.hit.text === "—" ? "" : edit.hit.text);
  const done = useRef(false);
  useLayoutEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const close = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    if (save && value !== edit.hit.text) void useNotebook.getState().editSheetValue(edit.characterId, edit.hit.path, value);
    useSheetEdit.getState().open(null);
  };
  const { x, y, w, h, size } = edit.hit;
  return (
    <input
      ref={ref}
      className="sheet-value-editor"
      aria-label="Sheet value"
      value={value}
      style={{ left: x - 4, top: y - 2, width: Math.max(w + 8, 60), height: h + 4, fontSize: size }}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => close(true)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") close(true);
        if (e.key === "Escape") close(false);
      }}
    />
  );
}

/** Top right of a sheet page: where the numbers came from, and the rests. */
export function SheetHeaderControls({ characterId }: { characterId: string }) {
  const ch = useNotebook((s) => s.characters[characterId]);
  if (ch?.status !== "ok") return null;
  const s = useNotebook.getState();
  const sheet = ch.sheet;
  if (!hasSheet(sheet)) {
    return (
      <div className="sheet-controls">
        <button className="sheet-btn primary" onClick={() => useImportDialog.getState().setOpen(true)}>
          Import a character sheet
        </button>
        <span className="sheet-hint">or double-click a blank to type a value</span>
      </div>
    );
  }
  let synced: string | null = null;
  if (sheet.source) {
    try {
      synced = format(parseISO(sheet.source.importedAt), "d MMM");
    } catch {
      synced = null;
    }
  }
  return (
    <div className="sheet-controls">
      {synced && (
        <span className="synced-pill" title={sheet.source?.file}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 12a8 8 0 0114-5.3M20 12a8 8 0 01-14 5.3" />
            <path d="M18 3v4h-4M6 21v-4h4" />
          </svg>
          Synced from D&amp;D Beyond PDF · {synced}
        </span>
      )}
      <button className="sheet-btn" title="Full HP, all slots, uses and hit dice back" onClick={() => void s.longRest(characterId)}>
        Long rest
      </button>
      <button className="sheet-btn" title="Uses that come back on a short rest" onClick={() => void s.shortRest(characterId)}>
        Short rest
      </button>
      {s.canUndoRest(characterId) && (
        <button className="sheet-btn" title="Put the trackers back as they were before the last rest" onClick={() => void s.undoRest(characterId)}>
          Undo rest
        </button>
      )}
    </div>
  );
}
