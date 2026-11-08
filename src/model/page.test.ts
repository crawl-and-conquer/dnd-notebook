import { describe, expect, it } from "vitest";
import {
  createPage,
  comparePageFiles,
  fileNumber,
  nextFileNumber,
  pageFileName,
  parsePage,
  serialisePage,
  slugify,
  uniquePageFileName,
  type Page,
} from "./page";

const T = "2026-10-28T09:15:00.000Z";

const fullPage: Page = {
  schemaVersion: 1,
  id: "p1",
  title: "Faceted navigation audit",
  section: "sessions",
  createdAt: T,
  updatedAt: T,
  elements: [
    {
      id: "s1",
      type: "stroke",
      tool: "pen",
      points: [0, 0, 0.5, 10, 10, 0.6],
      colour: "#F4F7FF",
      width: 4,
      opacity: 1,
      x: 0,
      y: 0,
      rotation: 0,
      createdAt: T,
      updatedAt: T,
    },
    {
      id: "l1",
      type: "line",
      points: [0, 0, 100, 0],
      colour: "#F4F7FF",
      width: 2,
      x: 20,
      y: 20,
      rotation: 0,
      createdAt: T,
      updatedAt: T,
    },
    {
      id: "a1",
      type: "arrow",
      points: [0, 0, 80, 0],
      colour: "#F4F7FF",
      width: 2,
      x: 700,
      y: 180,
      rotation: 0,
      createdAt: T,
      updatedAt: T,
    },
    {
      id: "r1",
      type: "rect",
      w: 160,
      h: 80,
      colour: "#F4F7FF",
      width: 2,
      dashed: false,
      x: 540,
      y: 140,
      rotation: 0,
      createdAt: T,
      updatedAt: T,
    },
    {
      id: "e1",
      type: "ellipse",
      w: 60,
      h: 40,
      colour: "#FF5C86",
      width: 4,
      dashed: true,
      x: 900,
      y: 260,
      rotation: 0,
      createdAt: T,
      updatedAt: T,
    },
    {
      id: "t1",
      type: "text",
      text: "Filter URLs are getting crawled",
      w: 360,
      fontSize: 17,
      colour: "#F4F7FF",
      heading: false,
      font: "hand",
      x: 60,
      y: 140,
      rotation: 0,
      createdAt: T,
      updatedAt: T,
    },
    {
      id: "c1",
      type: "checklist",
      w: 340,
      x: 540,
      y: 396,
      rotation: 0,
      createdAt: T,
      updatedAt: T,
      items: [
        { id: "i1", text: "Pull facet URLs from the crawl", done: true },
        { id: "i2", text: "Brief dev on noindex vs canonical", done: false },
      ],
      colour: "#2b2622",
      font: "hand",
    },
    {
      id: "img1",
      type: "image",
      asset: "assets/abc123.png",
      w: 400,
      h: 220,
      x: 60,
      y: 360,
      rotation: -1.2,
      frame: "print" as const,
      filmLook: true,
      caption: "",
      stamp: "",
      tilt: 0,
      tapeSeed: 0,
      createdAt: T,
      updatedAt: T,
    },
  ],
};

describe("page schema", () => {
  it("round-trips a page with every element type", () => {
    const parsed = parsePage(serialisePage(fullPage));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.readOnly).toBe(false);
    expect(parsed.page).toEqual(fullPage);
  });

  it("accepts a freshly created page", () => {
    const p = createPage(new Date(T));
    const parsed = parsePage(serialisePage(p));
    expect(parsed.ok && !parsed.readOnly).toBe(true);
  });

  it("rejects invalid JSON", () => {
    const r = parsePage("{nope");
    expect(r.ok).toBe(false);
  });

  it("rejects a missing schemaVersion", () => {
    const { schemaVersion: _v, ...rest } = fullPage;
    void _v;
    expect(parsePage(JSON.stringify(rest)).ok).toBe(false);
  });

  it("rejects an unknown element type in a current-version page", () => {
    const bad = { ...fullPage, elements: [{ ...fullPage.elements[0], type: "hologram" }] };
    const r = parsePage(JSON.stringify(bad));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("elements");
  });

  it("rejects an image asset path outside assets/", () => {
    const el = { ...fullPage.elements[7], asset: "../../secrets.png" };
    expect(parsePage(JSON.stringify({ ...fullPage, elements: [el] })).ok).toBe(false);
  });
});

describe("future schema versions", () => {
  it("opens a newer page read-only and keeps the elements it knows", () => {
    const future = {
      ...fullPage,
      schemaVersion: 2,
      elements: [...fullPage.elements, { id: "x", type: "sticker", emoji: "star" }],
      newTopLevelField: true,
    };
    const r = parsePage(JSON.stringify(future));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.readOnly).toBe(true);
    expect(r.page.title).toBe("Faceted navigation audit");
    expect(r.page.elements).toHaveLength(fullPage.elements.length);
    expect(r.warning).toMatch(/newer version/);
    expect(r.warning).toMatch(/1 item/);
  });
});

describe("file names", () => {
  it("slugifies titles", () => {
    expect(slugify("Faceted navigation audit")).toBe("faceted-navigation-audit");
    expect(slugify("  Café & Bar: Q4!! ")).toBe("cafe-bar-q4");
    expect(slugify("???")).toBe("untitled");
  });

  it("numbers pages within their section, then the slug", () => {
    expect(pageFileName(7, "Faceted navigation audit")).toBe("0007-faceted-navigation-audit.page.json");
    expect(fileNumber("0012-session-4.page.json")).toBe(12);
    expect(fileNumber("core-left.page.json")).toBeNull();
    expect(nextFileNumber(["0001-a.page.json", "0004-b.page.json", "core-left.page.json"])).toBe(5);
    expect(nextFileNumber([])).toBe(1);
  });

  it("avoids clashes", () => {
    const taken = new Set(["0003-notes.page.json", "0003-notes-2.page.json"]);
    expect(uniquePageFileName(3, "Notes", taken)).toBe("0003-notes-3.page.json");
  });

  it("keeps reading order by number, whatever the titles", () => {
    const p = (fileName: string, createdAt = T, sheetPageType?: Page["sheetPageType"]) => ({
      fileName,
      page: { createdAt, sheetPageType },
    });
    const files = [
      p("0010-zebra.page.json"),
      p("spell-list.page.json", T, "spell-list"),
      p("0002-apple.page.json"),
      p("core-left.page.json", T, "core-left"),
    ];
    expect(files.sort(comparePageFiles).map((f) => f.fileName)).toEqual([
      "0002-apple.page.json",
      "0010-zebra.page.json",
      "core-left.page.json",
      "spell-list.page.json",
    ]);
  });
});
