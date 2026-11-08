import { describe, expect, it } from "vitest";
import fixture from "../../../test-fixtures/cosworth-fields.json";
import { parseDdbFields, type PdfField } from "./fields";
import { peopleNames, routeDetails } from "./route";

// Fields extracted from docs/reference/cosworth-ddb-sheet.pdf (SPEC: Fixture expectations).
const fields = fixture as PdfField[];
const { sheet, found, unread } = parseDdbFields(fields);

describe("Cosworth's D&D Beyond sheet", () => {
  it("finds every part of the PDF", () => {
    expect(found).toEqual({ core: true, features: true, details: true, spells: true });
    expect(unread).toEqual([]);
  });

  it("reads the identity", () => {
    expect(sheet.identity).toMatchObject({
      name: "Cosworth",
      player: "MolotovMully",
      classLevel: "Druid 3",
      species: "Konomin (Bokkurin)",
      background: "Farmer",
      xp: "(Milestone)",
      alignment: "Chaotic Good",
      age: "10",
      height: "3ft 2",
    });
  });

  it("reads abilities and saves", () => {
    const a = sheet.abilities;
    expect([a.str.score, a.str.mod]).toEqual([9, -1]);
    expect([a.dex.score, a.dex.mod]).toEqual([18, 4]);
    expect([a.con.score, a.con.mod]).toEqual([18, 4]);
    expect([a.int.score, a.int.mod]).toEqual([12, 1]);
    expect([a.wis.score, a.wis.mod]).toEqual([20, 5]);
    expect([a.cha.score, a.cha.mod]).toEqual([15, 2]);
    expect(a.int).toMatchObject({ save: 3, saveProficient: true });
    expect(a.wis).toMatchObject({ save: 7, saveProficient: true });
    expect(a.str.saveProficient || a.dex.saveProficient || a.con.saveProficient || a.cha.saveProficient).toBe(false);
  });

  it("reads combat values", () => {
    expect(sheet.combat).toMatchObject({
      ac: 17,
      initiative: 4,
      speed: "30 ft. (Walking)",
      proficiency: 2,
      maxHp: 40,
      hitDice: "3d8",
    });
  });

  it("reads the proficient skills and passives", () => {
    const prof = sheet.skills.filter((s) => s.proficient).map((s) => [s.name, s.mod]);
    expect(prof).toEqual([
      ["Animal Handling", 7],
      ["Arcana", 3],
      ["Medicine", 7],
      ["Nature", 3],
      ["Survival", 7],
    ]);
    expect(sheet.skills.every((s) => s.mod !== null)).toBe(true);
    expect(sheet.passives).toEqual({ perception: 15, insight: 15, investigation: 11 });
  });

  it("reads the attacks", () => {
    expect(sheet.attacks?.map((a) => [a.name, a.hit, a.damage])).toEqual([
      ["Staff", "+1", "1d6-1 Bludgeoning"],
      ["Shillelagh", "+7", "1d8+5 Bludgeoning"],
      ["Shocking Grasp", "+7", "1d8 Lightning"],
      ["Unarmed Strike", "+1", "0 Bludgeoning"],
    ]);
  });

  it("reads proficiencies, actions and features with their uses", () => {
    expect(sheet.proficiencies).toEqual({
      armour: ["Light Armor", "Medium Armor", "Shields"],
      weapons: ["Martial Weapons", "Simple Weapons"],
      tools: ["Carpenter's Tools", "Herbalism Kit"],
      languages: ["Common", "Druidic"],
    });
    expect(sheet.actions?.map((a) => a.group)).toEqual(["Actions", "Bonus Actions"]);
    const groups = [...new Set(sheet.features?.map((f) => f.group))];
    expect(groups).toEqual(["Druid", "Konomin (Bokkurin)", "Feats"]);
    const wild = sheet.features?.find((f) => f.name === "Wild Shape");
    expect(wild).toMatchObject({ source: "PHB-2024 80", uses: { max: 2, per: "long" } });
    expect(wild?.text).toContain("max CR of 1/4");
    expect(sheet.features?.find((f) => f.name === "Sturdy Shell")?.uses).toEqual({ max: 2, per: "long" });
  });

  it("reads spellcasting, slots and the spell list", () => {
    const sc = sheet.spellcasting!;
    expect(sc).toMatchObject({ class: "Druid", ability: "WIS", saveDc: 15, attack: 7 });
    expect(sc.slots).toEqual({ "1": 4, "2": 2 });
    expect(sc.spells.filter((s) => s.level === 0).map((s) => s.name)).toEqual([
      "Shillelagh",
      "Guidance",
      "Shocking Grasp",
    ]);
    const locate = sc.spells.find((s) => s.name === "Locate Animals or Plants")!;
    expect(locate).toMatchObject({ ritual: true, level: 2 });
    expect(sc.spells.find((s) => s.name === "Faerie Fire")).toMatchObject({ concentration: true, level: 1 });
  });

  it("reads coins and equipment", () => {
    expect(sheet.equipment?.coins).toEqual({ cp: 0, sp: 68, ep: 0, gp: 0, pp: 0 });
    expect(sheet.equipment?.items).toHaveLength(13);
    expect(sheet.equipment?.items[0]).toEqual({ name: "Shield", qty: 1, weight: "6 lb." });
  });

  it("routes the backstory to the right tabs", () => {
    const r = routeDetails(sheet);
    expect(r.backstory).toContain("Family man, just a fun little acorn");
    expect(r.likes).toEqual(["loves nature, family and adventure with friends"]);
    expect(r.dislikes).toEqual(["hates people nosing on his heartseed"]);
    expect(r.people[0]).toContain("Ash-seven");
    expect(peopleNames(r.people)).toEqual(["Ash-Seven", "Benjamin", "Jerimiah"]);
    expect(r.glance.map((g) => g.label)).toEqual(expect.arrayContaining(["Age", "Height", "Alignment"]));
  });
});

describe("a sheet with a page missing", () => {
  it("leaves everything from that page null and never guesses", () => {
    const parsed = parseDdbFields(fields.filter((f) => f.page !== 1));
    expect(parsed.found.core).toBe(false);
    expect(parsed.sheet.abilities.str).toEqual({ score: null, mod: null, save: null, saveProficient: false });
    expect(parsed.sheet.combat.ac).toBeNull();
    expect(parsed.sheet.combat.maxHp).toBeNull();
    expect(parsed.sheet.attacks).toBeNull();
    expect(parsed.unread.map((u) => u.path)).toEqual(
      expect.arrayContaining(["abilities.str.score", "combat.ac", "combat.maxHp"]),
    );
    // Identity is repeated on page 2, so the name still comes through.
    expect(parsed.sheet.identity.name).toBe("Cosworth");
  });

  it("without page 2 has no features or coins", () => {
    const parsed = parseDdbFields(fields.filter((f) => f.page !== 2));
    expect(parsed.sheet.features).toBeNull();
    expect(parsed.sheet.equipment).toBeNull();
    expect(parsed.sheet.combat.ac).toBe(17);
  });
});
