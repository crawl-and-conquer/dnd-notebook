import { useCallback } from "react";
import { type SheetData, type TrackerState } from "../model/sheet";
import { useNotebook } from "../store/notebook";

type Props = {
  characterId: string;
  sheet: SheetData;
  trackers: TrackerState;
};

const COIN_LABELS = ["CP", "SP", "EP", "GP", "PP"] as const;
const COIN_KEYS = ["cp", "sp", "ep", "gp", "pp"] as const;

export function SpellsKit({ characterId, sheet, trackers }: Props) {
  const updateTrackers = useNotebook((s) => s.updateTrackers);

  const toggleSlot = useCallback(
    (level: number, n: number) => {
      void updateTrackers(characterId, (t) => {
        const used = [...(t.usedSpellSlots ?? [])];
        while (used.length <= level) used.push(0);
        const cur = used[level] ?? 0;
        used[level] = cur === n ? n - 1 : n;
        return { ...t, usedSpellSlots: used };
      });
    },
    [characterId, updateTrackers],
  );

  const cantrips = sheet.spells.filter((s) => s.cantrip);
  const always = sheet.spells.filter((s) => s.always && !s.cantrip);
  const prepared = sheet.spells.filter((s) => !s.cantrip && !s.always);

  return (
    <div className="sheet-template spells-kit">
      {/* Spellcasting header */}
      {sheet.spellcasting && (
        <div className="sh-spell-header">
          <div className="sh-stat">
            <div className="mid">{sheet.spellcasting.ability}</div>
            <div className="lbl">Ability</div>
          </div>
          <div className="sh-stat">
            <div className="mid">{sheet.spellcasting.saveDc}</div>
            <div className="lbl">Save DC</div>
          </div>
          <div className="sh-stat">
            <div className="mid">{sheet.spellcasting.attackBonus}</div>
            <div className="lbl">Attack</div>
          </div>
        </div>
      )}

      {/* Spell slots */}
      {sheet.spellSlots.length > 0 && (
        <div className="sh-slots">
          <div className="sh-section-title lbl">Spell slots</div>
          {sheet.spellSlots.map((total, idx) => {
            if (total === 0) return null;
            const level = idx + 1;
            const used = trackers.usedSpellSlots?.[level] ?? 0;
            return (
              <div key={level} className="sh-slot-row">
                <span className="lbl">Level {level}</span>
                <div className="sh-slot-bubbles">
                  {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      className={`bub-btn ${used >= n ? "spent" : ""}`}
                      onClick={() => toggleSlot(level, n)}
                      aria-label={`Level ${level} slot ${n}`}
                    />
                  ))}
                </div>
                <span className="lbl">
                  {total - used}/{total}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Cantrips */}
      {cantrips.length > 0 && (
        <div className="sh-spell-list">
          <div className="sh-section-title lbl">Cantrips</div>
          {cantrips.map((sp) => (
            <div key={sp.name} className="sh-spell-row">
              {sp.concentration && <span className="sh-spell-tag lbl">C</span>}
              {sp.ritual && <span className="sh-spell-tag lbl">R</span>}
              <span>{sp.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Always prepared */}
      {always.length > 0 && (
        <div className="sh-spell-list">
          <div className="sh-section-title lbl">Always prepared</div>
          {always.map((sp) => (
            <div key={sp.name} className="sh-spell-row">
              {sp.concentration && <span className="sh-spell-tag lbl">C</span>}
              {sp.ritual && <span className="sh-spell-tag lbl">R</span>}
              <span>
                {sp.name} <span className="lbl">(lvl {sp.level})</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Prepared spells */}
      {prepared.length > 0 && (
        <div className="sh-spell-list">
          <div className="sh-section-title lbl">Prepared</div>
          {prepared.map((sp) => (
            <div key={sp.name} className="sh-spell-row">
              {sp.concentration && <span className="sh-spell-tag lbl">C</span>}
              {sp.ritual && <span className="sh-spell-tag lbl">R</span>}
              <span>
                {sp.name} <span className="lbl">(lvl {sp.level})</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Coins */}
      <div className="sh-coins">
        <div className="sh-section-title lbl">Coins</div>
        <div className="sh-coin-row">
          {COIN_KEYS.map((key, i) => (
            <div key={key} className="coin">
              <span className="mid">{sheet.coins[key]}</span>
              <span className="lbl">{COIN_LABELS[i]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Inventory */}
      {sheet.items.length > 0 && (
        <div className="sh-inventory">
          <div className="sh-section-title lbl">
            Inventory — {sheet.carryWeight ?? "?"} / {sheet.carryCapacity ?? "?"} lb
          </div>
          {sheet.items.map((item, i) => (
            <div key={i} className="sh-item-row">
              <span className="sh-item-name">{item.name}</span>
              {item.qty !== 1 && <span className="lbl">×{item.qty}</span>}
              {item.weight > 0 && (
                <span className="lbl sh-item-weight">{item.weight * item.qty} lb</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
