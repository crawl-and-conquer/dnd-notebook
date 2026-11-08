import { beforeAll, describe, expect, it } from "vitest";
import { backend } from "../storage/backend";
import { characterPath } from "../storage/paths";
import { makeStroke } from "../canvas/elements";
import { currentSpreadPages, useNotebook } from "./notebook";

// In-memory backend: nothing touches disk.

const FOLDER = "C:/Demo/Sections";
const NOTEBOOK = `${FOLDER}/notebook`;
const state = () => useNotebook.getState();
const charId = () => state().config.characters.find((c) => c.folder === FOLDER)!.id;
const ch = () => {
  const c = state().characters[charId()];
  if (c?.status !== "ok") throw new Error("not loaded");
  return c;
};

describe("character.json and sections", () => {
  beforeAll(async () => {
    const r = await backend.prepareCharacterFolder(FOLDER, "Cosworth", "#46562f", false);
    // Older builds wrote only a marker; the app upgrades it on load.
    await backend.writeTextAtomic(
      characterPath(r.notebookPath),
      JSON.stringify({ app: "dnd-notebook", schemaVersion: 1, name: "Cosworth", cover: "#46562f" }),
    );
    await state().addCharacter({ name: "Cosworth", cover: "#46562f", folder: FOLDER, notebookPath: r.notebookPath });
  });

  it("upgrades a marker-only character.json to the full schema with the seven sections", async () => {
    const saved = JSON.parse(await backend.readTextFile(characterPath(NOTEBOOK)));
    expect(saved.app).toBe("dnd-notebook");
    expect(saved.id).toBeTruthy();
    expect(saved.sections.map((s: { id: string }) => s.id)).toEqual([
      "sessions",
      "backstory",
      "likes",
      "dislikes",
      "wants",
      "notes",
      "sheet",
    ]);
    expect(saved.hand).toMatchObject({ base: "caveat", size: 100 });
  });

  it("creates the sheet template pages, numbered in template order", () => {
    expect(ch().sectionPages.sheet.map((p) => [p.fileName, p.page.sheetPageType])).toEqual([
      ["0001-character.page.json", "core-left"],
      ["0002-skills-and-attacks.page.json", "core-right"],
      ["0003-features-and-traits.page.json", "features"],
      ["0004-spells-and-kit.page.json", "spells-kit"],
      ["0005-spell-list.page.json", "spell-list"],
    ]);
  });

  it("adds, renames, recolours, moves and removes a section, saving each change", async () => {
    const id = await state().addSection(charId(), "Quests", "#c6c7a0");
    expect(id).toMatch(/^quests-[a-z0-9]{4}$/);
    expect(await backend.pathExists(`${NOTEBOOK}/pages/${id}`)).toBe(true);
    await state().updateSection(charId(), id!, { name: "Side quests", colour: "#b9c3ae" });
    await state().moveSection(charId(), id!, 0);
    let saved = JSON.parse(await backend.readTextFile(characterPath(NOTEBOOK)));
    expect(saved.sections[0]).toMatchObject({ id, name: "Side quests", colour: "#b9c3ae", kind: "free" });

    expect(await state().removeSection(charId(), id!)).toBe(true);
    saved = JSON.parse(await backend.readTextFile(characterPath(NOTEBOOK)));
    expect(saved.sections.map((s: { id: string }) => s.id)).not.toContain(id);
    expect(await backend.pathExists(`${NOTEBOOK}/pages/${id}`)).toBe(false);
  });

  it("never removes the character sheet section", async () => {
    expect(await state().removeSection(charId(), "sheet")).toBe(false);
    expect(ch().character.sections.some((s) => s.id === "sheet")).toBe(true);
  });

  it("starts an empty Sessions section as Session 1 on blank paper", () => {
    state().openSection(charId(), "sessions");
    const spread = currentSpreadPages(state())!;
    expect(spread.left.virtual).toBe(true);
    expect(spread.left.page.title).toBe("Session 1");
    expect(spread.left.page.session?.number).toBe(1);
    expect(spread.right.page.title).toBe("Session 1, cont.");
  });

  it("writing on the blank right page keeps it on the right", async () => {
    state().setPageOffset(1);
    state().editElements((els) => [...els, makeStroke("pen", [100, 200, 0.5, 140, 220, 0.5], "#2b2622", 4)]);
    await state().flushSaves();
    const pages = ch().sectionPages.sessions;
    expect(pages).toHaveLength(2);
    expect(pages[0].page.title).toBe("Session 1");
    expect(pages[1].page.elements).toHaveLength(1);
    expect(pages.map((p) => p.fileName)).toEqual(["0001-session-1.page.json", "0002-session-1-cont.page.json"]);
  });

  it("New session numbers on and starts on a left page", async () => {
    await state().newSession();
    const pages = ch().sectionPages.sessions;
    expect(pages[2].page.title).toBe("Session 2");
    expect(pages[2].page.session?.number).toBe(2);
    const view = state().view;
    expect("characterId" in view && view.spreadIndex).toBe(1);
    expect(currentSpreadPages(state())!.left.page.id).toBe(pages[2].page.id);
  });

  it("renaming a page renames its file but keeps its number", async () => {
    const pages = ch().sectionPages.sessions;
    state().renamePage(charId(), "sessions", pages[2].page.id, "Session 2: the mill");
    await state().flushSaves();
    expect(ch().sectionPages.sessions[2].fileName).toBe("0003-session-2-the-mill.page.json");
  });
});
