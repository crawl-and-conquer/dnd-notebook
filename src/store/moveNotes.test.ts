import { beforeAll, describe, expect, it } from "vitest";
import { backend } from "../storage/backend";
import { useNotebook } from "./notebook";

// Tests backend.moveNotebook (the TypeScript in-memory side); the Rust copy-and-verify
// step has its own tests in move_notes.rs.

const OLD = "C:/Demo/Move/Old";
const NEW = "C:/Demo/Move/New";
const BUSY = "C:/Demo/Move/Busy";
const state = () => useNotebook.getState();


describe("move notebook (backend)", () => {
  beforeAll(async () => {
    const r = await backend.prepareCharacterFolder(OLD, "Move", "#46562f", false);
    await state().addCharacter({
      name: "Move",
      cover: "#46562f",
      folder: OLD,
      notebookPath: r.notebookPath,
    });
    await state().newPage();
    state().updatePage((p) => ({ ...p, title: "Moved page" }));
    await state().flushSaves();
  });

  it("refuses a destination that already has a notebook", async () => {
    // Create a file in the busy destination's notebook path.
    await backend.writeTextAtomic(`${BUSY}/notebook/pages/sessions/x.page.json`, "{}");
    await expect(
      backend.moveNotebook(`${OLD}/notebook`, BUSY),
    ).rejects.toThrow(/not empty/);
  });

  it("moves the notebook files and updates the path", async () => {
    const result = await backend.moveNotebook(`${OLD}/notebook`, NEW);
    expect(result.notebookPath).toBe(`${NEW}/notebook`);
    expect(result.files).toBeGreaterThan(0);
    expect(result.oldLeftBehind).toBeNull();
    // Files are now under the new path.
    const files = await backend.listSectionPageFiles(`${NEW}/notebook`, "sessions");
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/-moved-page\.page\.json$/);
    // Old path is gone.
    expect(await backend.pathExists(`${OLD}/notebook`)).toBe(false);
  });
});
