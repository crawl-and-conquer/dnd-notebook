import { z } from "zod";

/**
 * sheet.json and trackers.json (SPEC: Character sheet). Values read from a D&D Beyond PDF or
 * typed in; anything that could not be read is null and shows as a blank to fill in. Values
 * typed by hand are listed in `overrides` by path, so a re-import can say what it would replace.
 */

export type SheetPageType = "core-left" | "core-right" | "features" | "spells-kit" | "spell-list";
export const SHEET_PAGE_TYPES: SheetPageType[] = ["core-left", "core-right", "features", "spells-kit", "spell-list"];

export const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"] as const;
export type AbilityKey = (typeof ABILITY_KEYS)[number];
export const ABILITY_LABELS: Record<AbilityKey, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

export const SKILLS: Array<{ name: string; ability: AbilityKey }> = [
  { name: "Acrobatics", ability: "dex" },
  { name: "Animal Handling", ability: "wis" },
  { name: "Arcana", ability: "int" },
  { name: "Athletics", ability: "str" },
  { name: "Deception", ability: "cha" },
  { name: "History", ability: "int" },
  { name: "Insight", ability: "wis" },
  { name: "Intimidation", ability: "cha" },
  { name: "Investigation", ability: "int" },
  { name: "Medicine", ability: "wis" },
  { name: "Nature", ability: "int" },
  { name: "Perception", ability: "wis" },
  { name: "Performance", ability: "cha" },
  { name: "Persuasion", ability: "cha" },
  { name: "Religion", ability: "int" },
  { name: "Sleight of Hand", ability: "dex" },
  { name: "Stealth", ability: "dex" },
  { name: "Survival", ability: "wis" },
];

const S = z.string().nullable();
const N = z.number().nullable();

const AbilitySchema = z.object({
  score: N,
  mod: N,
  save: N,
  saveProficient: z.boolean(),
});

const SpellSchema = z.object({
  level: z.number(),
  name: z.string(),
  source: z.string(),
  saveAtk: z.string(),
  time: z.string(),
  range: z.string(),
  components: z.string(),
  duration: z.string(),
  ref: z.string(),
  notes: z.string(),
  prepared: z.enum(["always", "yes", "no"]),
  ritual: z.boolean(),
  concentration: z.boolean(),
});

const ItemSchema = z.object({ name: z.string(), qty: z.number(), weight: z.string() });

export const SheetSchema = z.object({
  schemaVersion: z.literal(1),
  source: z
    .object({ kind: z.literal("ddb-pdf"), file: z.string(), sha256: z.string(), importedAt: z.string() })
    .optional(),
  overrides: z.array(z.string()),
  identity: z.object({
    name: S,
    player: S,
    classLevel: S,
    species: S,
    background: S,
    xp: S,
    alignment: S,
    gender: S,
    age: S,
    size: S,
    height: S,
    weight: S,
    faith: S,
    skin: S,
    eyes: S,
    hair: S,
  }),
  abilities: z.object({
    str: AbilitySchema,
    dex: AbilitySchema,
    con: AbilitySchema,
    int: AbilitySchema,
    wis: AbilitySchema,
    cha: AbilitySchema,
  }),
  combat: z.object({
    ac: N,
    initiative: N,
    speed: S,
    proficiency: N,
    maxHp: N,
    hitDice: S,
    heroicInspiration: z.boolean(),
  }),
  skills: z.array(
    z.object({ name: z.string(), ability: z.string(), mod: N, proficient: z.boolean(), expertise: z.boolean() }),
  ),
  passives: z.object({ perception: N, insight: N, investigation: N }),
  attacks: z.array(z.object({ name: z.string(), hit: z.string(), damage: z.string(), notes: z.string() })).nullable(),
  proficiencies: z
    .object({
      armour: z.array(z.string()),
      weapons: z.array(z.string()),
      tools: z.array(z.string()),
      languages: z.array(z.string()),
    })
    .nullable(),
  actions: z.array(z.object({ group: z.string(), text: z.string() })).nullable(),
  features: z
    .array(
      z.object({
        group: z.string(),
        name: z.string(),
        source: z.string(),
        text: z.string(),
        uses: z.object({ max: z.number(), per: z.enum(["long", "short"]) }).optional(),
      }),
    )
    .nullable(),
  spellcasting: z
    .object({
      class: S,
      ability: S,
      saveDc: N,
      attack: N,
      slots: z.record(z.string(), z.number()),
      spells: z.array(SpellSchema),
    })
    .nullable()
    .optional(),
  equipment: z
    .object({
      coins: z.object({ cp: N, sp: N, ep: N, gp: N, pp: N }),
      items: z.array(ItemSchema),
      attuned: z.array(ItemSchema),
      carried: S,
      encumbered: S,
      pushDragLift: S,
    })
    .nullable(),
  details: z.object({
    appearance: S,
    backstory: S,
    allies: S,
    additionalNotes: S,
    personality: S,
    ideals: S,
    bonds: S,
    flaws: S,
  }),
});

