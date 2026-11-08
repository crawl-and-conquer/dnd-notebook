import {
  ABILITY_KEYS,
  SKILLS,
  emptySheetData,
  type AbilityKey,
  type Feature,
  type Sheet,
  type Spell,
} from "../../model/sheet";

/**
 * Reads a D&D Beyond character sheet PDF from its form fields (SPEC: Importing a D&D Beyond
 * sheet). The PDF looks flattened but keeps every value in a named field, so values are read
 * exactly, never by OCR. Anything missing is null; no number is ever guessed.
 *
 * Pure functions over the extracted fields, so they are unit tested without a PDF library.
 */

export type PdfField = { page: number; name: string; value: string };

export type ParsedSheet = {
  sheet: Sheet;
  /** Which parts of the PDF were there. */
  found: { core: boolean; features: boolean; details: boolean; spells: boolean };
  /** Labels of values that could not be read (shown as "Couldn't read" with a field to type). */
  unread: { path: string; label: string }[];
};

const norm = (name: string) => name.replace(/\s+/g, " ").trim().toLowerCase();

/** Field lookup by name, ignoring case and stray spaces; the first non-empty value wins. */
function index(fields: PdfField[]) {
  const map = new Map<string, string>();
  for (const f of fields) {
    const k = norm(f.name);
    const v = typeof f.value === "string" ? f.value : String(f.value ?? "");
    if (!map.has(k) || (!map.get(k) && v)) map.set(k, v);
  }
  return {
    has: (name: string) => map.has(norm(name)),
    str: (...names: string[]): string | null => {
      for (const n of names) {
        const v = map.get(norm(n))?.trim();
        if (v) return v;
      }
      return null;
    },
  };
}

/** "+4", "-1", "−1", "15", "40" → number; "--", "", "(Milestone)" → null. */
export function num(v: string | null | undefined): number | null {
  if (!v) return null;
  const t = v.trim().replace(/[−–]/g, "-");
  if (!/^[+-]?\d+$/.test(t)) return null;
  return Number(t);
}

/** "=== HEADING ===" blocks: the heading and the text under it. */
export function sections(text: string): { heading: string; body: string }[] {
  const out: { heading: string; body: string }[] = [];
  let cur: { heading: string; lines: string[] } | null = null;
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*===\s*(.+?)\s*===\s*$/.exec(line);
    if (m) {
      if (cur) out.push({ heading: cur.heading, body: cur.lines.join("\n").trim() });
      cur = { heading: m[1], lines: [] };
    } else if (cur) cur.lines.push(line);
  }
  if (cur) out.push({ heading: cur.heading, body: cur.lines.join("\n").trim() });
  return out;
}

/** Long text split over several fields (FeaturesTraits1, 2, 3) joined back together. */
function joined(parts: (string | null)[]): string | null {
  const present = parts.filter((p): p is string => !!p);
  if (!present.length) return null;
  return present.reduce((acc, p) => (/\n\s*$/.test(acc) ? acc + p : `${acc} ${p}`));
}

