import { ABILITY_KEYS, ABILITY_LABELS, featureKey, signed, type Sheet, type SheetPageType, type Trackers } from "../model/sheet";
import { SPELL_ROWS_PER_PAGE, spellListRows } from "../sheet/layout";

/** Sheet pages as Markdown tables built from sheet.json and trackers.json (SPEC: Export). */

const cell = (v: unknown) =>
  v === null || v === undefined || v === "" ? "—" : String(v).replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");

function table(head: string[], rows: unknown[][]): string {
  return [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`)].join(
    "\n",
  );
}

const dots = (used: number, max: number) => "●".repeat(Math.min(used, max)) + "○".repeat(Math.max(0, max - used));

export function sheetMarkdown(type: SheetPageType, index: number, s: Sheet, t: Trackers): string {
  const out: string[] = [];
  switch (type) {
    case "core-left": {
      const id = s.identity;
      out.push(
        table(["Name", "Class and level", "Species", "Background", "Player", "XP"], [
          [id.name, id.classLevel, id.species, id.background, id.player, id.xp],
        ]),
        "",
        table(
          ["Ability", "Score", "Modifier", "Save", "Save proficient"],
          ABILITY_KEYS.map((k) => {
            const a = s.abilities[k];
            return [ABILITY_LABELS[k], a.score, signed(a.mod), signed(a.save), a.saveProficient ? "yes" : ""];
          }),
        ),
        "",
        table(["Armour class", "Initiative", "Speed", "Proficiency", "Max HP", "Current HP", "Temp HP", "Hit dice"], [
          [
            s.combat.ac,
            signed(s.combat.initiative),
            s.combat.speed,
            signed(s.combat.proficiency),
            s.combat.maxHp,
            t.hp.current,
            t.hp.temp,
            `${s.combat.hitDice ?? "—"} (${t.hitDiceSpent} spent)`,
          ],
        ]),
        "",
        `Death saves: ${dots(t.deathSaves.success, 3)} successes, ${dots(t.deathSaves.fail, 3)} failures`,
      );
      if (s.proficiencies) {
        const p = s.proficiencies;
        out.push(
          "",
          table(["Armour", "Weapons", "Tools", "Languages"], [[p.armour.join(", "), p.weapons.join(", "), p.tools.join(", "), p.languages.join(", ")]]),
        );
      }
      break;
    }
    case "core-right":
      out.push(
        table(
          ["Skill", "Ability", "Bonus", "Proficient"],
          s.skills.map((k) => [k.name, k.ability, signed(k.mod), k.expertise ? "expertise" : k.proficient ? "yes" : ""]),
        ),
        "",
        `Passive perception ${cell(s.passives.perception)}, insight ${cell(s.passives.insight)}, investigation ${cell(s.passives.investigation)}`,
        "",
        table(["Attack", "Hit", "Damage", "Notes"], (s.attacks ?? []).map((a) => [a.name, a.hit, a.damage, a.notes])),
      );
      break;
    case "features":
      out.push(
        table(
          ["Group", "Feature", "Source", "Uses", "Notes"],
          (s.features ?? []).map((f) => [
            f.group,
            f.name,
            f.source,
            f.uses ? `${dots(t.featureUses[featureKey(f)] ?? 0, f.uses.max)} per ${f.uses.per} rest` : "",
            f.text.replace(/\s*\|\s*/g, " ").slice(0, 300),
          ]),
        ),
      );
      break;
    case "spells-kit": {
      const sc = s.spellcasting;
      if (sc) {
        out.push(
          table(["Class", "Ability", "Save DC", "Spell attack"], [[sc.class, sc.ability, sc.saveDc, signed(sc.attack)]]),
          "",
          table(
            ["Level", "Slots"],
            Object.entries(sc.slots).map(([lvl, n]) => [lvl, dots(t.slotsSpent[lvl] ?? 0, n)]),
          ),
          "",
        );
      }
      const eq = s.equipment;
      if (eq) {
        out.push(
          table(["CP", "SP", "EP", "GP", "PP"], [[eq.coins.cp, eq.coins.sp, eq.coins.ep, eq.coins.gp, eq.coins.pp]]),
          "",
          table(["Item", "Qty", "Weight"], [...eq.items, ...eq.attuned].map((i) => [i.name, i.qty, i.weight])),
          "",
          `Carrying ${cell(eq.carried)} of ${cell(eq.encumbered)}.`,
        );
      }
      break;
    }
    case "spell-list": {
      const rows = spellListRows(s)
        .slice(index * SPELL_ROWS_PER_PAGE, (index + 1) * SPELL_ROWS_PER_PAGE)
        .flatMap((r) =>
          r.kind === "spell"
            ? [[
                r.spell.prepared === "always" ? "always" : r.spell.prepared === "yes" ? "yes" : "",
                r.spell.name + (r.spell.ritual ? " (ritual)" : ""),
                r.spell.level === 0 ? "cantrip" : r.spell.level,
                r.spell.time,
                r.spell.range,
                r.spell.components,
                r.spell.duration,
                r.spell.concentration ? "yes" : "",
              ]]
            : [],
        );
      out.push(table(["Prepared", "Spell", "Level", "Time", "Range", "Components", "Duration", "Concentration"], rows));
      break;
    }
  }
  return out.join("\n");
}