export type Sheet = z.infer<typeof SheetSchema>;
/** Older name used across the app. */
export type SheetData = Sheet;
export type Spell = z.infer<typeof SpellSchema>;
export type Feature = NonNullable<Sheet["features"]>[number];

const blankAbility = () => ({ score: null, mod: null, save: null, saveProficient: false });

export function emptySheetData(): Sheet {
  return {
    schemaVersion: 1,
    overrides: [],
    identity: {
      name: null,
      player: null,
      classLevel: null,
      species: null,
      background: null,
      xp: null,
      alignment: null,
      gender: null,
      age: null,
      size: null,
      height: null,
      weight: null,
      faith: null,
      skin: null,
      eyes: null,
      hair: null,
    },
    abilities: {
      str: blankAbility(),
      dex: blankAbility(),
      con: blankAbility(),
      int: blankAbility(),
      wis: blankAbility(),
      cha: blankAbility(),
    },
    combat: {
      ac: null,
      initiative: null,
      speed: null,
      proficiency: null,
      maxHp: null,
      hitDice: null,
      heroicInspiration: false,
    },
    skills: SKILLS.map((s) => ({ name: s.name, ability: s.ability.toUpperCase(), mod: null, proficient: false, expertise: false })),
    passives: { perception: null, insight: null, investigation: null },
    attacks: [],
    proficiencies: { armour: [], weapons: [], tools: [], languages: [] },
    actions: [],
    features: [],
    spellcasting: null,
    equipment: {
      coins: { cp: null, sp: null, ep: null, gp: null, pp: null },
      items: [],
      attuned: [],
      carried: null,
      encumbered: null,
      pushDragLift: null,
    },
    details: {
      appearance: null,
      backstory: null,
      allies: null,
      additionalNotes: null,
      personality: null,
      ideals: null,
      bonds: null,
      flaws: null,
    },
  };
}

/** True once anything has been imported or typed in. */
export function hasSheet(s: Sheet): boolean {
  return !!s.source || s.overrides.length > 0 || s.identity.name !== null;
}

export function parseSheetData(text: string): Sheet {
  try {
    const r = SheetSchema.safeParse(JSON.parse(text));
    return r.success ? r.data : emptySheetData();
  } catch {
    return emptySheetData();
  }
}

export function serialiseSheet(data: Sheet): string {
  return JSON.stringify(data, null, 2) + "\n";
}

// ----- reading and writing values by path ("combat.ac", "abilities.wis.score", "skills.3.mod") -----

