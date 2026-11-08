import { format, parseISO } from "date-fns";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { PaperStage } from "../canvas/PaperStage";
import { PAGE_HEIGHT, PAGE_WIDTH } from "../model/page";
import { currentSpreadPages, useNotebook, type ShownPage } from "../store/notebook";
import { MAX_ZOOM, MIN_ZOOM, useTools } from "../store/tools";
import { SectionTabs } from "../components/SectionTabs";
import { SheetTemplate } from "../sheet/SheetTemplate";
import { SheetHeaderControls, SheetValueEditor, useSheetEdit } from "../sheet/SheetChrome";

/** The book in page units: a 10 px cover around two pages, tabs sticking out on the right. */
const COVER = 10;
const BOOK_W = PAGE_WIDTH * 2 + COVER * 2;
const BOOK_H = PAGE_HEIGHT + COVER * 2;
const TABS_OUT = 48;
const DESK_MARGIN = 24;
/** At least this much of the book stays on screen while panning. */
const KEEP_VISIBLE = 160;

type ViewT = { x: number; y: number; z: number; fit: boolean };

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

export function BookView({ characterId }: { characterId: string }) {
  const deskRef = useRef<HTMLElement>(null);
  const bookRef = useRef<HTMLDivElement>(null);
  const spreadRef = useRef<HTMLDivElement>(null);
  const view = useRef<ViewT>({ x: 0, y: 0, z: 1, fit: true });
  const settle = useRef<number | undefined>(undefined);
  const [panning, setPanning] = useState(false);
  const panMode = useTools((s) => s.panMode);

  const ch = useNotebook((s) => s.characters[characterId]);
  const cover = useNotebook((s) => s.config.characters.find((c) => c.id === characterId)?.cover);
  const spread = useNotebook(useShallow(currentSpreadPages));
  const pageOffset = useNotebook((s) => s.pageOffset);
  const setPageOffset = useNotebook((s) => s.setPageOffset);

  const fitView = useCallback((): ViewT => {
    const desk = deskRef.current;
    if (!desk) return view.current;
    const w = desk.clientWidth - DESK_MARGIN * 2;
    const h = desk.clientHeight - DESK_MARGIN * 2;
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(w / (BOOK_W + TABS_OUT), h / BOOK_H)));
    return {
      x: (desk.clientWidth - (BOOK_W + TABS_OUT) * z) / 2,
      y: (desk.clientHeight - BOOK_H * z) / 2,
      z,
      fit: true,
    };
  }, []);

  /** Applies the view straight to the DOM (never through React state) so zoom and pan stay smooth. */
  const apply = useCallback((next: ViewT) => {
    const desk = deskRef.current;
    const book = bookRef.current;
    if (!desk || !book) return;
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next.z));
    const bw = (BOOK_W + TABS_OUT) * z;
    const bh = BOOK_H * z;
    const x = Math.min(desk.clientWidth - KEEP_VISIBLE, Math.max(KEEP_VISIBLE - bw, next.x));
    const y = Math.min(desk.clientHeight - KEEP_VISIBLE, Math.max(KEEP_VISIBLE - bh, next.y));
    view.current = { x, y, z, fit: next.fit };
    book.style.transform = `translate(${x}px, ${y}px) scale(${z})`;
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => useTools.getState().setZoom(z), 150);
  }, []);

  const fit = useCallback(() => apply(fitView()), [apply, fitView]);

  // Fit on first show and whenever the window changes size while fitted.
  useLayoutEffect(() => {
    fit();
    const desk = deskRef.current;
    if (!desk) return;
    const ro = new ResizeObserver(() => {
      if (view.current.fit) fit();
      else apply(view.current);
    });
    ro.observe(desk);
    return () => ro.disconnect();
  }, [fit, apply]);

  const zoomAt = useCallback(
    (factor: number, cx: number, cy: number) => {
      const v = view.current;
      const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.z * factor));
      const wx = (cx - v.x) / v.z;
      const wy = (cy - v.y) / v.z;
      apply({ x: cx - wx * z, y: cy - wy * z, z, fit: false });
    },
    [apply],
  );

  // Ctrl+scroll zooms around the pointer; plain scroll pans once the book is bigger than the desk.
  useEffect(() => {
    const desk = deskRef.current;
    if (!desk) return;
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest?.(".no-book-wheel")) return;
      e.preventDefault();
      const r = desk.getBoundingClientRect();
      if (e.ctrlKey) {
        zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
      } else {
        const v = view.current;
        const dx = e.shiftKey ? e.deltaY : e.deltaX;
        const dy = e.shiftKey ? 0 : e.deltaY;
        apply({ ...v, x: v.x - dx, y: v.y - dy, fit: false });
      }
    };
    desk.addEventListener("wheel", onWheel, { passive: false });
    return () => desk.removeEventListener("wheel", onWheel);
  }, [apply, zoomAt]);

  // Keys: Ctrl+0 fits, Ctrl+= and Ctrl+- zoom, Space held pans.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const s = useNotebook.getState();
      if (s.settingsOpen || s.handwritingOpen) return;
      if (e.ctrlKey && e.key === "0") {
        e.preventDefault();
        fit();
        return;
      }
      const desk = deskRef.current;
      if (e.ctrlKey && (e.key === "=" || e.key === "+" || e.key === "-") && desk) {
        e.preventDefault();
        zoomAt(e.key === "-" ? 1 / 1.2 : 1.2, desk.clientWidth / 2, desk.clientHeight / 2);
        return;
      }
      if (e.code === "Space" && !isTyping(e.target)) {
        e.preventDefault();
        if (!e.repeat) useTools.getState().setPanMode(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") useTools.getState().setPanMode(false);
    };
    const blur = () => useTools.getState().setPanMode(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [fit, zoomAt]);

  // Middle-drag or Space-drag pans; caught before the page canvases see the press.
  const onPointerDownCapture = (e: React.PointerEvent) => {
    if (e.button !== 1 && !(e.button === 0 && useTools.getState().panMode)) return;
    e.preventDefault();
    e.stopPropagation();
    const start = { x: e.clientX, y: e.clientY, vx: view.current.x, vy: view.current.y };
    setPanning(true);
    const move = (ev: PointerEvent) =>
      apply({ ...view.current, x: start.vx + ev.clientX - start.x, y: start.vy + ev.clientY - start.y, fit: false });
    const up = () => {
      setPanning(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  // A short page turn when the spread changes, skipped when Windows asks for less motion.
  const lastSpread = useRef<{ section: string; index: number } | null>(null);
  const sectionId = useNotebook((s) => ("characterId" in s.view ? s.view.sectionId : ""));
  const spreadIndex = spread?.spreadIndex ?? 0;
  useEffect(() => {
    const prev = lastSpread.current;
    lastSpread.current = { section: sectionId, index: spreadIndex };
    const el = spreadRef.current;
    if (!prev || !el || reducedMotion()) return;
    if (prev.section === sectionId && prev.index === spreadIndex) return;
    const dir = prev.section !== sectionId ? 0 : spreadIndex > prev.index ? 1 : -1;
    el.animate(
      [
        { opacity: 0.35, transform: `translateX(${dir * 14}px)` },
        { opacity: 1, transform: "translateX(0)" },
      ],
      { duration: 220, easing: "cubic-bezier(.2,.7,.3,1)" },
    );
  }, [sectionId, spreadIndex]);

  if (ch?.status !== "ok" || !spread) return <section className="desk" ref={deskRef} />;
  const sectionKind = ch.character.sections.find((s) => s.id === sectionId)?.kind;

  return (
    <section
      className={`desk${panning ? " panning" : panMode ? " pan-ready" : ""}`}
      ref={deskRef}
      onPointerDownCapture={onPointerDownCapture}
      aria-label="Notebook"
    >
      <div className="book" ref={bookRef} style={{ background: cover }}>
        <div className="spread" ref={spreadRef}>
          {[spread.left, spread.right].map((p, i) => (
            <PageView
              key={i}
              side={i === 0 ? "l" : "r"}
              shown={p}
              other={i === 0 ? spread.right : spread.left}
              notebookPath={ch.notebookPath}
              characterId={characterId}
              sectionId={sectionId}
              sessions={sectionKind === "sessions"}
              active={pageOffset === i}
              onActivate={() => setPageOffset(i as 0 | 1)}
            />
          ))}
        </div>
        <SectionTabs characterId={characterId} />
      </div>
    </section>
  );
}

function PageView({
  side,
  shown,
  other,
  notebookPath,
  characterId,
  sectionId,
  sessions,
  active,
  onActivate,
}: {
  side: "l" | "r";
  shown: ShownPage;
  other: ShownPage;
  notebookPath: string;
  characterId: string;
  sectionId: string;
  sessions: boolean;
  active: boolean;
  onActivate(): void;
}) {
  const ch = useNotebook((s) => s.characters[characterId]);
  const name = useNotebook((s) => s.config.characters.find((c) => c.id === characterId)?.name ?? "");
  const sheetType = shown.page.sheetPageType;
  const pageId = shown.page.id;
  const underlay =
    sheetType && ch?.status === "ok" ? (
      <SheetTemplate
        type={sheetType}
        index={shown.page.sheetIndex ?? 0}
        sheet={ch.sheet}
        trackers={ch.trackers}
        characterName={name}
        onEdit={(hit) => {
          if (shown.readOnly) return;
          useSheetEdit.getState().open({ characterId, pageId, hit });
        }}
        onBubble={(act) => void useNotebook.getState().toggleSheetBubble(characterId, act)}
      />
    ) : undefined;
  return (
    <article
      className={`page ${side}${active ? " active" : ""}${shown.virtual ? " blank" : ""}`}
      aria-label={`${side === "l" ? "Left" : "Right"} page: ${shown.page.title}`}
    >
      <PaperStage
        page={shown.page}
        readOnly={shown.readOnly}
        notebookPath={notebookPath}
        active={active}
        onActivate={onActivate}
        underlay={underlay}
      />
      {!sheetType && (
        <PageHeader
          side={side}
          shown={shown}
          other={other}
          characterId={characterId}
          sectionId={sectionId}
          sessions={sessions}
        />
      )}
      {sheetType && <SheetValueEditor pageId={pageId} />}
      {sheetType && side === "r" && <SheetHeaderControls characterId={characterId} />}
    </article>
  );
}

const ukDate = (iso: string) => {
  try {
    return format(parseISO(iso), "EEE d MMM yyyy");
  } catch {
    return iso;
  }
};

/** Page title and meta on the left page; continuation label and page number on the right. */
function PageHeader({
  side,
  shown,
  other,
  characterId,
  sectionId,
  sessions,
}: {
  side: "l" | "r";
  shown: ShownPage;
  other: ShownPage;
  characterId: string;
  sectionId: string;
  sessions: boolean;
}) {
  const update = useNotebook((s) => s.updatePageIn);
  const sheet = useNotebook((s) => {
    const c = s.characters[characterId];
    return c?.status === "ok" ? c.sheet : null;
  });
  const [editingDate, setEditingDate] = useState(false);
  const page = shown.page;
  const ro = shown.readOnly;
  const setTitle = (title: string) => update(characterId, sectionId, page.id, (p) => ({ ...p, title }));

  if (side === "r") {
    const label = page.title || `${other.page.title}, cont.`;
    return (
      <div className="phead right">
        <input
          className="pmeta-input"
          aria-label="Continuation label"
          value={label}
          readOnly={ro}
          spellCheck
          onChange={(e) => setTitle(e.target.value)}
        />
        <span className="pmeta">p. {shown.index + 1}</span>
      </div>
    );
  }

  const session = page.session;
  const pill =
    sessions && sheet && (sheet.identity.classLevel || sheet.combat.maxHp !== null)
      ? [sheet.identity.classLevel, sheet.combat.maxHp !== null && `${sheet.combat.maxHp} HP`].filter(Boolean).join(" · ")
      : null;

  return (
    <div className="phead">
      <div className="phead-main">
        <input
          className="ptitle-input"
          aria-label="Page title"
          value={page.title}
          readOnly={ro}
          spellCheck
          onChange={(e) => setTitle(e.target.value)}
          onBlur={(e) => {
            if (!e.target.value.trim()) setTitle(sessions && session ? `Session ${session.number}` : "Untitled page");
          }}
        />
        <div className="pmeta">
          {session ? (
            <>
              {editingDate && !ro ? (
                <input
                  type="date"
                  className="pmeta-date"
                  aria-label="Session date"
                  autoFocus
                  value={session.date}
                  onChange={(e) =>
                    e.target.value &&
                    update(characterId, sectionId, page.id, (p) => ({
                      ...p,
                      session: { ...session, date: e.target.value },
                    }))
                  }
                  onBlur={() => setEditingDate(false)}
                />
              ) : (
                <button
                  className="pmeta-button"
                  title="Change the date"
                  disabled={ro}
                  onClick={() => setEditingDate(true)}
                >
                  {ukDate(session.date)}
                </button>
              )}
              <span aria-hidden="true"> · </span>
              <input
                className="pmeta-input place"
                aria-label="Place"
                placeholder="Where?"
                value={session.place}
                readOnly={ro}
                onChange={(e) =>
                  update(characterId, sectionId, page.id, (p) => ({
                    ...p,
                    session: { ...session, place: e.target.value },
                  }))
                }
              />
            </>
          ) : (
            <span>{shown.virtual ? "Write anywhere to start this page" : `Started ${ukDate(page.createdAt)}`}</span>
          )}
        </div>
      </div>
      {pill && <span className="pill-ink">{pill}</span>}
    </div>
  );
}
