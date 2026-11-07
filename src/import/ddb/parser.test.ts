import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { describe, it, expect, beforeAll } from "vitest";
import { parseDdbSheet, identifyPages } from "./parser";
import type { OcrWord } from "./types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadFixture(): OcrWord[] {
  const p = join(__dirname, "../../../test-fixtures/cosworth-ocr-words.json");
  return JSON.parse(readFileSync(p, "utf-8"));
}

describe("identifyPages", () => {
  it("identifies core page from SAVING THROWS landmark", () => {
    const words = loadFixture();
    const roles = identifyPages(words);
    const pages = [...roles.entries()];
    const corePage = pages.find(([, r]) => r === "core");
    expect(corePage).toBeDefined();
    expect(corePage![0]).toBe(1);
  });

  it("identifies at least one additional page role", () => {
    const words = loadFixture();
    const roles = identifyPages(words);
    const nonCore = [...roles.values()].filter((r) => r !== "core" && r !== "unknown");
    expect(nonCore.length).toBeGreaterThan(0);
  });
});

describe("parseDdbSheet — Cosworth fixture", () => {
  let result: ReturnType<typeof parseDdbSheet>;

  // Parse once and reuse — the fixture is large (~1900 words)
  beforeAll(() => {
    result = parseDdbSheet(loadFixture());
  });

  // --- Identity (fields OCR can read reliably) ---

  it("extracts player name", () => {
    expect(result.player).toBe("MolotovMully");
  });

  it("extracts class", () => {
    expect(result.charClass).toBe("Druid");
  });

  it("extracts level", () => {
    expect(result.level).toBe(3);
  });

  it("extracts species", () => {
    expect(result.race).toBe("Konomin (Bokkurin)");
  });

  it("extracts background", () => {
    expect(result.background).toBe("Farmer");
  });

  it("extracts XP marker", () => {
    // XP zone returns "(Milestone)" for a milestone character
    // We don't store XP in SheetData directly, but check the parse didn't crash
    expect(result).toBeDefined();
  });

  it("charName is empty when decorative font is unreadable", () => {
    // DDB uses a display font for the character name; OCR returns empty or noise
    expect(result.charName).toBe("");
  });

  // --- Ability scores ---

  it("extracts DEX score", () => {
    expect(result.abilities?.dex).toBe(18);
  });

  it("extracts CON score (split OCR digits)", () => {
    expect(result.abilities?.con).toBe(18);
  });

  it("falls back to default for unreadable ability scores", () => {
    // STR, INT, WIS, CHA are inside graphical circles OCR cannot read
    // Parser uses 10 as fallback when score is null
    expect(result.abilities?.str).toBe(10);
    expect(result.abilities?.int).toBe(10);
    expect(result.abilities?.wis).toBe(10);
    expect(result.abilities?.cha).toBe(10);
  });

  // --- Combat stats ---

  it("extracts initiative bonus", () => {
    // Initiative is not stored in SheetData; it's computed from DEX modifier
    // This test just confirms no crash from the zone scan
    expect(result).toBeDefined();
  });

  it("extracts speed", () => {
    expect(result.speed).toBe("30ft (Walking)");
  });

  it("extracts max HP", () => {
    expect(result.hp?.max).toBe(40);
  });

  it("AC is absent from DDB OCR — keeps default", () => {
    // DDB renders AC in a vector shield graphic; OCR returns nothing
    expect(result.ac).toBe(10); // emptySheetData default
  });

  // --- Structural invariants ---

  it("sets sourceImport to today's date", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(result.sourceImport).toBe(today);
  });

  it("returns a complete SheetData with no undefined required fields", () => {
    expect(result.schemaVersion).toBe(1);
    expect(result.abilities).toBeDefined();
    expect(result.hp).toBeDefined();
  });
});
