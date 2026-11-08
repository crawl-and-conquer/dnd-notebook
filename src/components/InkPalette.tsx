import { useEffect, useRef, useState } from "react";
import { HIGHLIGHTER_COLOURS, INK_COLOURS } from "../model/config";
import { restyle } from "../canvas/elements";
import { useNotebook } from "../store/notebook";
import { useTools } from "../store/tools";

const MAX_FAVOURITES = 6;
const MAX_MIXES = 12;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * The ink flyout (mockup 03): 20 inks, 6 see-through highlighters for the brush, and up to
 * 12 of your own mixes. Right-click an ink or mix to pin it to the toolbar's six favourites;
 * right-click a mix to remove it.
 */
export function InkPalette({ onClose }: { onClose(): void }) {
  const ref = useRef<HTMLDivElement>(null);
  const general = useNotebook((s) => s.config.general);
  const updateConfig = useNotebook((s) => s.updateConfig);
  const editElements = useNotebook((s) => s.editElements);
  const [mixing, setMixing] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    const away = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (ref.current?.contains(t) || t.closest?.("[aria-label='All inks and highlighters']")) return;
      onClose();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", away, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", away, true);
    };
  }, [onClose]);

  const current = general.inkColour;
  const favourites = general.inkFavourites;
  const isFav = (v: string) => favourites.some((f) => same(f, v));
  const nameOf = (v: string) =>
    INK_COLOURS.find((i) => same(i.value, v))?.label ??
    HIGHLIGHTER_COLOURS.find((i) => same(i.value, v))?.label ??
    (general.inkMixes.some((m) => same(m, v)) ? `Mix ${v}` : v);

  const pick = (value: string, highlighter = false) => {
    void updateConfig((c) => ({ ...c, general: { ...c.general, inkColour: value } }));
    if (highlighter) useTools.getState().setTool("brush");
    else if (useTools.getState().tool === "brush" && /^rgba/.test(current)) useTools.getState().setTool("pen");
    const sel = new Set(useTools.getState().selectedIds);
    if (sel.size) editElements((els) => els.map((el) => (sel.has(el.id) ? restyle(el, { colour: value }) : el)));
    onClose();
  };

  const togglePin = (value: string) => {
    if (isFav(value)) {
      void updateConfig((c) => ({
        ...c,
        general: { ...c.general, inkFavourites: c.general.inkFavourites.filter((f) => !same(f, value)) },
      }));
      setMessage(`${nameOf(value)} unpinned from the toolbar.`);
    } else if (favourites.length >= MAX_FAVOURITES) {
      setMessage("The toolbar holds six inks. Right-click one there or here to unpin it first.");
    } else {
      void updateConfig((c) => ({
        ...c,
        general: { ...c.general, inkFavourites: [...c.general.inkFavourites, value] },
      }));
      setMessage(`${nameOf(value)} pinned to the toolbar.`);
    }
  };

  const saveMix = (value: string) => {
    void updateConfig((c) => {
      const mixes = c.general.inkMixes;
      if (mixes.some((m) => same(m, value)) || mixes.length >= MAX_MIXES) return c;
      return { ...c, general: { ...c.general, inkMixes: [...mixes, value], inkColour: value } };
    });
    setMixing(null);
    setMessage("Mix saved. Right-click it to pin it or remove it.");
  };

  const removeMix = (value: string) => {
    void updateConfig((c) => ({
      ...c,
      general: {
        ...c.general,
        inkMixes: c.general.inkMixes.filter((m) => !same(m, value)),
        inkFavourites: c.general.inkFavourites.filter((f) => !same(f, value)),
      },
    }));
    setMessage(`Mix ${value} removed.`);
  };

  return (
    <div ref={ref} className="flyout ink-flyout" role="dialog" aria-label="Inks and highlighters">
      <div className="fh">
        <h3>Inks</h3>
        <span>{nameOf(current)}</span>
      </div>
      <div className="inkgrid" role="group" aria-label="Inks">
        {INK_COLOURS.map((c) => (
          <button
            key={c.id}
            className={`ink${same(current, c.value) ? " on" : ""}${isFav(c.value) ? " fav" : ""}`}
            aria-label={`${c.label}${isFav(c.value) ? ", pinned to the toolbar" : ""}`}
            aria-pressed={same(current, c.value)}
            title={`${c.label}. Right-click to ${isFav(c.value) ? "unpin from" : "pin to"} the toolbar.`}
            onClick={() => pick(c.value)}
            onContextMenu={(e) => {
              e.preventDefault();
              togglePin(c.value);
            }}
          >
            <span style={{ background: c.value }} />
          </button>
        ))}
      </div>

      <div className="fh">
        <h3>Highlighters (brush)</h3>
        <span>see-through</span>
      </div>
      <div className="paper-sample" role="group" aria-label="Highlighters">
        {HIGHLIGHTER_COLOURS.map((c) => (
          <button
            key={c.id}
            className={`hlb${same(current, c.value) ? " on" : ""}`}
            style={{ background: c.value }}
            aria-label={`${c.label} highlighter`}
            aria-pressed={same(current, c.value)}
            onClick={() => pick(c.value, true)}
          >
            {c.label.toLowerCase()}
          </button>
        ))}
      </div>

      <div className="fh">
        <h3>Your mixes</h3>
        <span>
          {general.inkMixes.length} of {MAX_MIXES}
        </span>
      </div>
      <div className="mixrow" role="group" aria-label="Your mixes">
        {general.inkMixes.map((m) => (
          <button
            key={m}
            className={`ink mix${same(current, m) ? " on" : ""}${isFav(m) ? " fav" : ""}`}
            aria-label={`Mix ${m}`}
            aria-pressed={same(current, m)}
            title={`Mix ${m}. Right-click to pin, unpin or remove.`}
            onClick={() => pick(m)}
            onContextMenu={(e) => {
              e.preventDefault();
              if (isFav(m)) togglePin(m);
              else removeMix(m);
            }}
            onAuxClick={(e) => {
              if (e.button === 1) togglePin(m);
            }}
          >
            <span style={{ background: m }} />
          </button>
        ))}
        {general.inkMixes.length < MAX_MIXES && mixing === null && (
          <button className="mixbtn" onClick={() => setMixing(current.startsWith("#") ? current.slice(0, 7) : "#7fa04a")}>
            <span aria-hidden="true">+</span>Mix a colour
          </button>
        )}
      </div>

      {mixing !== null && (
        <div className="mixer">
          <label className="mixer-well">
            <span className="visually-hidden">Colour</span>
            <input type="color" value={mixing} onChange={(e) => setMixing(e.target.value)} />
          </label>
          <div className="mixer-sample" style={{ color: mixing }} aria-hidden="true">
            Sample of this ink
          </div>
          <div className="mixer-actions">
            <button className="small-button" onClick={() => setMixing(null)}>
              Cancel
            </button>
            <button className="pill primary" onClick={() => saveMix(mixing)}>
              Save mix
            </button>
          </div>
        </div>
      )}

      <p className="flyout-hint" role="status">
        {message ?? "Right-click an ink to pin it to the toolbar (six at most)."}
      </p>
    </div>
  );
}
