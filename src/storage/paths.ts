/** Joins path parts using the separator style of the first part (Windows or POSIX). */
export function joinPath(first: string, ...rest: string[]): string {
  const sep = first.includes("\\") && !first.includes("/") ? "\\" : "/";
  const trimmed = first.replace(/[\\/]+$/, "");
  return [trimmed, ...rest.map((p) => p.replace(/^[\\/]+|[\\/]+$/g, ""))].join(sep);
}

/** `<folder>/notebook` — the notebook subfolder inside a character's chosen folder. */
export function notebookPathFor(folder: string): string {
  return joinPath(folder, "notebook");
}

/** `<notebookPath>/pages/<sectionId>` — pages folder for one section. */
export function sectionPagesDir(notebookPath: string, sectionId: string): string {
  return joinPath(notebookPath, "pages", sectionId);
}

/** Full path to a page file: `<notebookPath>/pages/<sectionId>/<fileName>`. */
export function pagePath(notebookPath: string, sectionId: string, fileName: string): string {
  return joinPath(notebookPath, "pages", sectionId, fileName);
}

/** `<notebookPath>/character.json` — name, cover, sections and hand settings. */
export function characterPath(notebookPath: string): string {
  return joinPath(notebookPath, "character.json");
}

/** `<notebookPath>/hand/hand.json` — the character's drawn glyphs. */
export function glyphsPath(notebookPath: string): string {
  return joinPath(notebookPath, "hand", "hand.json");
}

/** Where builds before 0.2 kept the glyphs; still read if `hand/hand.json` is missing. */
export function legacyGlyphsPath(notebookPath: string): string {
  return joinPath(notebookPath, "glyphs.json");
}

/** `<notebookPath>/sheet.json` — imported character sheet data. */
export function sheetPath(notebookPath: string): string {
  return joinPath(notebookPath, "sheet.json");
}

/** `<notebookPath>/trackers.json` — mutable HP, slots, feature uses. */
export function trackersPath(notebookPath: string): string {
  return joinPath(notebookPath, "trackers.json");
}
