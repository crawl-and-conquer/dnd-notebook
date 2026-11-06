import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { backend } from "../storage/backend";
import { pagePath } from "../storage/paths";
import { serialisePage, type Page } from "../model/page";
import { useNotebook } from "./notebook";

// Simulates edits made outside the app (another editor, OneDrive, Dropbox) by writing
// straight to the in-memory backend, then feeding the watcher's file names to the store.

const FOLDER = "C:/Demo/Outside";
const NOTEBOOK = `${FOLDER}/notebook`;
const SECTION = "sessions";

const state = () => useNotebook.getState();
function char() {
  const charId = state().config.characters.find((c) => c.folder === FOLDER)!.id;
  const c = state().characters[charId];
  if (c?.status !== "ok") throw new Error("character not loaded");
  return { charId, pages: c.sectionPages[SECTION] ?? [] };
}
const byTitle = (title: string) => char().pages.find((p) => p.page.title === title);
const writeOutside = (fileName: string, text: string) =>
  backend.writeTextAtomic(pagePath(NOTEBOOK, SECTION, fileName), text);
const changed = (...files: string[]) => state().applyOutsideChanges(NOTEBOOK, files);

async function addPage(title: string, at: string): Promise<{ fileName: string; page: Page }> {
  await state().newPage();
  const { charId, pages } = char();
  const last = pages[pages.length - 1];
  state().updatePageIn(charId, SECTION, last.page.id, (p) => ({ ...p, title, createdAt: at }));
  await state().flushSaves();
  const saved = char().pages.find((p) => p.page.id === last.page.id);
  if (!saved) throw new Error("page missing");
  return { fileName: saved.fileName, page: saved.page };
}

describe("changes made outside the app", () => {
  beforeAll(async () => {
    const r = await backend.prepareCharacterFolder(FOLDER, "Outside", "#46562f", false);
    await state().addCharacter({
      name: "Outside",
      cover: "#46562f",
      folder: FOLDER,
      notebookPath: r.notebookPath,
    });
    await addPage("Alpha", "2026-11-01T09:00:00.000Z");
    await addPage("Bravo", "2026-11-02T09:00:00.000Z");
  });

  beforeEach(() => state().dismissNotice());

  it("ignores the app's own saves", async () => {
    const before = byTitle("Bravo");
    await changed(before!.fileName);
    expect(byTitle("Bravo")).toBe(before);
    expect(state().notice).toBeNull();
  });

  it("reloads a page with no unsaved edits", async () => {
    const alpha = byTitle("Alpha")!;
    const edited: Page = {
      ...alpha.page,
      elements: [
        {
          id: "outside-1",
          type: "text",
          x: 40,
          y: 40,
          rotation: 0,
          createdAt: "2026-11-06T10:00:00.000Z",
          updatedAt: "2026-11-06T10:00:00.000Z",
          text: "Added on the laptop",
          w: 200,
          fontSize: 16,
          colour: "#F4F7FF",
          heading: false,
        },
      ],
      updatedAt: "2026-11-06T10:00:00.000Z",
    };
    await writeOutside(alpha.fileName, serialisePage(edited));
    await changed(alpha.fileName);
    const after = byTitle("Alpha")!;
    expect(after.page.elements.map((e) => e.id)).toEqual(["outside-1"]);
    expect(after.fileName).toBe(alpha.fileName);
    expect(state().notice).toBeNull();
  });

  it("keeps unsaved edits and shows a notice", async () => {
    const bravo = byTitle("Bravo")!;
    const { charId } = char();
    state().updatePageIn(charId, SECTION, bravo.page.id, (p) => ({ ...p, title: "Bravo" }));
    await writeOutside(
      bravo.fileName,
      serialisePage({ ...bravo.page, updatedAt: "2026-11-06T11:00:00.000Z" }),
    );
    await changed(bravo.fileName);
    expect(state().notice).toMatch(/"Bravo" was changed outside the app/);
    expect(byTitle("Bravo")!.page.updatedAt).not.toBe("2026-11-06T11:00:00.000Z");
    // The in-app version wins on the next save.
    await state().flushSaves();
    const disk = await backend.readTextFile(pagePath(NOTEBOOK, SECTION, byTitle("Bravo")!.fileName));
    expect(disk).not.toContain("2026-11-06T11:00:00.000Z");
  });

  it("ignores a half-written file", async () => {
    const alpha = byTitle("Alpha")!;
    await writeOutside(alpha.fileName, '{"schemaVersion": 1, "id": ');
    await changed(alpha.fileName);
    expect(byTitle("Alpha")).toBe(alpha);
    // Put it back for the other tests.
    await writeOutside(alpha.fileName, serialisePage(alpha.page));
    await changed(alpha.fileName);
  });

  it("removes a page deleted outside", async () => {
    // Add a temporary page, then delete it from outside.
    await addPage("Temp", "2026-11-03T09:00:00.000Z");
    const temp = byTitle("Temp")!;
    await backend.trashPageFile(pagePath(NOTEBOOK, SECTION, temp.fileName));
    await changed(temp.fileName);
    expect(byTitle("Temp")).toBeUndefined();
    // Remaining pages are still present.
    expect(byTitle("Alpha")).toBeDefined();
    expect(byTitle("Bravo")).toBeDefined();
  });

  it("keeps a page deleted outside while it has unsaved edits", async () => {
    const bravo = byTitle("Bravo")!;
    const { charId } = char();
    state().updatePageIn(charId, SECTION, bravo.page.id, (p) => ({ ...p, title: "Bravo kept" }));
    await backend.trashPageFile(pagePath(NOTEBOOK, SECTION, bravo.fileName));
    await changed(bravo.fileName);
    expect(state().notice).toMatch(/was deleted outside the app/);
    expect(byTitle("Bravo kept")).toBeDefined();
    await state().flushSaves();
    expect(await backend.listSectionPageFiles(NOTEBOOK, SECTION)).toContain(byTitle("Bravo kept")!.fileName);
  });
});
