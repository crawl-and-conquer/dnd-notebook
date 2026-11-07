import { z } from "zod";

export const SHEET_SCHEMA_VERSION = 1 as const;
export const TRACKERS_SCHEMA_VERSION = 1 as const;

export type SheetPageType = "core-left" | "core-right" | "features" | "spells-kit" | "spell-list";
export const SHEET_PAGE_TYPES: SheetPageType[] = [
  "core-left",
  "core-right",
  "features",
  "spells-kit",
  "spell-list",
];

// Ability names (short)
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

export const SKILLS: Array<{ id: string; label: string; ability: AbilityKey }> = [
  { id: "acrobatics", label: "Acrobatics", ability: "dex" },
  { id: "animal-handling", label: "Animal Handling", ability: "wis" },
  { id: "arcana", label: "Arcana", ability: "int" },
  { id: "athletics", label: "Athletics", ability: "str" },
  { id: "deception", label: "Deception", ability: "cha" },
  { id: "history", label: "History", ability: "int" },
  { id: "insight", label: "Insight", ability: "wis" },
  { id: "intimidation", label: "Intimidation", ability: "cha" },
  { id: "investigation", label: "Investigation", ability: "int" },
  { id: "medicine", label: "Medicine", ability: "wis" },
  { id: "nature", label: "Nature", ability: "int" },
  { id: "perception", label: "Perception", ability: "wis" },
  { id: "performance", label: "Performance", ability: "cha" },
  { id: "persuasion", label: "Persuasion", ability: "cha" },
  { id: "religion", label: "Religion", ability: "int" },
  { id: "sleight-of-hand", label: "Sleight of Hand", ability: "dex" },
  { id: "stealth", label: "Stealth", ability: "dex" },
  { id: "survival", label: "Survival", ability: "wis" },
];

export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function modStr(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

const AbilitiesSchema = z.object({
  str: z.number().int().min(1).max(30),
  dex: z.number().int().min(1).max(30),
  con: z.number().int().min(1).max(30),
  int: z.number().int().min(1).max(30),
  wis: z.number().int().min(1).max(30),
  cha: z.number().int().min(1).max(30),
});

const AttackSchema = z.object({
  name: z.string(),
  bonus: z.string(), // e.g. "+7"
  damage: z.string(), // e.g. "1d8 + 5 bludgeoning"
});

const FeatureUsesSchema = z.object({
  max: z.number().int().min(1),
  restoreOn: z.enum(["long", "short"]),
  // partial restore on the other rest
  partialRestoreOn: z.enum(["long", "short"]).optional(),
  partialAmount: z.number().int().optional(),
});

const FeatureSchema = z.object({
  id: z.string().min(1),
  source: z.string(), // "Druid", "Konomin (Bokkurin)", "Feats"
  name: z.string(),
  description: z.string().default(""),
  note: z.string().default(""),
  uses: FeatureUsesSchema.optional(),
});

const SpellSchema = z.object({
  name: z.string(),
  level: z.number().int().min(0).max(9),
  cantrip: z.boolean().default(false),
  always: z.boolean().default(false),
  concentration: z.boolean().default(false),
  ritual: z.boolean().default(false),
});

const CoinSchema = z.object({
  cp: z.number().int().default(0),
  sp: z.number().int().default(0),
  ep: z.number().int().default(0),
  gp: z.number().int().default(0),
  pp: z.number().int().default(0),
});

const ItemSchema = z.object({
  name: z.string(),
  qty: z.number().int().default(1),
  weight: z.number().default(0),
});

export const SheetDataSchema = z.object({
  schemaVersion: z.literal(SHEET_SCHEMA_VERSION),
  charName: z.string().default(""),
  charClass: z.string().default(""),
  level: z.number().int().min(1).max(20).default(1),
  race: z.string().default(""),
  background: z.string().default(""),
  player: z.string().default(""),

  abilities: AbilitiesSchema,
  saveProficiencies: z.array(z.string()).default([]),

  ac: z.number().int().default(10),
  speed: z.string().default("30 ft"),
  proficiencyBonus: z.number().int().default(2),
  hp: z.object({ max: z.number().int() }),
  hitDice: z.string().default("1d8"),

  skillProficiencies: z.array(z.string()).default([]),
  skillExpertise: z.array(z.string()).default([]),

  trainedArmour: z.string().default(""),
  trainedWeapons: z.string().default(""),
  languages: z.string().default(""),

  attacks: z.array(AttackSchema).default([]),

  features: z.array(FeatureSchema).default([]),

  spellcasting: z
    .object({
      ability: z.string(),
      saveDc: z.number().int(),
      attackBonus: z.string(),
    })
    .optional(),
  spellSlots: z.array(z.number().int()).default([]),
  spells: z.array(SpellSchema).default([]),

  coins: CoinSchema.default({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }),
  items: z.array(ItemSchema).default([]),
  carryCapacity: z.number().optional(),
  carryWeight: z.number().optional(),

  sourceImport: z.string().optional(),
});

export type SheetData = z.infer<typeof SheetDataSchema>;

export const TrackersSchema = z.object({
  schemaVersion: z.literal(TRACKERS_SCHEMA_VERSION),
  currentHp: z.number().int(),
  tempHp: z.number().int().default(0),
  usedSpellSlots: z.array(z.number().int()).default([]),
  usedFeatures: z.record(z.string(), z.number().int()).default({}),
  usedHitDice: z.number().int().default(0),
  deathSavesSuccess: z.number().int().min(0).max(3).default(0),
  deathSavesFail: z.number().int().min(0).max(3).default(0),
  overrides: z.record(z.string(), z.unknown()).default({}),
});

export type TrackerState = z.infer<typeof TrackersSchema>;

export function emptyTrackers(maxHp = 0): TrackerState {
  return {
    schemaVersion: TRACKERS_SCHEMA_VERSION,
    currentHp: maxHp,
    tempHp: 0,
    usedSpellSlots: [],
    usedFeatures: {},
    usedHitDice: 0,
    deathSavesSuccess: 0,
    deathSavesFail: 0,
    overrides: {},
  };
}

export function emptySheetData(): SheetData {
  return SheetDataSchema.parse({
    schemaVersion: SHEET_SCHEMA_VERSION,
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    hp: { max: 0 },
  });
}

export function parseSheetData(text: string): SheetData {
  return SheetDataSchema.parse(JSON.parse(text));
}

export function parseTrackers(text: string, maxHp: number): TrackerState {
  const raw = JSON.parse(text);
  const result = TrackersSchema.safeParse(raw);
  if (result.success) return result.data;
  return emptyTrackers(maxHp);
}

export function serialiseSheet(data: SheetData): string {
  return JSON.stringify(data, null, 2);
}

export function serialiseTrackers(t: TrackerState): string {
  return JSON.stringify(t, null, 2);
}

/** Skill bonus for a given skill. */
export function skillBonus(
  skill: (typeof SKILLS)[number],
  abilities: SheetData["abilities"],
  proficiencyBonus: number,
  proficiencies: string[],
  expertise: string[],
): number {
  const base = abilityMod(abilities[skill.ability]);
  if (expertise.includes(skill.id)) return base + proficiencyBonus * 2;
  if (proficiencies.includes(skill.id)) return base + proficiencyBonus;
  return base;
}
