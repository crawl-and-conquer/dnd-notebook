import { beforeAll, describe, expect, it } from "vitest";
import { backend } from "../storage/backend";
import { pagePath } from "../storage/paths";
import { editedLabel } from "../components/pageListFormat";
import { currentPageOf, useNotebook } from "./notebook";
import type { Element } from "../model/page";

// Runs against the in-memory backend (no Tauri in Node), so nothing touches disk.

const FOLDER = "C:/Demo/Page list";
const NOTEBOOK = `${FOLDER}/notebook`;
const SECTION = "sessions";

function char() {
  const s = useNotebook.getState();
  const charId = s.config.characters[0].id;
  const c = s.characters[charId];
  if (c?.status !== "ok") throw new Error("character not loaded");
  return { charId, pages: c.sectionPages[SECTION] ?? [] };
}

const files = () => backend.listSectionPageFiles(NOTEBOOK, SECTION);

describe("page list actions", () => {
  beforeAll(async () => {
    const r = await backend.prepareCharacterFolder(FOLDER, "Page list", "#46562f", false);
    await useNotebook.getState().addCharacter({
      name: "Page list",
      cover: "#46562f",
      folder: FOLDER,
      notebookPath: r.notebookPath,
    });
    await useNotebook.getState().newPage();
    const { charId, pages } = char();
    const text: Element = {
      id: "t1",
      type: "text",
      x: 100,
      y: 100,
      rotation: 0,
      createdAt: "2026-11-01T09:00:00.000Z",
      updatedAt: "2026-11-01T09:00:00.000Z",
      text: "Brief dev",
      w: 200,
      fontSize: 16,
      colour: "#F4F7FF",
      heading: false,
    };
    useNotebook.getState().updatePageIn(charId, SECTION, pages[0].page.id, (p) => ({
      ...p,
      title: "Audit",
      elements: [text],
    }));
    await useNotebook.getState().flushSaves();
  });

  it("renames a page and its file", async () => {
    const { charId, pages } = char();
    useNotebook.getState().renamePage(charId, SECTION, pages[0].page.id, "  Faceted navigation audit  ");
    await useNotebook.getState().flushSaves();
    const after = char().pages[0];
    expect(after.page.title).toBe("Faceted navigation audit");
    expect(after.fileName).toMatch(/-faceted-navigation-audit\.page\.json$/);
    expect(await files()).toEqual([after.fileName]);
  });

  it("ignores blank and unchanged titles", () => {
    const { charId, pages } = char();
    const before = pages[0].page;
    useNotebook.getState().renamePage(charId, SECTION, before.id, "   ");
    useNotebook.getState().renamePage(charId, SECTION, before.id, before.title);
    expect(char().pages[0].page).toBe(before);
  });

  it("duplicates a page with fresh ids and appends (copy) to the title", async () => {
    const { charId, pages } = char();
    const source = pages[0].page;
    await useNotebook.getState().duplicatePage(charId, SECTION, source.id);
    const after = char().pages;
    expect(after).toHaveLength(2);
    const copy = after[1].page;
    expect(copy.title).toBe("Faceted navigation audit (copy)");
    expect(copy.id).not.toBe(source.id);
    expect(copy.elements).toHaveLength(1);
    expect(copy.elements[0].id).not.toBe(source.elements[0].id);
    expect(copy.elements[0]).toMatchObject({ type: "text", text: "Brief dev", x: 100, y: 100 });
    expect(await files()).toHaveLength(2);
  });

  it("deletes a page through the bin", async () => {
    const { charId, pages } = char();
    const [first, copy] = pages;
    useNotebook.getState().updatePageIn(charId, SECTION, copy.page.id, (p) => ({ ...p, title: "Gone" }));
    expect(await useNotebook.getState().deletePage(charId, SECTION, copy.page.id)).toBe(true);
    expect(char().pages.map((p) => p.page.id)).toEqual([first.page.id]);
    expect(currentPageOf(useNotebook.getState())?.loaded.page.id).toBe(first.page.id);
    expect(await files()).toEqual([first.fileName]);
    expect(await backend.pathExists(pagePath(NOTEBOOK, SECTION, first.fileName))).toBe(true);
  });

  it("deleting the last page leaves an empty section", async () => {
    const { charId, pages } = char();
    expect(await useNotebook.getState().deletePage(charId, SECTION, pages[0].page.id)).toBe(true);
    expect(char().pages).toEqual([]);
    expect(currentPageOf(useNotebook.getState())).toBeNull();
    expect(await files()).toEqual([]);
  });
});

describe("editedLabel", () => {
  const now = new Date(2026, 10, 6, 15, 0);
  it("says today and yesterday with a time", () => {
    expect(editedLabel(new Date(2026, 10, 6, 9, 5).toISOString(), now)).toBe(
      "Edited today at 09:05",
    );
    expect(editedLabel(new Date(2026, 10, 5, 23, 59).toISOString(), now)).toBe(
      "Edited yesterday at 23:59",
    );
  });
  it("uses the UK date otherwise", () => {
    expect(editedLabel(new Date(2026, 9, 28, 12).toISOString(), now)).toBe(
      "Edited Wed 28 Oct 2026",
    );
    expect(editedLabel("not a date", now)).toBe("");
  });
});
