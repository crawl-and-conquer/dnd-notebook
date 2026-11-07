/**
 * Pure functions that map OCR word output from a D&D Beyond PDF into SheetData.
 * Layout assumptions are based on the DDB 2024 character sheet (5-page export).
 * All coordinates are in PDF points (top-left origin, 1 pt ≈ 1/72 inch).
 */
import type { OcrWord, DdbPageRole } from "./types";
import type { SheetData } from "../../model/sheet";
import { emptySheetData } from "../../model/sheet";
import type { AbilityKey } from "../../model/sheet";

// ---------------------------------------------------------------------------
// Low-level spatial helpers
// ---------------------------------------------------------------------------

function wordsOnPage(words: OcrWord[], page: number): OcrWord[] {
  return words.filter((w) => w.page === page);
}

/** All words whose bounding box overlaps the given rectangle. */
function wordsInBox(
  words: OcrWord[],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): OcrWord[] {
  return words.filter(
    (w) =>
      w.x < x1 && w.x + w.w > x0 &&
      w.y < y1 && w.y + w.h > y0,
  );
}

/** Collect the words in a region and join them into a trimmed string. */
function textIn(words: OcrWord[], x0: number, y0: number, x1: number, y1: number): string {
  return wordsInBox(words, x0, y0, x1, y1)
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((w) => w.str)
    .join(" ")
    .trim();
}

// ---------------------------------------------------------------------------
// Page identification
// ---------------------------------------------------------------------------

const PAGE_LANDMARKS: { label: string; role: DdbPageRole }[] = [
  { label: "SAVING THROWS", role: "core" },
  { label: "SKILLS", role: "core" },
  { label: "FEATURES & TRAITS", role: "features" },
  { label: "CHARACTER BACKSTORY", role: "details" },
  { label: "ALLIES & ORGANIZATIONS", role: "details" },
  { label: "SPELLCASTING CLASS", role: "spells" },
  { label: "SPELLS", role: "spells" },
];

export function identifyPages(words: OcrWord[]): Map<number, DdbPageRole> {
  const pageCount = Math.max(...words.map((w) => w.page), 0);
  const roles = new Map<number, DdbPageRole>();
  for (let p = 1; p <= pageCount; p++) {
    const pageText = wordsOnPage(words, p)
      .map((w) => w.str.toUpperCase())
      .join(" ");
    let role: DdbPageRole = "unknown";
    for (const { label, role: r } of PAGE_LANDMARKS) {
      if (pageText.includes(label.toUpperCase())) { role = r; break; }
    }
    roles.set(p, role);
  }
  return roles;
}

// ---------------------------------------------------------------------------
// Identity fields (page header area, same on every DDB page)
// ---------------------------------------------------------------------------

// DDB header has two value rows (top-left origin, PDF points):
//   Row 1 y≈42–62: class+level, player name
//   Row 2 y≈65–88: species, background, XP
// Labels sit below each value row and are excluded by the y1 bound.
// charName uses a decorative display font; OCR rarely reads it reliably.
interface HeaderZone {
  field: keyof DdbIdentity;
  x0: number; y0: number; x1: number; y1: number;
  minConf?: number;
}

const HEADER_ZONES: HeaderZone[] = [
  { field: "charName",   x0: 20,  y0: 50, x1: 265, y1: 90, minConf: 60 },
  { field: "classLevel", x0: 265, y0: 42, x1: 465, y1: 63 },
  { field: "player",     x0: 465, y0: 42, x1: 576, y1: 63 },
  { field: "species",    x0: 265, y0: 70, x1: 380, y1: 88 },
  { field: "background", x0: 380, y0: 70, x1: 470, y1: 88 },
  { field: "xp",         x0: 470, y0: 70, x1: 598, y1: 88 },
];

interface DdbIdentity {
  charName: string;
  classLevel: string;
  player: string;
  species: string;
  background: string;
  xp: string;
}

function parseIdentity(words: OcrWord[]): DdbIdentity {
  const id: DdbIdentity = {
    charName: "", classLevel: "", player: "", species: "", background: "", xp: "",
  };
  for (const zone of HEADER_ZONES) {
    const src = zone.minConf != null ? words.filter((w) => w.conf >= zone.minConf!) : words;
    const text = textIn(src, zone.x0, zone.y0, zone.x1, zone.y1);
    id[zone.field] = text || "";
  }
  return id;
}

