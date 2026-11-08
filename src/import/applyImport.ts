import { format } from "date-fns";
import { makeText } from "../canvas/elements";
import { getPath, setPath, type Sheet } from "../model/sheet";
import { slugify, type Element } from "../model/page";
import { backend } from "../storage/backend";
import { useNotebook } from "../store/notebook";
import { routeDetails } from "./ddb/route";
import { layoutText } from "../handwriting/handLayout";
import { toBase64 } from "./pdfFields";

/** The rows of the import dialog that can be unticked. */
export type ImportParts = {
  core: boolean;
  kit: boolean;
  spells: boolean;
  backstory: boolean;
  likes: boolean;
  dislikes: boolean;
  wants: boolean;
  notes: boolean;
};

export type ImportPlan = {
  characterId: string;
  file: { name: string; data: ArrayBuffer; sha256: string };
  sheet: Sheet;
  parts: ImportParts;
  /** Values the dialog could not read but you typed in, by path. */
  typed: Record<string, string>;
  /** Earlier hand-typed values to keep rather than replace, by path. */
  keepOverrides: string[];
  hand: boolean;
  mode: "update" | "replace";
};

const CORE_KEYS = ["identity", "abilities", "combat", "skills", "passives", "attacks", "proficiencies", "actions"] as const;
const KIT_KEYS = ["features", "equipment"] as const;

