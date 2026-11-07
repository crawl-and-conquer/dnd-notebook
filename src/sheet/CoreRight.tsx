import {
  SKILLS,
  abilityMod,
  modStr,
  skillBonus,
  type SheetData,
  type TrackerState,
} from "../model/sheet";

type Props = {
  characterId: string;
  sheet: SheetData;
  trackers: TrackerState;
};

export function CoreRight({ sheet }: Props) {
  const prof = sheet.proficiencyBonus;

  const passivePerception =
    10 +
    skillBonus(
      SKILLS.find((s) => s.id === "perception")!,
      sheet.abilities,
      prof,
      sheet.skillProficiencies,
      sheet.skillExpertise,
    );

  const passiveInsight =
    10 +
    skillBonus(
      SKILLS.find((s) => s.id === "insight")!,
      sheet.abilities,
      prof,
      sheet.skillProficiencies,
      sheet.skillExpertise,
    );

  const passiveInvestigation =
    10 +
    skillBonus(
      SKILLS.find((s) => s.id === "investigation")!,
      sheet.abilities,
      prof,
      sheet.skillProficiencies,
      sheet.skillExpertise,
    );

  return (
    <div className="sheet-template core-right">
      {/* Skills list */}
      <div className="sh-skills">
        <div className="sh-section-title lbl">Skills</div>
        {SKILLS.map((skill) => {
          const bonus = skillBonus(
            skill,
            sheet.abilities,
            prof,
            sheet.skillProficiencies,
            sheet.skillExpertise,
          );
          const expert = sheet.skillExpertise.includes(skill.id);
          const proficient = sheet.skillProficiencies.includes(skill.id);
          return (
            <div key={skill.id} className="sk">
              <span className={`bub ${expert ? "expert" : proficient ? "filled" : ""}`} />
              <span className="sk-bonus mid">{modStr(bonus)}</span>
              <span className="sk-label">{skill.label}</span>
              <span className="sk-ability lbl">{skill.ability.toUpperCase()}</span>
            </div>
          );
        })}
      </div>

      {/* Passive senses */}
      <div className="sh-passive-senses">
        <div className="sh-section-title lbl">Passive senses</div>
        <div className="sh-passive-row">
          <span className="mid">{passivePerception}</span>
          <span className="lbl">Perception</span>
        </div>
        <div className="sh-passive-row">
          <span className="mid">{passiveInsight}</span>
          <span className="lbl">Insight</span>
        </div>
        <div className="sh-passive-row">
          <span className="mid">{passiveInvestigation}</span>
          <span className="lbl">Investigation</span>
        </div>
      </div>

      {/* Attacks */}
      {sheet.attacks.length > 0 && (
        <div className="sh-attacks">
          <div className="sh-section-title lbl">Attacks</div>
          <div className="sh-atk-header">
            <span className="lbl">Name</span>
            <span className="lbl">Bonus</span>
            <span className="lbl">Damage</span>
          </div>
          {sheet.attacks.map((atk, i) => (
            <div key={i} className="atk">
              <span className="atk-name">{atk.name}</span>
              <span className="atk-bonus mid">{atk.bonus}</span>
              <span className="atk-damage">{atk.damage}</span>
            </div>
          ))}
        </div>
      )}

      {/* Initiative bonus for reference */}
      <div className="sh-initiative-ref">
        <span className="lbl">Initiative</span>
        <span className="mid">{modStr(abilityMod(sheet.abilities.dex))}</span>
      </div>
    </div>
  );
}
