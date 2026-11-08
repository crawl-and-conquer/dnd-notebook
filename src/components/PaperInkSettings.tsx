import { useState } from "react";
import { HIGHLIGHTER_COLOURS, INK_COLOURS, STROKE_WIDTHS, type AppConfig } from "../model/config";
import { useNotebook } from "../store/notebook";

const MAX_FAVOURITES = 6;
const NIB: Record<number, string> = { 2: "Fine", 4: "Medium", 8: "Broad" };
const FRAMES: { id: AppConfig["general"]["defaultPhotoFrame"]; label: string }[] = [
  { id: "print", label: "Print" },
  { id: "negative", label: "Negative" },
  { id: "none", label: "None" },
];

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** SPEC: Settings, Paper and ink. */
export function PaperInkSection() {
  const general = useNotebook((s) => s.config.general);
  const updateConfig = useNotebook((s) => s.updateConfig);
  const [message, setMessage] = useState<string | null>(null);
  const set = (patch: Partial<AppConfig["general"]>) =>
    void updateConfig((c) => ({ ...c, general: { ...c.general, ...patch } }));

  const favourites = general.inkFavourites;
  const isFav = (v: string) => favourites.some((f) => same(f, v));
  const nameOf = (v: string) =>
    INK_COLOURS.find((i) => same(i.value, v))?.label ??
    HIGHLIGHTER_COLOURS.find((i) => same(i.value, v))?.label ??
    `Mix ${v}`;

  const togglePin = (v: string) => {
    if (isFav(v)) {
      set({ inkFavourites: favourites.filter((f) => !same(f, v)) });
      setMessage(`${nameOf(v)} unpinned from the toolbar.`);
    } else if (favourites.length >= MAX_FAVOURITES) {
      setMessage("The toolbar holds six inks. Unpin one first.");
    } else {
      set({ inkFavourites: [...favourites, v] });
      setMessage(`${nameOf(v)} pinned to the toolbar.`);
    }
  };

  const swatch = (v: string, label: string) => (
    <button
      key={v}
      className="swatch"
      aria-label={`${label}${isFav(v) ? ", pinned" : ""}`}
      title={`${label}: ${isFav(v) ? "click to unpin" : "click to pin to the toolbar"}`}
      aria-pressed={isFav(v)}
      style={{ background: v }}
      onClick={() => togglePin(v)}
    />
  );

  return (
    <>
      <h3>Paper and ink</h3>

      <h3 className="sub">Photos</h3>
      <div className="settings-grid">
        <div className="field">
          <span id="default-frame">Default frame</span>
          <div className="segmented" role="radiogroup" aria-labelledby="default-frame">
            {FRAMES.map((f) => (
              <button
                key={f.id}
                role="radio"
                aria-checked={general.defaultPhotoFrame === f.id}
                onClick={() => set({ defaultPhotoFrame: f.id })}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <label className="check-row">
          <input
            type="checkbox"
            checked={general.filmLook}
            onChange={(e) => set({ filmLook: e.target.checked })}
          />
          Film look on new photos
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={general.dateStamp}
            onChange={(e) => set({ dateStamp: e.target.checked })}
          />
          Date stamp on new photos
        </label>
      </div>

      <h3 className="sub">Writing</h3>
      <div className="settings-grid">
        <label className="check-row">
          <input
            type="checkbox"
            checked={general.lockToLines}
            onChange={(e) => set({ lockToLines: e.target.checked })}
          />
          Lock to lines
        </label>
        <div className="field">
          <span id="default-nib">Nib</span>
          <div className="segmented" role="radiogroup" aria-labelledby="default-nib">
            {STROKE_WIDTHS.map((w) => (
              <button
                key={w}
                role="radio"
                aria-checked={general.strokeWidth === w}
                onClick={() => set({ strokeWidth: w })}
              >
                {NIB[w] ?? `${w} px`}
              </button>
            ))}
          </div>
        </div>
      </div>

      <h3 className="sub">Inks on the toolbar</h3>
      <p className="lead">Pick up to six inks, highlighters or mixes to pin to the toolbar.</p>
      <div className="field">
        <span id="fav-inks">Inks</span>
        <div className="swatches" role="group" aria-labelledby="fav-inks">
          {INK_COLOURS.map((c) => swatch(c.value, c.label))}
        </div>
      </div>
      <div className="field">
        <span id="fav-highlighters">Highlighters</span>
        <div className="swatches" role="group" aria-labelledby="fav-highlighters">
          {HIGHLIGHTER_COLOURS.map((c) => swatch(c.value, c.label))}
        </div>
      </div>
      <div className="field">
        <span id="fav-mixes">Your mixes</span>
        {general.inkMixes.length ? (
          <div className="mix-list" role="group" aria-labelledby="fav-mixes">
            {general.inkMixes.map((m) => (
              <span className="mix-row" key={m}>
                {swatch(m, `Mix ${m}`)}
                <code>{m}</code>
                <button
                  className="small-button"
                  onClick={() => {
                    set({
                      inkMixes: general.inkMixes.filter((x) => !same(x, m)),
                      inkFavourites: favourites.filter((f) => !same(f, m)),
                    });
                    setMessage(`Mix ${m} deleted.`);
                  }}
                >
                  Delete
                </button>
              </span>
            ))}
          </div>
        ) : (
          <span className="hint">
            Mix a colour from the palette on the toolbar to save it here.
          </span>
        )}
      </div>
      {message && (
        <p role="status" className="hint">
          {message}
        </p>
      )}
    </>
  );
}