// ---------------------------------------------------------------------------
// Ability scores (left column, page 1)
// Confirmed from fixture: score digit(s) appear BELOW each label.
// Label y-positions (fixture-calibrated, top-left origin):
//   STR≈154, DEX≈231, CON≈307, INT≈384, WIS≈461, CHA≈537
// Scores are ~10–15 pt below the label; multi-char scores (e.g. "18") may
// split into two OCR words whose digits are concatenated after stripping
// non-digits.  Values must be 1–30 (D&D ability score range) to be accepted.
// ---------------------------------------------------------------------------

const ABILITY_Y: Record<AbilityKey, number> = {
  str: 154, dex: 231, con: 307, int: 384, wis: 461, cha: 537,
};
const ABILITY_X0 = 15;
const ABILITY_X1 = 110;

function parseAbilities(
  words: OcrWord[],
): Record<AbilityKey, number | null> {
  const result = {} as Record<AbilityKey, number | null>;
  for (const [key, labelY] of Object.entries(ABILITY_Y) as [AbilityKey, number][]) {
    // Score is BELOW the label (confirmed from OCR fixture)
    const scoreText = textIn(words, ABILITY_X0, labelY + 2, ABILITY_X1, labelY + 40)
      .replace(/[^0-9]/g, "")
      .trim();
    const scoreNum = parseInt(scoreText, 10);
    result[key] = (!isNaN(scoreNum) && scoreNum >= 1 && scoreNum <= 30) ? scoreNum : null;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Saving throw proficiencies (column at x≈114–185, y≈139–208)
// Labels: Strength, Dexterity, Constitution, Intelligence, Wisdom, Charisma
// Proficiency indicator appears to the LEFT of the name as "●" or similar.
// We detect proficiency by looking for a filled marker in the x≈114–130 zone.
// ---------------------------------------------------------------------------

const SAVE_LABEL_Y: Record<AbilityKey, number> = {
  str: 139, dex: 153, con: 166, int: 180, wis: 193, cha: 207,
};

function parseSaveProficiencies(words: OcrWord[]): AbilityKey[] {
  const profs: AbilityKey[] = [];
  for (const [key, labelY] of Object.entries(SAVE_LABEL_Y) as [AbilityKey, number][]) {
    // Proficiency marker (a filled dot or +N) lives left of the label (x≈108–130)
    const marker = textIn(words, 108, labelY - 2, 131, labelY + 8);
    // A proficient save has a filled bullet "●" or a positive modifier text
    if (/[●•*+]/.test(marker) || (marker !== "" && marker !== "0" && !marker.startsWith("-"))) {
      profs.push(key);
    }
  }
  return profs;
}

// ---------------------------------------------------------------------------
// Skills (column at x≈114–200, y≈310–550)
// ---------------------------------------------------------------------------

const SKILL_NAMES = [
  "acrobatics", "animal-handling", "arcana", "athletics", "deception",
  "history", "insight", "intimidation", "investigation", "medicine",
  "nature", "perception", "performance", "persuasion", "religion",
  "sleight-of-hand", "stealth", "survival",
] as const;

type SkillName = typeof SKILL_NAMES[number];

const SKILL_LABEL_Y: Record<SkillName, number> = {
  "acrobatics": 309, "animal-handling": 323, "arcana": 336, "athletics": 350,
  "deception": 363, "history": 377, "insight": 390, "intimidation": 404,
  "investigation": 417, "medicine": 431, "nature": 444, "perception": 458,
  "performance": 471, "persuasion": 485, "religion": 498, "sleight-of-hand": 512,
  "stealth": 525, "survival": 539,
};

function parseSkillProficiencies(words: OcrWord[]): SkillName[] {
  const profs: SkillName[] = [];
  for (const skill of SKILL_NAMES) {
    const labelY = SKILL_LABEL_Y[skill];
    const marker = textIn(words, 108, labelY - 2, 131, labelY + 8);
    if (/[●•*+]/.test(marker) || (marker !== "" && marker !== "0" && !marker.startsWith("-"))) {
      profs.push(skill);
    }
  }
  return profs;
}

// ---------------------------------------------------------------------------
// Combat stats (right half of page 1)
// ---------------------------------------------------------------------------

function parseCombatStats(words: OcrWord[]): {
  ac: number | null;
  initiative: string | null;
  speed: string | null;
  proficiencyBonus: number | null;
  maxHp: number | null;
  hitDice: string | null;
} {
  // AC — DDB renders the shield graphic as a vector path; not in OCR output
  const acText = textIn(words, 310, 108, 395, 155);
  const ac = parseInt(acText.replace(/[^0-9]/g, ""), 10);

  // INITIATIVE: "+4" confirmed at (248, 157.5); label is below at y≈191
  const initiativeText = textIn(words, 215, 148, 290, 180);

  // SPEED: "30ft" at (238.5, 393.5), "(Walking)" at (258.5, 393.5)
  const speedText = textIn(words, 215, 393, 310, 418);

  // PROFICIENCY BONUS value not found in OCR (graphical container)
  const profText = textIn(words, 255, 282, 345, 310);
  const prof = parseInt(profText.replace(/[^0-9]/g, ""), 10);

  // Max HP: label "Max HP" at y≈142; value "40" confirmed at (433.5, 158.5)
  const maxHpText = textIn(words, 410, 152, 480, 178);
  const maxHp = parseInt(maxHpText.replace(/[^0-9]/g, ""), 10);

  // HIT DICE: usually not readable from DDB OCR
  const hitDiceText = textIn(words, 415, 220, 505, 255);

  return {
    ac: isNaN(ac) ? null : ac,
    initiative: initiativeText || null,
    speed: speedText || null,
    proficiencyBonus: isNaN(prof) ? null : prof,
    maxHp: isNaN(maxHp) ? null : maxHp,
    hitDice: hitDiceText || null,
  };
}

// ---------------------------------------------------------------------------
// Attacks (table at y≈627–760, x≈220–460)
// Header: NAME, HIT, DAMAGE/TYPE at y≈627
// ---------------------------------------------------------------------------

function parseAttacks(
  words: OcrWord[],
): Array<{ name: string; bonus: string; damage: string }> {
  const attacks: Array<{ name: string; bonus: string; damage: string }> = [];
  // Attack rows appear between y≈635 and y≈760, in 3 columns:
  // Name: x≈220–335,  Bonus: x≈335–370,  Damage: x≈370–460
  const ROW_H = 14;
  const attackWords = wordsInBox(words, 220, 635, 460, 760);
  if (!attackWords.length) return attacks;

  // Group by y-band (row height ~14pt)
  const rows = new Map<number, OcrWord[]>();
  for (const w of attackWords) {
    const band = Math.floor(w.y / ROW_H) * ROW_H;
    if (!rows.has(band)) rows.set(band, []);
    rows.get(band)!.push(w);
  }

  for (const [, row] of [...rows.entries()].sort(([a], [b]) => a - b)) {
    const nameWords = row.filter((w) => w.x < 335 && w.x >= 220);
    const bonusWords = row.filter((w) => w.x >= 335 && w.x < 370);
    const damageWords = row.filter((w) => w.x >= 370 && w.x < 460);
    const name = nameWords.sort((a, b) => a.x - b.x).map((w) => w.str).join(" ").trim();
    const bonus = bonusWords.sort((a, b) => a.x - b.x).map((w) => w.str).join(" ").trim();
    const damage = damageWords.sort((a, b) => a.x - b.x).map((w) => w.str).join(" ").trim();
    if (name) attacks.push({ name, bonus: bonus || "", damage: damage || "" });
  }
  return attacks;
}

// ---------------------------------------------------------------------------
// Spellcasting (page with SPELLS, top area)
// ---------------------------------------------------------------------------

function parseSpellcasting(words: OcrWord[]): {
  ability: string | null;
  saveDc: number | null;
  attackBonus: string | null;
  spellSlots: number[];
} {
  // SPELLCASTING CLASS / ability header area
  const abilityText = textIn(words, 50, 120, 200, 155);
  const saveDcText = textIn(words, 200, 120, 330, 155);
  const attackBonusText = textIn(words, 330, 120, 460, 155);

  const saveDc = parseInt(saveDcText.replace(/[^0-9]/g, ""), 10);

  // Spell slot rows: "=== 1st LEVEL === N Slots" style text, or slot bubbles
  // The DDB sheet shows slot counts as numbers near "1ST LEVEL", "2ND LEVEL", etc.
  // Look for lines containing level names and extract slot counts
  const slotWords = wordsInBox(words, 15, 155, 600, 400);
  const slotText = slotWords.sort((a, b) => a.y - b.y || a.x - b.x).map((w) => w.str).join(" ");

  // Pattern: numbers near level headings
  const slotPattern = /\b(\d+)\s+Slot[s]?\b/gi;
  const spellSlots: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = slotPattern.exec(slotText)) !== null) {
    spellSlots.push(parseInt(m[1], 10));
  }

  return {
    ability: abilityText || null,
    saveDc: isNaN(saveDc) ? null : saveDc,
    attackBonus: attackBonusText || null,
    spellSlots,
  };
}

