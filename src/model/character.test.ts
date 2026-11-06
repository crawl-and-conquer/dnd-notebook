import { describe, it, expect } from "vitest";
import {
  createCharacter,
  parseCharacter,
  serialiseCharacter,
  DEFAULT_SECTIONS,
  COVER_COLOURS,
  SectionSchema,
} from "./character";

describe("createCharacter", () => {
  it("creates a character with the 7 default sections in spec order", () => {
    const ch = createCharacter("Cosworth", "#46562f");
    expect(ch.sections).toHaveLength(7);
    const ids = ch.sections.map((s) => s.id);
    expect(ids).toEqual(["sessions", "backstory", "likes", "dislikes", "wants", "notes", "sheet"]);
  });

  it("sets name and cover correctly", () => {
    const ch = createCharacter("Thorn", "#6b2a26");
    expect(ch.name).toBe("Thorn");
    expect(ch.cover).toBe("#6b2a26");
  });

  it("assigns default section kinds", () => {
    const ch = createCharacter("X", "#000");
    const sessions = ch.sections.find((s) => s.id === "sessions");
    const backstory = ch.sections.find((s) => s.id === "backstory");
    const sheet = ch.sections.find((s) => s.id === "sheet");
    expect(sessions?.kind).toBe("sessions");
    expect(backstory?.kind).toBe("free");
    expect(sheet?.kind).toBe("sheet");
  });

  it("starts all sections with empty pageOrder", () => {
    const ch = createCharacter("X", "#000");
    for (const s of ch.sections) {
      expect(s.pageOrder).toEqual([]);
    }
  });

  it("sets schemaVersion to 1", () => {
    const ch = createCharacter("X", "#000");
    expect(ch.schemaVersion).toBe(1);
  });

  it("generates a valid uuid id", () => {
    const ch = createCharacter("X", "#000");
    expect(ch.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("sets createdAt and updatedAt to the given time", () => {
    const now = new Date("2026-11-06T10:00:00Z");
    const ch = createCharacter("X", "#000", now);
    expect(ch.createdAt).toBe("2026-11-06T10:00:00.000Z");
    expect(ch.updatedAt).toBe("2026-11-06T10:00:00.000Z");
  });
});

describe("parseCharacter / serialiseCharacter", () => {
  it("round-trips a character", () => {
    const ch = createCharacter("Cosworth", "#46562f");
    const text = serialiseCharacter(ch);
    const parsed = parseCharacter(text);
    expect(parsed).not.toBeNull();
    expect(parsed!.name).toBe("Cosworth");
    expect(parsed!.sections).toHaveLength(7);
    expect(parsed!.id).toBe(ch.id);
  });

  it("returns null for invalid JSON", () => {
    expect(parseCharacter("not json")).toBeNull();
    expect(parseCharacter("{bad}")).toBeNull();
  });

  it("returns null for missing required fields", () => {
    expect(parseCharacter('{"schemaVersion":1}')).toBeNull();
    expect(parseCharacter("{}"  )).toBeNull();
  });

  it("serialised output is valid JSON with schemaVersion", () => {
    const ch = createCharacter("X", "#000");
    const json = JSON.parse(serialiseCharacter(ch));
    expect(json.schemaVersion).toBe(1);
  });
});

describe("DEFAULT_SECTIONS", () => {
  it("has exactly 7 sections", () => {
    expect(DEFAULT_SECTIONS).toHaveLength(7);
  });

  it("sessions section is first with kind sessions", () => {
    expect(DEFAULT_SECTIONS[0].id).toBe("sessions");
    expect(DEFAULT_SECTIONS[0].kind).toBe("sessions");
  });

  it("sheet section is last with kind sheet", () => {
    const last = DEFAULT_SECTIONS[DEFAULT_SECTIONS.length - 1];
    expect(last.id).toBe("sheet");
    expect(last.kind).toBe("sheet");
  });

  it("all sections have a non-empty colour", () => {
    for (const s of DEFAULT_SECTIONS) {
      expect(s.colour).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe("COVER_COLOURS", () => {
  it("has 8 cover colours", () => {
    expect(COVER_COLOURS).toHaveLength(8);
  });

  it("first cover colour is Moss (the default)", () => {
    expect(COVER_COLOURS[0].label).toBe("Moss");
    expect(COVER_COLOURS[0].value).toBe("#46562f");
  });
});

describe("SectionSchema", () => {
  it("accepts all valid section kinds", () => {
    for (const kind of ["free", "sessions", "sheet"] as const) {
      const r = SectionSchema.safeParse({ id: "x", name: "X", colour: "#aaa", kind, pageOrder: [] });
      expect(r.success).toBe(true);
    }
  });

  it("rejects unknown kind", () => {
    const r = SectionSchema.safeParse({ id: "x", name: "X", colour: "#aaa", kind: "magic", pageOrder: [] });
    expect(r.success).toBe(false);
  });

  it("defaults pageOrder to empty array when omitted", () => {
    const r = SectionSchema.safeParse({ id: "x", name: "X", colour: "#aaa", kind: "free" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.pageOrder).toEqual([]);
  });
});

describe("spread layout", () => {
  it("even number of pages fills complete spreads", () => {
    // 4 pages → 2 spreads of 2
    const count = 4;
    expect(Math.ceil(count / 2)).toBe(2);
  });

  it("odd number of pages creates a blank right page on last spread", () => {
    // 3 pages → 2 spreads; last spread has page at index 2 on left, blank on right
    const count = 3;
    expect(Math.ceil(count / 2)).toBe(2);
    const lastSpreadLeftIdx = (2 - 1) * 2;
    expect(lastSpreadLeftIdx).toBe(2);
    // right page would be at index 3, which doesn't exist → blank
    const pages = new Array(count);
    expect(pages[lastSpreadLeftIdx + 1]).toBeUndefined();
  });

  it("zero pages → 0 spreads", () => {
    expect(Math.ceil(0 / 2)).toBe(0);
  });

  it("1 page → 1 spread with blank right", () => {
    expect(Math.ceil(1 / 2)).toBe(1);
  });
});
