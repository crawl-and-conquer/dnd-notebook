import { COVER_COLOURS } from "../model/character";

/** Cover colour swatches for a character's book spine. */
export function CoverPicker({
  value,
  onChange,
  labelledBy,
}: {
  value: string;
  onChange(colour: string): void;
  labelledBy: string;
}) {
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  return (
    <div className="colour-picker swatches" role="group" aria-labelledby={labelledBy}>
      {COVER_COLOURS.map((c) => (
        <button
          type="button"
          key={c.value}
          className="swatch"
          aria-label={c.label}
          aria-pressed={same(value, c.value)}
          style={{ background: c.value }}
          onClick={() => onChange(c.value)}
        />
      ))}
      <input
        type="color"
        aria-label="Custom colour"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
