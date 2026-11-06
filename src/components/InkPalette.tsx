import { useEffect, useRef } from "react";
import { HIGHLIGHTER_COLOURS, INK_COLOURS } from "../model/config";
import { restyle } from "../canvas/elements";
import { useNotebook } from "../store/notebook";
import { useTools } from "../store/tools";
import { CloseIcon, PinIcon } from "./Icons";

const MAX_FAVOURITES = 6;
const MAX_MIXES = 12;

type Props = {
  onClose(): void;
};

export function InkPalette({ onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const general = useNotebook((s) => s.config.general);
  const updateConfig = useNotebook((s) => s.updateConfig);
  const editElements = useNotebook((s) => s.editElements);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onClick, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onClick, true);
    };
  }, [onClose]);

  function selectColour(value: string, isHighlighter = false) {
    void updateConfig((c) => ({ ...c, general: { ...c.general, inkColour: value } }));
    if (isHighlighter) useTools.getState().setTool("brush");
    const sel = new Set(useTools.getState().selectedIds);
    if (sel.size) {
      editElements((els) =>
        els.map((el) => (sel.has(el.id) ? restyle(el, { colour: value }) : el)),
      );
    }
    onClose();
  }

  function togglePin(value: string) {
    void updateConfig((c) => {
      const favs = c.general.inkFavourites;
      const pinned = favs.includes(value);
      const next = pinned
        ? favs.filter((f) => f !== value)
        : favs.length < MAX_FAVOURITES
          ? [...favs, value]
          : favs;
      return { ...c, general: { ...c.general, inkFavourites: next } };
    });
  }

  function addMix(value: string) {
    void updateConfig((c) => {
      const mixes = c.general.inkMixes;
      if (mixes.includes(value) || mixes.length >= MAX_MIXES) return c;
      return { ...c, general: { ...c.general, inkMixes: [...mixes, value] } };
    });
  }

  function removeMix(value: string) {
    void updateConfig((c) => ({
      ...c,
      general: { ...c.general, inkMixes: c.general.inkMixes.filter((m) => m !== value) },
    }));
  }

  const current = general.inkColour;
  const favSet = new Set(general.inkFavourites);

  return (
    <div ref={ref} className="ink-palette" role="dialog" aria-label="Ink palette">
      <div className="ink-palette-header">
        <span className="ink-palette-title">Inks</span>
        <button className="icon-button small" aria-label="Close palette" onClick={onClose}>
          <CloseIcon size={14} />
        </button>
      </div>

      <section aria-label="Ink colours">
        <div className="ink-grid">
          {INK_COLOURS.map((c) => (
            <div key={c.id} className="ink-cell">
              <button
                className="swatch large"
                style={{ background: c.value }}
                aria-label={c.label}
                aria-pressed={current.toLowerCase() === c.value.toLowerCase()}
                title={c.label}
                onClick={() => selectColour(c.value)}
              />
              <button
                className={`pin-button${favSet.has(c.value) ? " pinned" : ""}`}
                aria-label={favSet.has(c.value) ? `Unpin ${c.label}` : `Pin ${c.label} to toolbar`}
                aria-pressed={favSet.has(c.value)}
                onClick={() => togglePin(c.value)}
              >
                <PinIcon size={10} />
              </button>
            </div>
          ))}
        </div>
      </section>

      <section aria-label="Highlighters" className="ink-palette-section">
        <p className="ink-palette-label">Highlighters — brush tool, sits under text</p>
        <div className="ink-row">
          {HIGHLIGHTER_COLOURS.map((c) => (
            <button
              key={c.id}
              className="swatch large highlighter"
              style={{ background: c.value }}
              aria-label={c.label}
              aria-pressed={current === c.value}
              title={`${c.label} highlighter`}
              onClick={() => selectColour(c.value, true)}
            />
          ))}
        </div>
      </section>

      <section aria-label="Mixes" className="ink-palette-section">
        <p className="ink-palette-label">Mixes</p>
        <div className="ink-row">
          {general.inkMixes.map((m) => (
            <div key={m} className="ink-cell mix-cell">
              <button
                className="swatch large"
                style={{ background: m }}
                aria-label={m}
                aria-pressed={current.toLowerCase() === m.toLowerCase()}
                title={m}
                onClick={() => selectColour(m)}
              />
              <div className="mix-actions">
                <button
                  className={`pin-button${favSet.has(m) ? " pinned" : ""}`}
                  aria-label={favSet.has(m) ? `Unpin ${m}` : `Pin ${m}`}
                  aria-pressed={favSet.has(m)}
                  onClick={() => togglePin(m)}
                >
                  <PinIcon size={10} />
                </button>
                <button
                  className="mix-remove"
                  aria-label={`Remove ${m}`}
                  onClick={() => removeMix(m)}
                >
                  ×
                </button>
              </div>
            </div>
          ))}
          {general.inkMixes.length < MAX_MIXES && (
            <label className="swatch large mix-add" title="Mix a new colour" aria-label="Add mix">
              +
              <input
                type="color"
                defaultValue="#888888"
                style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}
                onChange={(e) => addMix(e.target.value)}
              />
            </label>
          )}
        </div>
      </section>

      <p className="ink-palette-hint">
        Pin up to {MAX_FAVOURITES} colours to show on the toolbar.
      </p>
    </div>
  );
}