// ---------------------------------------------------------------------------
// Spell list (spells page)
// ---------------------------------------------------------------------------

function parseSpells(): Array<{ name: string; level: number; cantrip: boolean; always: boolean; concentration: boolean; ritual: boolean }> {
  // Spell parsing not yet implemented
  return [];
}

// ---------------------------------------------------------------------------
// Details page (backstory, appearance, allies, notes)
// ---------------------------------------------------------------------------

interface DdbDetails {
  backstory: string;
  allies: string;
  appearance: { age: string; height: string; alignment: string };
}

export function parseDetails(words: OcrWord[]): DdbDetails {
  // CHARACTER BACKSTORY section: x≈20–295, y≈120–400
  const backstory = textIn(words, 20, 120, 295, 400);
  // ALLIES & ORGANIZATIONS: x≈300–595, y≈120–400
  const allies = textIn(words, 300, 120, 595, 400);
  // Appearance fields: age, height, alignment (various positions in top area)
  const age = textIn(words, 20, 65, 100, 95);
  const height = textIn(words, 100, 65, 180, 95);
  const alignment = textIn(words, 20, 50, 140, 65);

  return { backstory, allies, appearance: { age, height, alignment } };
}

// ---------------------------------------------------------------------------
// Proficiencies & Training (page 1, x≈440–595, y≈442–620)
// ---------------------------------------------------------------------------

