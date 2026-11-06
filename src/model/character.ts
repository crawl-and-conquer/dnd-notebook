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

export function createCharacter(name: string, cover: string, now = new Date()): Character {
  const iso = now.toISOString();
  return CharacterSchema.parse({
    schemaVersion: 1,
    id: newId(),
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

export function serialiseCharacter(ch: Character): string {
  return JSON.stringify(ch, null, 2) + "\n";
}
