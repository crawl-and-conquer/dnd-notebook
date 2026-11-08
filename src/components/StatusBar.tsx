import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { currentSpreadPages, useNotebook, type SaveState } from "../store/notebook";
import { useTools } from "../store/tools";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "./Icons";
import { drawnCount } from "../model/hand";
import { PageList, PAGE_LIST_TOGGLE } from "./PageList";

function saveLabel(s: SaveState, now: number): string {
  switch (s.kind) {
    case "saving":
      return "Saving";
    case "unsaved":
      return "Unsaved changes";
    case "read-only":
      return "Read-only";
    case "error":
      return "Not saved";
    case "saved": {
      if (!s.at) return "Saved";
      const secs = Math.round((now - s.at.getTime()) / 1000);
      if (secs < 10) return "Saved";
      if (secs < 60) return `Saved ${secs} seconds ago`;
      const mins = Math.round(secs / 60);
      return mins === 1 ? "Saved 1 minute ago" : `Saved ${mins} minutes ago`;
    }
  }
}

/** Where the previous and next session start, for "Session 3" / "Session 5" page turning. */
function sessionJumps(
  starts: { index: number; number: number }[],
  leftIndex: number,
): { prev: { index: number; number: number } | null; next: { index: number; number: number } | null } {
  const before = starts.filter((s) => s.index < leftIndex);
  const after = starts.filter((s) => s.index > leftIndex + 1);
  return { prev: before.at(-1) ?? null, next: after[0] ?? null };
}

export function StatusBar() {
  const spread = useNotebook(useShallow(currentSpreadPages));
  const view = useNotebook((s) => s.view);
  const save = useNotebook((s) => s.save);
  const goToSpread = useNotebook((s) => s.goToSpread);
  const pageListOpen = useNotebook((s) => s.pageListOpen);
  const setPageListOpen = useNotebook((s) => s.setPageListOpen);
  const setHandwritingOpen = useNotebook((s) => s.setHandwritingOpen);
  const newSession = useNotebook((s) => s.newSession);
  const newSpread = useNotebook((s) => s.newSpread);
  const zoom = useTools((s) => s.zoom);
  const characterId = "characterId" in view ? view.characterId : null;
  const sectionId = "characterId" in view ? view.sectionId : null;
  const ch = useNotebook((s) => (characterId ? s.characters[characterId] : undefined));
  const name = useNotebook((s) => s.config.characters.find((c) => c.id === characterId)?.name);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);

  const ok = ch?.status === "ok" ? ch : null;
  const pages = ok && sectionId ? (ok.sectionPages[sectionId] ?? []) : [];
  const section = ok?.character.sections.find((s) => s.id === sectionId);
  const isSessions = section?.kind === "sessions";
  const handDrawn = ok ? drawnCount(ok.glyphs) : 0;

  let pager = null;
  if (spread) {
    const left = spread.spreadIndex * 2;
    const total = Math.max(pages.length, left + 1);
    const label =
      pages.length === 0
        ? "Page 1 of 1"
        : left + 2 <= total
          ? `Pages ${left + 1}–${left + 2} of ${Math.max(total, left + 2)}`
          : `Page ${left + 1} of ${total}`;
    const starts = pages.flatMap((p, index) =>
      p.page.session ? [{ index, number: p.page.session.number }] : [],
    );
    const jumps = isSessions && starts.length > 0 ? sessionJumps(starts, left) : null;
    const prevTarget = jumps?.prev ? Math.floor(jumps.prev.index / 2) : spread.spreadIndex - 1;
    const nextTarget = jumps?.next ? Math.floor(jumps.next.index / 2) : spread.spreadIndex + 1;
    const lastSpread = Math.max(0, Math.ceil(pages.length / 2) - 1);
    pager = (
      <div className="nav">
        <button
          className="sb"
          disabled={prevTarget < 0 || spread.spreadIndex === 0}
          onClick={() => goToSpread(prevTarget)}
          title="Previous spread (Page Up)"
        >
          <ChevronLeftIcon size={14} />
          {jumps?.prev ? `Session ${jumps.prev.number}` : "Previous"}
        </button>
        <button
          className="sb-count"
          {...{ [PAGE_LIST_TOGGLE]: "" }}
          aria-haspopup="dialog"
          aria-expanded={pageListOpen}
          title="All pages in this section (Ctrl+P)"
          onClick={() => setPageListOpen(!pageListOpen)}
        >
          {label}
        </button>
        <button
          className="sb"
          disabled={spread.spreadIndex >= lastSpread}
          onClick={() => goToSpread(Math.min(nextTarget, lastSpread))}
          title="Next spread (Page Down)"
        >
          {jumps?.next ? `Session ${jumps.next.number}` : "Next"}
          <ChevronRightIcon size={14} />
        </button>
        {pages.length > 0 && section?.kind !== "sheet" && (
          <button
            className="sb"
            title={isSessions ? "Start the next session on a new spread" : "Add a spread at the end of this section"}
            onClick={() => void (isSessions ? newSession() : newSpread())}
          >
            <PlusIcon size={14} />
            {isSessions ? "New session" : "New spread"}
          </button>
        )}
      </div>
    );
  }

  return (
    <footer className="status">
      {pager ?? <div className="nav" />}
      <div className="nav">
        {ok && name && (
          <>
            <button
              className="sb-link"
              title={`Open ${name}'s handwriting builder`}
              onClick={() => setHandwritingOpen(true)}
            >
              {handDrawn > 0 ? `Writing in ${name}'s hand` : "Writing in the base hand"}
            </button>
            <span aria-hidden="true">·</span>
          </>
        )}
        {spread && (
          <>
            <span
              className={`save-state ${save.kind}`}
              title={save.kind === "error" ? save.message : save.kind === "read-only" ? save.reason : undefined}
            >
              <span className="dot" aria-hidden="true" />
              {saveLabel(save, now)}
            </span>
            <span aria-hidden="true">·</span>
          </>
        )}
        <span title="Ctrl+scroll to zoom, Ctrl+0 to fit">{Math.round(zoom * 100)}%</span>
      </div>
      <PageList />
    </footer>
  );
}