const titleCase = (s: string) =>
  s
    .toLowerCase()
    .replace(/(^|[\s(-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase())
    .replace(/\b(Of|The|And)\b/g, (w) => w.toLowerCase());

/** "DRUID FEATURES" → "Druid"; "KONOMIN (BOKKURIN) SPECIES TRAITS" → "Konomin (Bokkurin)"; "FEATS" → "Feats". */
export function groupName(heading: string): string {
  const h = heading.replace(/\s+(FEATURES|SPECIES TRAITS|RACIAL TRAITS|TRAITS)$/i, "").trim();
  return titleCase(h);
}

/** "* Name • Source page" entries, with their text and any "| 2 / Long Rest" uses line. */
export function parseFeatures(text: string, proficiency: number | null): Feature[] {
  const out: Feature[] = [];
  for (const sec of sections(text)) {
    const group = groupName(sec.heading);
    let cur: Feature | null = null;
    const lines: string[] = [];
    const flush = () => {
      if (!cur) return;
      const body = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
      cur.text = body;
      const uses = /\|\s*(\d+)\s*\/\s*(Long|Short)\s+Rest/i.exec(body);
      if (uses) cur.uses = { max: Number(uses[1]), per: uses[2].toLowerCase() as "long" | "short" };
      else {
        const pb = /number of times equal to your\s+Proficiency\s+Bonus[\s\S]*?(Long|Short)\s+Rest/i.exec(body);
        if (pb && proficiency !== null) cur.uses = { max: proficiency, per: pb[1].toLowerCase() as "long" | "short" };
      }
      out.push(cur);
      lines.length = 0;
    };
    for (const line of sec.body.split("\n")) {
      const m = /^\s*\*\s*(.+?)\s*•\s*(.*?)\s*$/.exec(line);
      if (m) {
        flush();
        cur = { group, name: m[1].trim(), source: m[2].trim(), text: "" };
      } else if (cur) lines.push(line.trimEnd());
    }
    flush();
  }
  return out;
}

const listSection = (text: string | null, heading: RegExp): string[] => {
  if (!text) return [];
  const sec = sections(text).find((s) => heading.test(s.heading));
  return sec
    ? sec.body
        .split(/,|\n/)
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
};

const ORDINAL_LEVEL = /(\d+)(?:st|nd|rd|th)\s+LEVEL/i;

/** The spell table: level headers ("=== 1st LEVEL ===" with "4 Slots OOOO") then spell rows. */
export function parseSpells(fields: PdfField[]): { slots: Record<string, number>; spells: Spell[] } {
  const slots: Record<string, number> = {};
  const rows = new Map<string, { order: number; v: Record<string, string> }>();
  let level = 0;
  let order = 0;
  for (const f of fields) {
    const name = f.name.replace(/\s+/g, "");
    const v = (f.value ?? "").trim();
    let m = /^spellHeader(\d+)$/.exec(name);
    if (m) {
      if (/CANTRIP/i.test(v)) level = 0;
      else {
        const l = ORDINAL_LEVEL.exec(v);
        if (l) level = Number(l[1]);
      }
      continue;
    }
    m = /^spellSlotHeader(\d+)$/.exec(name);
    if (m) {
      const s = /(\d+)\s*Slots?/i.exec(v);
      if (s && level > 0) slots[String(level)] = Number(s[1]);
      continue;
    }
    m = /^spell(Prepared|Name|Source|SaveHit|CastingTime|Range|Components|Duration|Page|Notes)(\d+)$/.exec(name);
    if (!m) continue;
    const key = `${f.page}:${m[2]}`;
    let row = rows.get(key);
    if (!row) {
      row = { order: order++, v: { level: String(level) } };
      rows.set(key, row);
    }
    row.v[m[1]] = v;
  }
  const spells: Spell[] = [...rows.values()]
    .filter((r) => r.v.Name)
    .sort((a, b) => a.order - b.order)
    .map(({ v: r }) => {
      const ritual = /\[R\]/.test(r.Name ?? "");
      const prep = (r.Prepared ?? "").toUpperCase();
      return {
        level: Number(r.level ?? 0),
        name: (r.Name ?? "").replace(/\s*\[R\]\s*/g, " ").trim(),
        source: r.Source ?? "",
        saveAtk: r.SaveHit && r.SaveHit !== "--" ? r.SaveHit : "",
        time: r.CastingTime ?? "",
        range: r.Range ?? "",
        components: r.Components ?? "",
        duration: r.Duration ?? "",
        ref: r.Page ?? "",
        notes: r.Notes ?? "",
        prepared: prep === "P" ? "always" : prep === "O" ? "no" : "yes",
        ritual,
        concentration: /^Concentration/i.test(r.Duration ?? ""),
      };
    });
  return { slots, spells };
}

const ABILITY_FIELD: Record<AbilityKey, { score: string; mod: string; save: string; prof: string }> = {
  str: { score: "STR", mod: "STRmod", save: "ST Strength", prof: "StrProf" },
  dex: { score: "DEX", mod: "DEXmod", save: "ST Dexterity", prof: "DexProf" },
  con: { score: "CON", mod: "CONmod", save: "ST Constitution", prof: "ConProf" },
  int: { score: "INT", mod: "INTmod", save: "ST Intelligence", prof: "IntProf" },
  wis: { score: "WIS", mod: "WISmod", save: "ST Wisdom", prof: "WisProf" },
  cha: { score: "CHA", mod: "CHamod", save: "ST Charisma", prof: "ChaProf" },
};

/** Skill value field and its P/E mark field, as D&D Beyond names them. */
const SKILL_FIELD: Record<string, { value: string; prof: string }> = {
  "Animal Handling": { value: "Animal", prof: "AnimalHandlingProf" },
  "Sleight of Hand": { value: "SleightofHand", prof: "SleightOfHandProf" },
};

export function parseDdbFields(fields: PdfField[]): ParsedSheet {
  const f = index(fields);
  const sheet = emptySheetData();
  const pages = new Set(fields.map((x) => x.page));
  const onPage = (p: (name: string) => boolean) => fields.some((x) => p(x.name));
  const found = {
    core: onPage((n) => /^ST Strength$|^STR$/i.test(n.trim())),
    features: onPage((n) => /^FeaturesTraits1$|^CP$/i.test(n.trim())),
    details: onPage((n) => /^Backstory$|^AlliesOrganizations$|^AGE$/i.test(n.trim())),
    spells: onPage((n) => /^spellName\d+$/i.test(n.trim())),
  };
  void pages;

  sheet.identity = {
    name: f.str("CharacterName", "CharacterName2", "CharacterName4"),
    player: f.str("PLAYER NAME", "PLAYER NAME2"),
    classLevel: f.str("CLASS LEVEL", "CLASS LEVEL2"),
    species: f.str("RACE", "RACE2"),
    background: f.str("BACKGROUND", "BACKGROUND2"),
    xp: f.str("EXPERIENCE POINTS", "EXPERIENCE POINTS2"),
    alignment: f.str("ALIGNMENT"),
    gender: f.str("GENDER"),
    age: f.str("AGE"),
    size: f.str("SIZE"),
    height: f.str("HEIGHT"),
    weight: f.str("WEIGHT"),
    faith: f.str("FAITH"),
    skin: f.str("SKIN"),
    eyes: f.str("EYES"),
    hair: f.str("HAIR"),
  };

  for (const k of ABILITY_KEYS) {
    const a = ABILITY_FIELD[k];
    sheet.abilities[k] = {
      score: num(f.str(a.score)),
      mod: num(f.str(a.mod)),
      save: num(f.str(a.save)),
      saveProficient: !!f.str(a.prof),
    };
  }

  const proficiency = num(f.str("ProfBonus"));
  sheet.combat = {
    ac: num(f.str("AC")),
    initiative: num(f.str("Init")),
    speed: f.str("Speed"),
    proficiency,
    maxHp: num(f.str("MaxHP")),
    hitDice: f.str("Total", "HD"),
    heroicInspiration: !!f.str("Inspiration") && !/^(off|no|0)$/i.test(f.str("Inspiration") ?? ""),
  };

  sheet.skills = SKILLS.map((s) => {
    const names = SKILL_FIELD[s.name] ?? { value: s.name.replace(/\s+/g, ""), prof: `${s.name.replace(/\s+/g, "")}Prof` };
    const mark = (f.str(names.prof) ?? "").toUpperCase();
    return {
      name: s.name,
      ability: s.ability.toUpperCase(),
      mod: num(f.str(names.value)),
      proficient: mark === "P" || mark === "E",
      expertise: mark === "E",
    };
  });

  sheet.passives = {
    perception: num(f.str("Passive1")),
    insight: num(f.str("Passive2")),
    investigation: num(f.str("Passive3")),
  };

  if (found.core) {
    const attacks: Sheet["attacks"] = [];
    for (let i = 1; i <= 6; i++) {
      const name = f.str(i === 1 ? "Wpn Name" : `Wpn Name ${i}`);
      if (!name) continue;
      attacks.push({
        name,
        hit: f.str(`Wpn${i} AtkBonus`) ?? "",
        damage: f.str(`Wpn${i} Damage`) ?? "",
        notes: f.str(`Wpn Notes ${i}`) ?? "",
      });
    }
    sheet.attacks = attacks;
    const profText = f.str("ProficienciesLang");
    sheet.proficiencies = {
      armour: listSection(profText, /ARMOU?R/i),
      weapons: listSection(profText, /WEAPON/i),
      tools: listSection(profText, /TOOL/i),
      languages: listSection(profText, /LANGUAGE/i),
    };
    const actionsText = joined([f.str("Actions1"), f.str("Actions2"), f.str("Actions3")]);
    sheet.actions = actionsText ? sections(actionsText).map((s) => ({ group: titleCase(s.heading), text: s.body })) : [];
  } else {
    sheet.attacks = null;
    sheet.proficiencies = null;
    sheet.actions = null;
  }

  if (found.features) {
    const featText = joined([f.str("FeaturesTraits1"), f.str("FeaturesTraits2"), f.str("FeaturesTraits3")]);
    sheet.features = featText ? parseFeatures(featText, proficiency) : [];
    const items: { name: string; qty: number; weight: string }[] = [];
    const attuned: { name: string; qty: number; weight: string }[] = [];
    for (let i = 0; i < 60; i++) {
      const name = f.str(`Eq Name${i}`);
      if (name) items.push({ name, qty: num(f.str(`Eq Qty${i}`)) ?? 1, weight: f.str(`Eq Weight${i}`) ?? "" });
      const an = f.str(`Attuned Name${i}`);
      if (an) attuned.push({ name: an, qty: num(f.str(`Attuned Qty${i}`)) ?? 1, weight: f.str(`Attuned Weight${i}`) ?? "" });
    }
    sheet.equipment = {
      coins: { cp: num(f.str("CP")), sp: num(f.str("SP")), ep: num(f.str("EP")), gp: num(f.str("GP")), pp: num(f.str("PP")) },
      items,
      attuned,
      carried: f.str("Weight Carried"),
      encumbered: f.str("Encumbered"),
      pushDragLift: f.str("PushDragLift"),
    };
  } else {
    sheet.features = null;
    sheet.equipment = null;
  }

  if (found.spells) {
    const { slots, spells } = parseSpells(fields);
    sheet.spellcasting = {
      class: f.str("spellCastingClass0"),
      ability: f.str("spellCastingAbility0"),
      saveDc: num(f.str("spellSaveDC0")),
      attack: num(f.str("spellAtkBonus0")),
      slots,
      spells,
    };
  } else {
    sheet.spellcasting = null;
  }

  const allies = f.str("AlliesOrganizations");
  sheet.details = {
    appearance: f.str("Appearance"),
    backstory: f.str("Backstory"),
    allies: allies ? allies.replace(/^\s*===\s*Allies\s*===\s*/i, "").trim() || null : null,
    additionalNotes: joined([f.str("AdditionalNotes1"), f.str("AdditionalNotes2")]),
    personality: f.str("PersonalityTraits"),
    ideals: f.str("Ideals"),
    bonds: f.str("Bonds"),
    flaws: f.str("Flaws"),
  };

  return { sheet, found, unread: unreadValues(sheet) };
}

const KEY_VALUES: { path: string; label: string }[] = [
  { path: "identity.name", label: "Character name" },
  { path: "identity.classLevel", label: "Class and level" },
  { path: "identity.species", label: "Species" },
  { path: "identity.background", label: "Background" },
  ...ABILITY_KEYS.flatMap((k) => [
    { path: `abilities.${k}.score`, label: `${k.toUpperCase()} score` },
    { path: `abilities.${k}.mod`, label: `${k.toUpperCase()} modifier` },
  ]),
  { path: "combat.ac", label: "Armour class" },
  { path: "combat.initiative", label: "Initiative" },
  { path: "combat.speed", label: "Speed" },
  { path: "combat.proficiency", label: "Proficiency bonus" },
  { path: "combat.maxHp", label: "Max HP" },
  { path: "combat.hitDice", label: "Hit dice" },
];

/** The main values that came back null. */
export function unreadValues(sheet: Sheet): { path: string; label: string }[] {
  return KEY_VALUES.filter(({ path }) => {
    let cur: unknown = sheet;
    for (const k of path.split(".")) cur = (cur as Record<string, unknown> | null)?.[k];
    return cur === null || cur === undefined;
  });
}