/** The sheet that results from an import, before anything is written (also used for the dialog's summary). */
export function mergeSheet(old: Sheet, incoming: Sheet, plan: Pick<ImportPlan, "parts" | "typed" | "keepOverrides" | "mode">): Sheet {
  let next: Sheet = { ...incoming, overrides: [] };
  const keepFromOld = (key: keyof Sheet) => {
    next = { ...next, [key]: old[key] };
  };
  if (!plan.parts.core) CORE_KEYS.forEach(keepFromOld);
  if (!plan.parts.kit) KIT_KEYS.forEach(keepFromOld);
  if (!plan.parts.kit && !plan.parts.spells) keepFromOld("spellcasting");
  else if (!plan.parts.spells && next.spellcasting) {
    next = { ...next, spellcasting: { ...next.spellcasting, spells: old.spellcasting?.spells ?? [] } };
  } else if (!plan.parts.kit && next.spellcasting && old.spellcasting) {
    const { spells } = next.spellcasting;
    next = { ...next, spellcasting: { ...old.spellcasting, spells } };
  }
  const overrides: string[] = [];
  if (plan.mode === "update") {
    for (const path of plan.keepOverrides) {
      next = setPath(next, path, getPath(old, path));
      overrides.push(path);
    }
  }
  for (const [path, text] of Object.entries(plan.typed)) {
    if (!text.trim()) continue;
    const n = Number(text.trim().replace(/[−–]/g, "-").replace(/^\+/, ""));
    next = setPath(next, path, Number.isFinite(n) && /^[+\-−–]?\d+$/.test(text.trim()) ? n : text.trim());
    overrides.push(path);
  }
  return { ...next, overrides: [...new Set(overrides)] };
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Rough number of 32 px lines, for when the layout cannot be measured. */
const estLines = (text: string) => text.split("\n").reduce((a, l) => a + Math.max(1, Math.ceil(l.length / 46)), 0);

type Block = { text: string; heading?: boolean; colour?: string };

/** Adds text under what is already on a section's pages, skipping lines already written there. */
async function appendToSection(characterId: string, sectionId: string, blocks: Block[], font: "hand" | "print") {
  const s = useNotebook.getState();
  const ch = s.characters[characterId];
  if (ch?.status !== "ok") return 0;
  const pages = ch.sectionPages[sectionId] ?? [];
  const written = new Set<string>();
  for (const p of pages)
    for (const el of p.page.elements) {
      if (el.type === "text") el.text.split("\n").forEach((l) => written.add(norm(l)));
      if (el.type === "checklist") el.items.forEach((i) => written.add(norm(i.text)));
    }
  const fresh = blocks
    .map((b) => ({ ...b, text: b.text.split("\n").filter((l) => b.heading || !written.has(norm(l))).join("\n") }))
    .filter((b) => b.text.trim());
  // Drop headings left with nothing under them.
  const keep = fresh.filter((b, i) => !b.heading || (fresh[i + 1] && !fresh[i + 1].heading));
  if (!keep.length) return 0;

  let index = Math.max(0, pages.length - 1);
  const bottomOf = (els: Element[]) =>
    els.reduce((y, el) => {
      if (el.type === "text") return Math.max(y, el.y + estLines(el.text) * 32);
      if (el.type === "checklist") return Math.max(y, el.y + el.items.length * 32);
      if (el.type === "image" || el.type === "rect" || el.type === "ellipse") return Math.max(y, el.y + el.h + 30);
      return y;
    }, 100);
  const heightOf = (text: string, heading: boolean) => {
    try {
      return layoutText(
        { text, width: 442, fontSize: heading ? 30 : 26, font, heading, elementId: "measure" },
        font === "hand" ? ch.glyphs : null,
        ch.character.hand,
      ).height;
    } catch {
      return estLines(text) * 32;
    }
  };
  let page = await s.ensurePage(characterId, sectionId, index);
  if (!page) return 0;
  let y = Math.ceil((bottomOf(page.page.elements) - 100) / 32) * 32 + 100;
  let pending: Element[] = [];
  const flush = () => {
    if (!page || !pending.length) return;
    const add = pending;
    useNotebook.getState().updatePageIn(characterId, sectionId, page.page.id, (p) => ({ ...p, elements: [...p.elements, ...add] }));
    pending = [];
  };
  for (let i = 0; i < keep.length; i++) {
    const b = keep[i];
    const h = heightOf(b.text, !!b.heading);
    // A heading moves to the next page together with the first lines under it.
    const next = b.heading && keep[i + 1] ? Math.min(heightOf(keep[i + 1].text, false), 96) : 0;
    if (y + h + next > 700 && y > 100) {
      flush();
      index++;
      page = await useNotebook.getState().ensurePage(characterId, sectionId, index);
      if (!page) return 0;
      y = 100;
    }
    const el = makeText(92, y, b.colour ?? "#2b2622", !!b.heading, b.text, font);
    pending.push(el);
    y += h;
  }
  flush();
  return keep.length;
}

export type ImportResult = { sheetPages: number; tabsFilled: string[] };

export async function applyImport(plan: ImportPlan): Promise<ImportResult> {
  const s = useNotebook.getState();
  const ch = s.characters[plan.characterId];
  if (ch?.status !== "ok") throw new Error("The character is not open.");
  const sheetSection = ch.character.sections.find((x) => x.kind === "sheet");

  // A dated copy of the PDF, kept as a record.
  const base = slugify(plan.file.name.replace(/\.pdf$/i, "")) || "sheet";
  const copy = await backend.saveImportCopy(
    ch.notebookPath,
    `${format(new Date(), "yyyy-MM-dd")}-${base}.pdf`,
    toBase64(plan.file.data),
  );

  const merged = mergeSheet(ch.sheet, plan.sheet, plan);
  merged.source = { kind: "ddb-pdf", file: copy, sha256: plan.file.sha256, importedAt: new Date().toISOString() };
  await s.setSheetData(plan.characterId, merged);

  const before = sheetSection ? (ch.sectionPages[sheetSection.id] ?? []).length : 0;
  if (plan.mode === "replace" && sheetSection) {
    for (const p of [...(ch.sectionPages[sheetSection.id] ?? [])]) {
      await useNotebook.getState().deletePage(plan.characterId, sheetSection.id, p.page.id);
    }
  }
  await useNotebook.getState().syncSheetPages(plan.characterId);
  const after = useNotebook.getState().characters[plan.characterId];
  const sheetPages =
    sheetSection && after?.status === "ok"
      ? (after.sectionPages[sheetSection.id] ?? []).length - (plan.mode === "replace" ? 0 : before)
      : 0;

  const r = routeDetails(merged);
  const font = plan.hand ? "hand" : "print";
  const sectionFor = (id: string) => ch.character.sections.find((x) => x.id === id);
  const filled: string[] = [];
  const fill = async (id: string, blocks: Block[]) => {
    if (!sectionFor(id)) return;
    if ((await appendToSection(plan.characterId, id, blocks, font)) > 0) filled.push(sectionFor(id)!.name);
  };
  if (plan.parts.backstory) {
    const blocks: Block[] = [];
    if (r.backstory) blocks.push({ text: r.backstory });
    if (r.glance.length) {
      blocks.push({ text: "At a glance", heading: true, colour: "#8e2a2a" });
      blocks.push({ text: r.glance.map((g) => `${g.label}: ${g.value}`).join("\n") });
    }
    await fill("backstory", blocks);
  }
  if (plan.parts.likes && r.likes.length) await fill("likes", [{ text: r.likes.map((l) => `♡ ${l}`).join("\n") }]);
  if (plan.parts.dislikes && r.dislikes.length) await fill("dislikes", [{ text: r.dislikes.join("\n") }]);
  if (plan.parts.wants && r.wants.length) await fill("wants", [{ text: r.wants.join("\n") }]);
  if (plan.parts.notes && (r.people.length || r.notes.length)) {
    const blocks: Block[] = [];
    if (r.people.length) {
      blocks.push({ text: "People", heading: true, colour: "#2a4e7f" });
      blocks.push({ text: r.people.join("\n"), colour: "#2a4e7f" });
    }
    if (r.notes.length) blocks.push({ text: r.notes.join("\n") });
    await fill("notes", blocks);
  }
  await useNotebook.getState().flushSaves();
  return { sheetPages: Math.max(0, sheetPages), tabsFilled: filled };
}