function parseProficiencies(words: OcrWord[]): {
  armour: string;
  weapons: string;
  languages: string;
} {
  const block = textIn(words, 440, 455, 598, 620);
  // Try to split on typical DDB section structure:
  // "Armour: ..." / "Weapons: ..." / "Languages: ..."
  const armourM = block.match(/Armou?r[:\s]+([^\n]+)/i);
  const weaponsM = block.match(/Weapons?[:\s]+([^\n]+)/i);
  const langM = block.match(/Languages?[:\s]+([^\n]+)/i);
  return {
    armour: armourM ? armourM[1].trim() : block,
    weapons: weaponsM ? weaponsM[1].trim() : "",
    languages: langM ? langM[1].trim() : "",
  };
}

// ---------------------------------------------------------------------------
// Coins (page 2, x≈15–55, y≈530–660)
// ---------------------------------------------------------------------------

const COIN_LABEL_Y: Record<string, number> = {
  cp: 534, sp: 564, ep: 592, gp: 621, pp: 650,
};

function parseCoins(words: OcrWord[]): Record<string, number> {
  const coins: Record<string, number> = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
  for (const [coin, labelY] of Object.entries(COIN_LABEL_Y)) {
    // Value appears just ABOVE the coin label (y: labelY-26 to labelY-2)
    const text = textIn(words, 10, labelY - 28, 70, labelY - 2);
    const n = parseInt(text.replace(/[^0-9]/g, ""), 10);
    if (!isNaN(n)) coins[coin] = n;
  }
  return coins;
}

// ---------------------------------------------------------------------------
// Equipment (page 2, x≈60–295, y≈765–... goes across pages)
// ---------------------------------------------------------------------------

