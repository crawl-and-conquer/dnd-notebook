import { z } from "zod";
import { newId } from "./page";

export const DEFAULT_SECTION_TAB_COLOURS: Record<string, string> = {
  sessions: "#e3d6b6",
  backstory: "#d8c29a",
  likes: "#d9b7a2",
  dislikes: "#c9b6a8",
  wants: "#c6c7a0",
  notes: "#b9c3ae",
  sheet: "#e0cf9e",
};

export type DefaultSectionId = "sessions" | "backstory" | "likes" | "dislikes" | "wants" | "notes" | "sheet";

export const DEFAULT_SECTIONS: Array<{
  id: DefaultSectionId;
  name: string;
  colour: string;
  kind: "free" | "sessions" | "sheet";
}> = [
  { id: "sessions", name: "Sessions", colour: "#e3d6b6", kind: "sessions" },
  { id: "backstory", name: "Backstory", colour: "#d8c29a", kind: "free" },
  { id: "likes", name: "Likes", colour: "#d9b7a2", kind: "free" },
  { id: "dislikes", name: "Dislikes", colour: "#c9b6a8", kind: "free" },
  { id: "wants", name: "Wants", colour: "#c6c7a0", kind: "free" },
  { id: "notes", name: "Notes", colour: "#b9c3ae", kind: "free" },
  { id: "sheet", name: "Character sheet", colour: "#e0cf9e", kind: "sheet" },
];

export const COVER_COLOURS = [
  { label: "Moss", value: "#46562f" },
  { label: "Oxblood", value: "#6b2a26" },
  { label: "Navy", value: "#26344f" },
  { label: "Walnut", value: "#4a3424" },
  { label: "Plum", value: "#4e2f45" },
  { label: "Teal", value: "#2a4f4e" },
  { label: "Slate", value: "#3d4148" },
  { label: "Ochre", value: "#7a5a24" },
] as const;

export const SectionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  colour: z.string(),
  kind: z.enum(["free", "sessions", "sheet"]),
  pageOrder: z.array(z.string()).default([]),
});

export const CHARACTER_SCHEMA_VERSION = 1 as const;

export const CharacterSchema = z.object({
  /** Marks the folder as this app's; the Rust side refuses to touch folders without it. */
  app: z.literal("dnd-notebook").default("dnd-notebook"),
  schemaVersion: z.literal(CHARACTER_SCHEMA_VERSION),
  id: z.string().min(1),
  name: z.string().min(1),
  cover: z.string().default("#46562f"),
  sections: z.array(SectionSchema),
  hand: z
    .object({
      base: z.literal("caveat"),
      size: z.number().default(100),
      slant: z.number().default(0),
      spacing: z.number().default(0),
      wobble: z.number().default(0),
    })
    .default({ base: "caveat", size: 100, slant: 0, spacing: 0, wobble: 0 }),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export type Section = z.infer<typeof SectionSchema>;
export type Character = z.infer<typeof CharacterSchema>;

export function createCharacter(
  name: string,
  cover: string,
  now = new Date(),
  id: string = newId(),
): Character {
  const iso = now.toISOString();
  return CharacterSchema.parse({
    schemaVersion: 1,
    id,
    name,
    cover,
    sections: DEFAULT_SECTIONS.map((s) => ({ ...s, pageOrder: [] })),
    createdAt: iso,
    updatedAt: iso,
  });
}

export function parseCharacter(text: string): Character | null {
  try {
    const r = CharacterSchema.safeParse(JSON.parse(text));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

/**
 * Reads `character.json`, upgrading the short marker file older builds wrote (name and cover
 * only) to a full character with the default sections. `changed` says whether to write it back.
 */
export function readCharacter(
  text: string | null,
  fallback: { id: string; name: string; cover: string },
  now = new Date(),
): { character: Character; changed: boolean } {
  const parsed = text ? parseCharacter(text) : null;
  if (parsed) return { character: parsed, changed: false };
  let raw: Record<string, unknown> = {};
  try {
    const v = text ? JSON.parse(text) : null;
    if (v && typeof v === "object") raw = v as Record<string, unknown>;
  } catch {
    // unreadable: rebuild from the app config
  }
  const str = (v: unknown, d: string) => (typeof v === "string" && v ? v : d);
  const base = createCharacter(
    str(raw.name, fallback.name),
    str(raw.cover, fallback.cover),
    now,
    str(raw.id, fallback.id),
  );
  const sections = Array.isArray(raw.sections)
    ? raw.sections.flatMap((s) => {
        const r = SectionSchema.safeParse(s);
        return r.success ? [r.data] : [];
      })
    : [];
  return {
    character: { ...base, sections: sections.length ? sections : base.sections },
    changed: true,
  };
}

/** A new section's id: a slug of its name plus a short random tail, safe as a folder name. */
export function newSectionId(name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const slug =
    name
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "section";
  for (;;) {
    const id = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    if (!used.has(id)) return id;
  }
}

/** Paper colours offered for new and recoloured section tabs. */
export const SECTION_TAB_COLOURS = Object.values(DEFAULT_SECTION_TAB_COLOURS);

export function serialiseCharacter(ch: Character): string {
  return JSON.stringify(ch, null, 2) + "\n";
}
