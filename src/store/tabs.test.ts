import { beforeAll, describe, expect, it } from "vitest";
import { backend } from "../storage/backend";
import type { TabConfig } from "../model/config";
import type { CharacterConfig } from "../model/config";
import { useNotebook, visibleCharacters } from "./notebook";
import { applyTabOrder, moveToSlot } from "./tabOrder";

describe("moveToSlot", () => {
  const ids = ["a", "b", "c", "d"];
  it("moves up and down by insertion slot", () => {
    expect(moveToSlot(ids, "c", 0)).toEqual(["c", "a", "b", "d"]);
    expect(moveToSlot(ids, "a", 4)).toEqual(["b", "c", "d", "a"]);
    expect(moveToSlot(ids, "a", 2)).toEqual(["b", "a", "c", "d"]);
    expect(moveToSlot(ids, "d", 1)).toEqual(["a", "d", "b", "c"]);
  });
  it("treats the slots either side of an item as no move", () => {
    expect(moveToSlot(ids, "b", 1)).toEqual(ids);
    expect(moveToSlot(ids, "b", 2)).toEqual(ids);
  });
  it("clamps out-of-range slots and ignores unknown ids", () => {
    expect(moveToSlot(ids, "b", -3)).toEqual(["b", "a", "c", "d"]);
    expect(moveToSlot(ids, "b", 99)).toEqual(["a", "c", "d", "b"]);
    expect(moveToSlot(ids, "z", 0)).toEqual(ids);
  });
});

describe("applyTabOrder", () => {
  const tab = (id: string, order: number, archived = false): TabConfig => ({
    id,
    name: id,
    colour: "#fff",
    folder: `C:/${id}`,
    order,
    archived,
    excludeFromAi: false,
  });
  it("numbers visible tabs in order and keeps archived ones after them", () => {
    const tabs = [tab("a", 0), tab("x", 1, true), tab("b", 5), tab("c", 9)];
    const out = applyTabOrder(tabs, ["c", "a", "b"]);
    expect(Object.fromEntries(out.map((t) => [t.id, t.order]))).toEqual({ c: 0, a: 1, b: 2, x: 3 });
  });
});

describe("character actions", () => {
  const state = () => useNotebook.getState();
  const names = () => visibleCharacters(state().config).map((c) => c.name);
  const idOf = (name: string) => state().config.characters.find((c) => c.name === name)!.id;

  beforeAll(async () => {
    for (const name of ["Alpha", "Bravo", "Charlie"]) {
      const folder = `C:/Demo/Characters/${name}`;
      const r = await backend.prepareCharacterFolder(folder, name, "#46562f", false);
      await state().addCharacter({ name, cover: "#46562f", folder, notebookPath: r.notebookPath });
    }
  });

  it("renames a character, ignoring blank names", async () => {
    await state().renameCharacter(idOf("Bravo"), "  Bravo the Bold  ");
    await state().renameCharacter(idOf("Bravo the Bold"), "   ");
    expect(names()).toContain("Bravo the Bold");
    expect(names()).not.toContain("Bravo");
  });

  it("changes a character's cover colour", async () => {
    await state().setCharacterCover(idOf("Alpha"), "#6b2a26");
    expect(state().config.characters.find((c) => c.name === "Alpha")!.cover).toBe("#6b2a26");
  });

  it("reorders characters", async () => {
    await state().moveCharacter(idOf("Charlie"), 0);
    expect(names().slice(0, 3)).toEqual(["Charlie", "Alpha", "Bravo the Bold"]);
    const saved = JSON.parse((await backend.readAppConfig())!) as { characters: CharacterConfig[] };
    expect(
      saved.characters
        .filter((c) => !c.archived)
        .sort((a, b) => a.order - b.order)
        .map((c) => c.name),
    ).toEqual(["Charlie", "Alpha", "Bravo the Bold"]);
  });

  it("archives the open character and opens its neighbour", async () => {
    state().openCharacter(idOf("Alpha"));
    await state().archiveCharacter(idOf("Alpha"));
    expect(names()).not.toContain("Alpha");
    const v = state().view;
    expect("characterId" in v && v.characterId === idOf("Charlie")).toBe(true);
  });

  it("restores an archived character at the end and opens it", async () => {
    await state().restoreCharacter(idOf("Alpha"));
    expect(names()).toContain("Alpha");
    const v = state().view;
    expect("characterId" in v && v.characterId === idOf("Alpha")).toBe(true);
    expect(state().characters[idOf("Alpha")]?.status).toBe("ok");
  });

  it("archiving all visible characters leaves the empty state", async () => {
    for (const name of ["Charlie", "Bravo the Bold", "Alpha"]) await state().archiveCharacter(idOf(name));
    expect(names()).toEqual([]);
    expect(state().view).toEqual({ kind: "empty" });
  });
});