function parseEquipment(
  words: OcrWord[],
): Array<{ name: string; qty: number; weight: number }> {
  const items: Array<{ name: string; qty: number; weight: number }> = [];
  // Equipment table header: "EQUIPMENT" at y≈762 on page 2
  // Rows below at y > 770
  const equipWords = wordsInBox(words, 60, 770, 295, 1000);
  if (!equipWords.length) return items;

  const ROW_H = 13;
  const rows = new Map<number, OcrWord[]>();
  for (const w of equipWords) {
    const band = Math.floor(w.y / ROW_H) * ROW_H;
    if (!rows.has(band)) rows.set(band, []);
    rows.get(band)!.push(w);
  }

  for (const [, row] of [...rows.entries()].sort(([a], [b]) => a - b)) {
    const all = row.sort((a, b) => a.x - b.x);
    const text = all.map((w) => w.str).join(" ").trim();
    if (!text) continue;
    // Pattern: "Name (qty) weight lb." or just "Name"
    const m = text.match(/^(.+?)\s+\((\d+)\)\s+([\d.]+)\s*lb/i);
    if (m) {
      items.push({ name: m[1].trim(), qty: parseInt(m[2], 10), weight: parseFloat(m[3]) });
    } else {
      items.push({ name: text, qty: 1, weight: 0 });
    }
  }
  return items;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function parseDdbSheet(words: OcrWord[]): Partial<SheetData> {
  const pageRoles = identifyPages(words);

  let corePage = -1;
  let detailsPage = -1;
  let spellsPage = -1;
  let featuresPage = -1;

  for (const [page, role] of pageRoles) {
    if (role === "core" && corePage === -1) corePage = page;
    if (role === "details" && detailsPage === -1) detailsPage = page;
    if (role === "spells" && spellsPage === -1) spellsPage = page;
    if (role === "features" && featuresPage === -1) featuresPage = page;
  }

  const sheet = emptySheetData();
  const today = new Date().toISOString().slice(0, 10);

  if (corePage !== -1) {
    const coreWords = wordsOnPage(words, corePage);
    const identity = parseIdentity(coreWords);
    sheet.charName = identity.charName;
    sheet.player = identity.player;
    // "Druid3" or "Druid 3" → class "Druid", level 3
    if (identity.classLevel) {
      const m = identity.classLevel.match(/^(.*\D)\s*(\d+)$/);
      if (m) { sheet.charClass = m[1].trim(); sheet.level = parseInt(m[2], 10); }
      else { sheet.charClass = identity.classLevel; }
    }
    sheet.race = identity.species;
    sheet.background = identity.background;

    const abilities = parseAbilities(coreWords);
    sheet.abilities = {
      str: abilities.str ?? 10,
      dex: abilities.dex ?? 10,
      con: abilities.con ?? 10,
      int: abilities.int ?? 10,
      wis: abilities.wis ?? 10,
      cha: abilities.cha ?? 10,
    };

    sheet.saveProficiencies = parseSaveProficiencies(coreWords) as AbilityKey[];
    sheet.skillProficiencies = parseSkillProficiencies(coreWords) as string[];

    const combat = parseCombatStats(coreWords);
    if (combat.ac !== null) sheet.ac = combat.ac;
    if (combat.speed) sheet.speed = combat.speed;
    if (combat.proficiencyBonus !== null) sheet.proficiencyBonus = combat.proficiencyBonus;
    if (combat.maxHp !== null) sheet.hp = { max: combat.maxHp };
    if (combat.hitDice) sheet.hitDice = combat.hitDice;

    const attacks = parseAttacks(coreWords);
    sheet.attacks = attacks;

    const prof = parseProficiencies(coreWords);
    sheet.trainedArmour = prof.armour;
    sheet.trainedWeapons = prof.weapons;
    sheet.languages = prof.languages;
  }

  sheet.features = [];

  // Details page fields (backstory, allies, appearance) will map to SheetData
  // extensions in a later milestone; skip for now.

  if (spellsPage !== -1) {
    const spellWords = wordsOnPage(words, spellsPage);
    const sc = parseSpellcasting(spellWords);
    if (sc.ability || sc.saveDc || sc.attackBonus) {
      sheet.spellcasting = {
        ability: sc.ability ?? "",
        saveDc: sc.saveDc ?? 0,
        attackBonus: sc.attackBonus ?? "",
      };
    }
    if (sc.spellSlots.length) sheet.spellSlots = sc.spellSlots;
    sheet.spells = parseSpells();
  }

  // Coins are on the features/equipment page (page 2 in DDB layout)
  const coinPageNum = [...pageRoles.entries()]
    .find(([, r]) => r === "features" || r === "core")?.[0] ?? corePage;
  if (coinPageNum !== -1) {
    const coinWords = wordsOnPage(words, 2); // DDB always puts coins on page 2
    const coins = parseCoins(coinWords);
    sheet.coins = { cp: coins.cp, sp: coins.sp, ep: coins.ep, gp: coins.gp, pp: coins.pp };
    sheet.items = parseEquipment(coinWords);
  }

  sheet.sourceImport = today;
  return sheet;
}
