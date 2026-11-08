import { z } from "zod";

/** The newest page schema this build understands. */
export const PAGE_SCHEMA_VERSION = 1 as const;

/** Fixed sheet size in page coordinates (SPEC: Visual design). */
export const PAGE_WIDTH = 570;
export const PAGE_HEIGHT = 720;

/** Header band above the ruled area (no rules). */
export const PAGE_HEADER_H = 88;
/** Rules repeat every 32 px; first rule at y = 95. */
export const RULE_PITCH = 32;
/** Left edge of the writing area (right of the margin line). */
export const PAGE_MARGIN_X = 92;

const isoDateTime = z.string().min(1);

const base = {
  id: z.string().min(1),
  x: z.number(),
  y: z.number(),
  rotation: z.number(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
};

const StrokeSchema = z.object({
  ...base,
  type: z.literal("stroke"),
  tool: z.enum(["pen", "brush"]),
  points: z.array(z.number()),
  colour: z.string(),
  width: z.number(),
  opacity: z.number(),
});

const linePoints = z.tuple([z.number(), z.number(), z.number(), z.number()]);
const LineSchema = z.object({
  ...base,
  type: z.literal("line"),
  points: linePoints,
  colour: z.string(),
  width: z.number(),
});
const ArrowSchema = LineSchema.extend({ type: z.literal("arrow") });

const RectSchema = z.object({
  ...base,
  type: z.literal("rect"),
  w: z.number(),
  h: z.number(),
  colour: z.string(),
  width: z.number(),
  dashed: z.boolean(),
});
const EllipseSchema = RectSchema.extend({ type: z.literal("ellipse") });

/** "hand": the character's handwriting; "print": Alegreya Sans, for labels. */
const FontSchema = z.enum(["hand", "print"]).default("hand");

const TextSchema = z.object({
  ...base,
  type: z.literal("text"),
  text: z.string(),
  w: z.number(),
  fontSize: z.number(),
  colour: z.string(),
  heading: z.boolean(),
  font: FontSchema,
});

const ChecklistItemSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  done: z.boolean(),
});

const ChecklistSchema = z.object({
  ...base,
  type: z.literal("checklist"),
  w: z.number(),
  items: z.array(ChecklistItemSchema),
  colour: z.string().default("#2b2622"),
  font: FontSchema,
});

const ImageSchema = z.object({
  ...base,
  type: z.literal("image"),
  asset: z.string().regex(/^assets\/[^/\\]+$/, "Expected assets/<file>"),
  w: z.number(),
  h: z.number(),
  frame: z.enum(["print", "negative", "none"]).default("print"),
  filmLook: z.boolean().default(true),
  caption: z.string().default(""),
  stamp: z.string().default(""),
  tilt: z.number().default(0),
  tapeSeed: z.number().default(0),
});

export const ElementSchema = z.discriminatedUnion("type", [
  StrokeSchema,
  LineSchema,
  ArrowSchema,
  RectSchema,
  EllipseSchema,
  TextSchema,
  ChecklistSchema,
  ImageSchema,
]);

export const PageSchema = z.object({
  schemaVersion: z.literal(PAGE_SCHEMA_VERSION),
  id: z.string().min(1),
  title: z.string(),
  /** The section this page belongs to (default "sessions" for backward compat). */
  section: z.string().default("sessions"),
  session: z
    .object({ number: z.number(), date: z.string(), place: z.string() })
    .optional(),
  /** Set for Character sheet pages; determines which template to render. */
  sheetPageType: z
    .enum(["core-left", "core-right", "features", "spells-kit", "spell-list"])
    .optional(),
  /** Which spell-list page this is (0 for the first), when the list runs over several pages. */
  sheetIndex: z.number().int().min(0).optional(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  elements: z.array(ElementSchema),
});

export type Element = z.infer<typeof ElementSchema>;
export type ElementType = Element["type"];
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;
export type Page = z.infer<typeof PageSchema>;

export type ParsedPage =
  { ok: true; page: Page; readOnly: boolean; warning?: string } | { ok: false; error: string };

/**
 * Parse a page file. A page written by a newer app (higher schemaVersion) opens
 * read-only: we show whatever elements we recognise and refuse to save.
 */
export function parsePage(text: string): ParsedPage {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "The page file is not valid JSON." };
  }
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "The page file is not a JSON object." };
  }
  const version = (raw as { schemaVersion?: unknown }).schemaVersion;
  if (typeof version !== "number") {
    return { ok: false, error: "The page file has no schemaVersion." };
  }

  if (version > PAGE_SCHEMA_VERSION) {
    return parseFuturePage(raw as Record<string, unknown>, version);
  }

  const result = PageSchema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue?.path.join(".") || "page";
    return {
      ok: false,
      error: `The page file is invalid at ${where}: ${issue?.message ?? "unknown"}`,
    };
  }
  return { ok: true, page: result.data, readOnly: false };
}

