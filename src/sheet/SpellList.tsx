import { type SheetData } from "../model/sheet";

type Props = {
  sheet: SheetData;
};

export function SpellList({ sheet }: Props) {
  const byLevel = new Map<number, typeof sheet.spells>();
  for (const spell of sheet.spells) {
    const arr = byLevel.get(spell.level) ?? [];
    arr.push(spell);
    byLevel.set(spell.level, arr);
  }
  const levels = [...byLevel.keys()].sort((a, b) => a - b);

  return (
    <div className="sheet-template spell-list">
      <div className="sh-section-title lbl">Spell list</div>
      {levels.map((level) => (
        <div key={level} className="sh-spell-level-group">
          <div className="sh-spell-level-heading lbl">
            {level === 0 ? "Cantrips" : `Level ${level}`}
          </div>
          {(byLevel.get(level) ?? []).map((sp) => (
            <div key={sp.name} className="sh-spell-entry">
              <span className="sh-spell-entry-name">{sp.name}</span>
              <span className="sh-spell-tags">
                {sp.always && <span className="sh-spell-tag lbl">always</span>}
                {sp.concentration && <span className="sh-spell-tag lbl">conc</span>}
                {sp.ritual && <span className="sh-spell-tag lbl">ritual</span>}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
