/** A single word recognised by Tesseract, in PDF points with top-left origin. */
export interface OcrWord {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
  page: number;
  conf: number;
}

/** Page role identified from landmark labels. */
export type DdbPageRole =
  | "core"       // ability scores, saves, skills, attacks
  | "features"   // features & traits, actions
  | "details"    // backstory, appearance, allies, notes
  | "spells"     // spellcasting, spell slots, spell list
  | "unknown";
