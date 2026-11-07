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

/** `<notebookPath>/glyphs.json` — the character's hand glyph data. */
export function glyphsPath(notebookPath: string): string {
  return joinPath(notebookPath, "glyphs.json");
}
