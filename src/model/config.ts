import { z } from "zod";

/** Default favourite ink colours in toolbar order. */
export const INK_COLOURS = [
  { id: "iron-gall", label: "Iron gall", value: "#2b2622" },
  { id: "oxblood", label: "Oxblood", value: "#8e2a2a" },
  { id: "prussian-blue", label: "Prussian blue", value: "#2a4e7f" },
  { id: "moss", label: "Moss", value: "#4f6b32" },
  { id: "sepia", label: "Sepia", value: "#6b4a2e" },
  { id: "violet", label: "Violet", value: "#6d4a8a" },
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
  lookAheadDays: z.number().default(14),
  staleDays: z.number().default(21),
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
      pageId: z.string().optional(),
    })
    .default({}),
  general: z
    .object({
      lockToLines: z.boolean().default(true),
      lockToGrid: z.boolean().default(false),
      gridSize: z.number().default(32),
      inkColour: z.string().default(INK_COLOURS[0].value),
      strokeWidth: z.number().default(4),
      startWithWindows: z.boolean().default(false),
      checkForUpdates: z.boolean().default(true),
      defaultPhotoFrame: z.enum(["print", "negative", "none"]).default("print"),
      filmLook: z.boolean().default(true),
      dateStamp: z.boolean().default(true),
    })
    .default({
      lockToLines: true,
      lockToGrid: false,
      gridSize: 32,
      inkColour: INK_COLOURS[0].value,
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
