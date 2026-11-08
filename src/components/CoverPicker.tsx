import { COVER_COLOURS } from "../model/character";

/** Colour swatches plus a custom colour well: book covers by default, or any list given. */
export function CoverPicker({
  value,
  onChange,
  labelledBy,
  options = COVER_COLOURS,
}: {
  value: string;
  onChange(colour: string): void;
  labelledBy: string;
  options?: ReadonlyArray<{ label: string; value: string }>;
}) {
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  return (
    <div className="colour-picker swatches" role="group" aria-labelledby={labelledBy}>
      {options.map((c) => (
        <button
          type="button"
          key={c.value}
          className="swatch"
          aria-label={c.label}
          title={c.label}
          aria-pressed={same(value, c.value)}
          style={{ background: c.value }}
          onClick={() => onChange(c.value)}
        />
      ))}
      <input
        type="color"
        aria-label="Custom colour"
        title="Custom colour"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