export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split(".")) {
    if (cur === null || cur === undefined) return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** A copy with one value replaced; numbers stay numbers (or null when cleared). */
export function setPath<T>(obj: T, path: string, value: unknown): T {
  const keys = path.split(".");
  const clone = (v: unknown): unknown => (Array.isArray(v) ? [...v] : v && typeof v === "object" ? { ...v } : v);
  const root = clone(obj) as Record<string, unknown>;
  let cur = root;
  for (let i = 0; i < keys.length - 1; i++) {
    const next = clone(cur[keys[i]]) as Record<string, unknown>;
    cur[keys[i]] = next;
    cur = next;
  }
  cur[keys[keys.length - 1]] = value;
  return root as T;
}

/** Turns typed text into the stored value for a path: numbers for number fields, text otherwise. */
export function coerceTyped(current: unknown, text: string): string | number | null {
  const t = text.trim();
  if (!t) return null;
  if (typeof current === "number" || current === null) {
    const n = Number(t.replace(/[−–]/g, "-").replace(/^\+/, ""));
    if (Number.isFinite(n) && /^[+\-−–]?\d+$/.test(t)) return n;
    return typeof current === "number" ? current : t;
  }
  return t;
}

/** Sets a value typed by hand and records it as an override. */
export function overrideValue(sheet: Sheet, path: string, text: string): Sheet {
  const value = coerceTyped(getPath(sheet, path), text);
  const next = setPath(sheet, path, value);
  return { ...next, overrides: next.overrides.includes(path) ? next.overrides : [...next.overrides, path] };
}

export const signed = (n: number | null | undefined): string =>
  n === null || n === undefined ? "" : n >= 0 ? `+${n}` : `−${Math.abs(n)}`;

// ----- trackers.json: spent slots, HP, death saves, uses. Never touched by a re-import. -----

export const TrackersSchema = z.object({
  schemaVersion: z.literal(1),
  hp: z.object({ current: N, temp: N }),
  slotsSpent: z.record(z.string(), z.number()),
  featureUses: z.record(z.string(), z.number()),
  hitDiceSpent: z.number(),
  deathSaves: z.object({ success: z.number(), fail: z.number() }),
});

export type Trackers = z.infer<typeof TrackersSchema>;
/** Older name used across the app. */
export type TrackerState = Trackers;

export function emptyTrackers(): Trackers {
  return {
    schemaVersion: 1,
    hp: { current: null, temp: null },
    slotsSpent: {},
    featureUses: {},
    hitDiceSpent: 0,
    deathSaves: { success: 0, fail: 0 },
  };
}

export function parseTrackers(text: string): Trackers {
  try {
    const r = TrackersSchema.safeParse(JSON.parse(text));
    return r.success ? r.data : emptyTrackers();
  } catch {
    return emptyTrackers();
  }
}

export function serialiseTrackers(t: Trackers): string {
  return JSON.stringify(t, null, 2) + "\n";
}

/** The key a feature's uses are tracked under. */
export const featureKey = (f: Pick<Feature, "group" | "name">) => `${f.group}/${f.name}`;

/** Number of hit dice in "3d8" (or "2d8 + 1d10"). */
export function hitDiceCount(hitDice: string | null): number {
  if (!hitDice) return 0;
  return [...hitDice.matchAll(/(\d+)\s*d\s*\d+/gi)].reduce((a, m) => a + Number(m[1]), 0);
}

/** Long rest: full HP, no temp HP, all slots, all hit dice, every feature's uses, death saves cleared. */
export function longRest(t: Trackers, sheet: Sheet): Trackers {
  return {
    ...t,
    hp: { current: sheet.combat.maxHp, temp: null },
    slotsSpent: {},
    featureUses: {},
    hitDiceSpent: 0,
    deathSaves: { success: 0, fail: 0 },
  };
}

/** Short rest: features that come back on a short rest. */
export function shortRest(t: Trackers, sheet: Sheet): Trackers {
  const short = new Set((sheet.features ?? []).filter((f) => f.uses?.per === "short").map(featureKey));
  return {
    ...t,
    featureUses: Object.fromEntries(Object.entries(t.featureUses).filter(([k]) => !short.has(k))),
  };
}