function parseFuturePage(raw: Record<string, unknown>, version: number): ParsedPage {
  const str = (v: unknown, fallback: string) => (typeof v === "string" ? v : fallback);
  const now = new Date().toISOString();
  const rawElements = Array.isArray(raw.elements) ? raw.elements : [];
  const elements: Element[] = [];
  for (const el of rawElements) {
    const r = ElementSchema.safeParse(el);
    if (r.success) elements.push(r.data);
  }
  const skipped = rawElements.length - elements.length;
  return {
    ok: true,
    readOnly: true,
    warning:
      `This page was saved by a newer version of the app (schema ${version}). It is open read-only.` +
      (skipped > 0 ? ` ${skipped} item(s) could not be shown.` : ""),
    page: {
      schemaVersion: PAGE_SCHEMA_VERSION,
      id: str(raw.id, "unknown"),
      title: str(raw.title, "Untitled"),
      section: str(raw.section, "sessions"),
      createdAt: str(raw.createdAt, now),
      updatedAt: str(raw.updatedAt, now),
      elements,
    },
  };
}

export function serialisePage(page: Page): string {
  return JSON.stringify(page, null, 2) + "\n";
}

export function newId(): string {
  return crypto.randomUUID();
}

export function createPage(
  now: Date = new Date(),
  title = "Untitled page",
  section = "sessions",
): Page {
  const iso = now.toISOString();
  return {
    schemaVersion: PAGE_SCHEMA_VERSION,
    id: newId(),
    title,
    section,
    createdAt: iso,
    updatedAt: iso,
    elements: [],
  };
}

/** Lower-case, ASCII, hyphen-separated slug; never empty. */
export function slugify(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || "untitled";
}

/**
 * Page files are numbered within their section so reading order survives renames:
 * `0001-<slug>.page.json`. The number never changes; the slug follows the title.
 */
export function pageFileName(number: number, title: string, suffix = ""): string {
  return `${String(number).padStart(4, "0")}-${slugify(title)}${suffix}.page.json`;
}

/** The reading-order number at the start of a page file name, or null for an unnumbered file. */
export function fileNumber(fileName: string): number | null {
  const m = /^(\d{4,})-/.exec(fileName);
  return m ? Number(m[1]) : null;
}

/** One more than the highest number already used in a section. */
export function nextFileNumber(fileNames: Iterable<string>): number {
  let max = 0;
  for (const n of fileNames) max = Math.max(max, fileNumber(n) ?? 0);
  return max + 1;
}

/** Picks a numbered file name that does not clash with `taken` (adds -2, -3, ...). */
export function uniquePageFileName(
  number: number,
  title: string,
  taken: ReadonlySet<string>,
): string {
  let name = pageFileName(number, title);
  for (let n = 2; taken.has(name); n++) name = pageFileName(number, title, `-${n}`);
  return name;
}

const SHEET_ORDER = ["core-left", "core-right", "features", "spells-kit", "spell-list"];

/**
 * Reading order within a section: numbered files by number, then unnumbered ones (older
 * builds) with sheet templates in template order, then by creation time and name.
 */
export function comparePageFiles(
  a: { fileName: string; page: Pick<Page, "createdAt" | "sheetPageType"> },
  b: { fileName: string; page: Pick<Page, "createdAt" | "sheetPageType"> },
): number {
  const na = fileNumber(a.fileName);
  const nb = fileNumber(b.fileName);
  if (na !== null && nb !== null && na !== nb) return na - nb;
  if (na !== null && nb === null) return -1;
  if (na === null && nb !== null) return 1;
  const sa = a.page.sheetPageType ? SHEET_ORDER.indexOf(a.page.sheetPageType) : 99;
  const sb = b.page.sheetPageType ? SHEET_ORDER.indexOf(b.page.sheetPageType) : 99;
  if (sa !== sb) return sa - sb;
  return a.page.createdAt.localeCompare(b.page.createdAt) || a.fileName.localeCompare(b.fileName);
}
