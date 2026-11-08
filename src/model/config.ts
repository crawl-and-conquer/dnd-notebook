import { z } from "zod";

/** Full 20-ink set for the palette flyout. */
export const INK_COLOURS = [
  { id: "iron-gall",     label: "Iron gall",    value: "#2b2622" },
  { id: "walnut",        label: "Walnut",        value: "#4a3424" },
  { id: "sepia",         label: "Sepia",         value: "#6b4a2e" },
  { id: "oxblood",       label: "Oxblood",       value: "#8e2a2a" },
  { id: "vermilion",     label: "Vermilion",     value: "#c4452c" },
  { id: "rust",          label: "Rust",          value: "#a85a2a" },
  { id: "amber",         label: "Amber",         value: "#d07a2e" },
  { id: "ochre",         label: "Ochre",         value: "#b8902c" },
  { id: "olive",         label: "Olive",         value: "#6e7a2e" },
  { id: "moss",          label: "Moss",          value: "#4f6b32" },
  { id: "forest",        label: "Forest",        value: "#2f5d46" },
  { id: "teal",          label: "Teal",          value: "#2d7a7a" },
  { id: "prussian-blue", label: "Prussian blue", value: "#2a4e7f" },
  { id: "ultramarine",   label: "Ultramarine",   value: "#3b5bb5" },
  { id: "indigo",        label: "Indigo",        value: "#3e3a86" },
  { id: "violet",        label: "Violet",        value: "#6d4a8a" },
  { id: "plum",          label: "Plum",          value: "#7b3b5e" },
  { id: "rose",          label: "Rose",          value: "#b85a7a" },
  { id: "slate",         label: "Slate",         value: "#5a6470" },
  { id: "gilt",          label: "Gilt",          value: "#c9a54a" },
] as const;

/** Default 6 favourites shown on the toolbar. */
export const DEFAULT_FAVOURITES = ["#2b2622", "#8e2a2a", "#2a4e7f", "#4f6b32", "#6b4a2e", "#6d4a8a"];

/** Paint-brush highlighter colours (semi-transparent, drawn under everything). */
export const HIGHLIGHTER_COLOURS = [
  { id: "sunlight", label: "Sunlight", value: "rgba(240,200,60,.55)" },
  { id: "sage",     label: "Sage",     value: "rgba(150,195,110,.5)" },
  { id: "sky",      label: "Sky",      value: "rgba(120,170,220,.45)" },
  { id: "blush",    label: "Blush",    value: "rgba(230,130,150,.45)" },
  { id: "lilac",    label: "Lilac",    value: "rgba(170,140,210,.45)" },
  { id: "ember",    label: "Ember",    value: "rgba(240,160,90,.5)" },
] as const;

export const STROKE_WIDTHS = [2, 4, 8] as const;

/** Stored in app config; the folder the user chose. Notebook lives in `<folder>/notebook`. */
export const CharacterConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  cover: z.string().default("#46562f"),
  folder: z.string().min(1),
  order: z.number(),
  archived: z.boolean().default(false),
  excludeFromAi: z.boolean().default(false),
});

/** Kept for migration only: old EN-era tab entries in a user's config.json. */
export const TabConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  colour: z.string(),
  folder: z.string().min(1),
  order: z.number(),
  archived: z.boolean().default(false),
  excludeFromAi: z.boolean().default(false),
});

export const AI_PROVIDERS = ["openrouter", "openai", "anthropic", "gemini", "custom"] as const;
export type AiProviderId = (typeof AI_PROVIDERS)[number];

export const PROVIDER_LABEL: Record<AiProviderId, string> = {
  openrouter: "OpenRouter",
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  custom: "Custom (OpenAI-compatible)",
};

/** AI choices. API keys are never stored here; they live in Windows Credential Manager. */
const AiSettingsSchema = z.object({
  provider: z.enum(AI_PROVIDERS).default("openrouter"),
  /** Chosen model id per provider. */
  models: z.record(z.string(), z.string()).default({}),
  customBaseUrl: z.string().default(""),
  includeSnapshots: z.boolean().default(false),
  temperature: z.number().min(0).max(2).default(0.3),
});

/** Export defaults (SPEC: Settings, Export). An empty destination means Documents. */
const ExportSettingsSchema = z.object({
  format: z.enum(["markdown", "pdf", "both"]).default("both"),
  destination: z.string().default(""),
  includeImages: z.boolean().default(true),
  includeDone: z.boolean().default(true),
  printerFriendly: z.boolean().default(false),
});

export const AppConfigSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  characters: z.array(CharacterConfigSchema).default([]),
  lastOpened: z
    .object({
      characterId: z.string().optional(),
      sectionId: z.string().optional(),
      spreadIndex: z.number().int().min(0).optional(),
    })
    .default({}),
  general: z
    .object({
      lockToLines: z.boolean().default(true),
      inkColour: z.string().default(INK_COLOURS[0].value),
      inkFavourites: z.array(z.string()).default(DEFAULT_FAVOURITES),
      inkMixes: z.array(z.string()).max(12).default([]),
      strokeWidth: z.number().default(4),
      startWithWindows: z.boolean().default(false),
      checkForUpdates: z.boolean().default(true),
      defaultPhotoFrame: z.enum(["print", "negative", "none"]).default("print"),
      filmLook: z.boolean().default(true),
      dateStamp: z.boolean().default(true),
    })
    .default({
      lockToLines: true,
      inkColour: INK_COLOURS[0].value,
      inkFavourites: DEFAULT_FAVOURITES,
      inkMixes: [],
      strokeWidth: 4,
      startWithWindows: false,
      checkForUpdates: true,
      defaultPhotoFrame: "print",
      filmLook: true,
      dateStamp: true,
    }),
  ai: AiSettingsSchema.default(AiSettingsSchema.parse({})),
  export: ExportSettingsSchema.default(ExportSettingsSchema.parse({})),
});

export type ExportSettings = z.infer<typeof ExportSettingsSchema>;

export type AiSettings = z.infer<typeof AiSettingsSchema>;

export type TabConfig = z.infer<typeof TabConfigSchema>;
export type CharacterConfig = z.infer<typeof CharacterConfigSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;

export function defaultConfig(): AppConfig {
  return AppConfigSchema.parse({});
}

/** Parses config text, falling back to defaults for anything missing or broken. */
export function parseConfig(text: string | null): AppConfig {
  if (!text) return defaultConfig();
  try {
    const r = AppConfigSchema.safeParse(JSON.parse(text));
    return r.success ? r.data : defaultConfig();
  } catch {
    return defaultConfig();
  }
}
