import { useCallback } from "react";
import {
  ABILITY_KEYS,
  ABILITY_LABELS,
  abilityMod,
  modStr,
  type SheetData,
  type TrackerState,
} from "../model/sheet";
import { useNotebook } from "../store/notebook";

type Props = {
  characterId: string;
  sheet: SheetData;
  trackers: TrackerState;
};

export function CoreLeft({ characterId, sheet, trackers }: Props) {
  const updateTrackers = useNotebook((s) => s.updateTrackers);

  const setCurrentHp = useCallback(
    (val: number) => {
      void updateTrackers(characterId, (t) => ({
        ...t,
        currentHp: Math.max(0, Math.min(sheet.hp.max + t.tempHp, val)),
      }));
    },
    [characterId, sheet.hp.max, updateTrackers],
  );

  const setTempHp = useCallback(
    (val: number) => {
      void updateTrackers(characterId, (t) => ({ ...t, tempHp: Math.max(0, val) }));
    },
    [characterId, updateTrackers],
  );

  const toggleDeathSuccess = useCallback(
    (n: number) => {
      void updateTrackers(characterId, (t) => ({
        ...t,
        deathSavesSuccess: t.deathSavesSuccess === n ? n - 1 : n,
      }));
    },
    [characterId, updateTrackers],
  );

  const toggleDeathFail = useCallback(
    (n: number) => {
      void updateTrackers(characterId, (t) => ({
        ...t,
        deathSavesFail: t.deathSavesFail === n ? n - 1 : n,
      }));
    },
    [characterId, updateTrackers],
  );

  const prof = sheet.proficiencyBonus;

  return (
    <div className="sheet-template core-left">
      {/* Character identity */}
      <div className="sh-identity">
        <span className="sh-name">{sheet.charName}</span>
        <span className="sh-class">
          {sheet.charClass} {sheet.level}
        </span>
        <span className="sh-race">{sheet.race}</span>
        <span className="sh-bg">{sheet.background}</span>
      </div>

      {/* Ability scores */}
      <div className="sh-abilities">
        {ABILITY_KEYS.map((key) => {
          const score = sheet.abilities[key];
          const mod = abilityMod(score);
          const proficient = sheet.saveProficiencies.includes(key);
          return (
            <div key={key} className="ab">
              <div className="ab-label">{ABILITY_LABELS[key].slice(0, 3).toUpperCase()}</div>
              <div className="ab-score">{score}</div>
              <div className="ab-mod big">{modStr(mod)}</div>
              <div className="ab-save">
                <span className={`bub ${proficient ? "filled" : ""}`} />
                <span className="lbl">Save {modStr(proficient ? mod + prof : mod)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Combat stats row */}
      <div className="sh-combat-row">
        <div className="sh-stat">
          <div className="mid">{sheet.ac}</div>
          <div className="lbl">Armour class</div>
        </div>
        <div className="sh-stat">
          <div className="mid">{modStr(abilityMod(sheet.abilities.dex))}</div>
          <div className="lbl">Initiative</div>
        </div>
        <div className="sh-stat">
          <div className="mid">{sheet.speed}</div>
          <div className="lbl">Speed</div>
        </div>
        <div className="sh-stat">
          <div className="mid">+{prof}</div>
          <div className="lbl">Proficiency</div>
        </div>
      </div>

      {/* HP panel */}
      <div className="sh-hp-panel">
        <div className="sh-hp-row">
          <label className="lbl">Current HP</label>
          <input
            className="hb2 hp-input"
            type="number"
            value={trackers.currentHp}
            min={0}
            max={sheet.hp.max + trackers.tempHp}
            onChange={(e) => setCurrentHp(parseInt(e.target.value, 10) || 0)}
          />
          <span className="sh-hp-sep">/</span>
          <span className="mid sh-hp-max">{sheet.hp.max}</span>
          <label className="lbl">max</label>
        </div>
        <div className="sh-hp-row">
          <label className="lbl">Temp HP</label>
          <input
            className="sh-temp-hp"
            type="number"
            value={trackers.tempHp}
            min={0}
            onChange={(e) => setTempHp(parseInt(e.target.value, 10) || 0)}
          />
        </div>
      </div>

      {/* Hit dice */}
      <div className="sh-hit-dice">
        <span className="lbl">Hit dice</span>
        <span className="mid">
          {sheet.hitDice} ({Math.max(0, (sheet.hitDice.match(/\d+/)?.[0] ?? 0) as number - trackers.usedHitDice)} left)
        </span>
      </div>

      {/* Death saves */}
      <div className="sh-death-saves">
        <span className="lbl">Death saves</span>
        <div className="sh-ds-row">
          <span className="lbl">Successes</span>
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              className={`bub-btn ${trackers.deathSavesSuccess >= n ? "filled" : ""}`}
              onClick={() => toggleDeathSuccess(n)}
              aria-label={`Death save success ${n}`}
            />
          ))}
        </div>
        <div className="sh-ds-row">
          <span className="lbl">Failures</span>
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              className={`bub-btn fail ${trackers.deathSavesFail >= n ? "filled" : ""}`}
              onClick={() => toggleDeathFail(n)}
              aria-label={`Death save failure ${n}`}
            />
          ))}
        </div>
      </div>

      {/* Proficiencies */}
      <div className="sh-profs">
        <div className="lbl sh-profs-label">Proficiencies</div>
        {sheet.trainedArmour && (
          <div className="sh-prof-line">
            <span className="sh-prof-cat">Armour</span> {sheet.trainedArmour}
          </div>
        )}
        {sheet.trainedWeapons && (
          <div className="sh-prof-line">
            <span className="sh-prof-cat">Weapons</span> {sheet.trainedWeapons}
          </div>
        )}
        {sheet.languages && (
          <div className="sh-prof-line">
            <span className="sh-prof-cat">Languages</span> {sheet.languages}
          </div>
        )}
      </div>
    </div>
  );
}
