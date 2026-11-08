import { createContext, useContext } from "react";

/**
 * How the canvas is coloured. The screen theme reads the design tokens as they are; the
 * print theme (printer-friendly export) reads the matching `--print-*` token where there is
 * one: white paper, rules and margin lines at half strength. Inks are already dark on light,
 * so they print unchanged.
 */
export type CanvasTheme = {
  name: "screen" | "print";
  token(name: string): string;
  ink(colour: string): string;
  /** False when exporting without images. */
  images: boolean;
};

const cache = new Map<string, string>();
export function cssVar(name: string): string {
  let v = cache.get(name);
  if (v === undefined) {
    v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    cache.set(name, v);
  }
  return v;
}

const printVar = (name: string) => cssVar(name.replace(/^--/, "--print-")) || cssVar(name);

export const screenTheme: CanvasTheme = {
  name: "screen",
  token: cssVar,
  ink: (c) => c,
  images: true,
};

export const printTheme: CanvasTheme = {
  name: "print",
  token: printVar,
  ink: (c) => c,
  images: true,
};

export const ThemeContext = createContext<CanvasTheme>(screenTheme);
export const useCanvasTheme = () => useContext(ThemeContext);
