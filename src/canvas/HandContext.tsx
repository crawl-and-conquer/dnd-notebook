import { createContext, useContext, useEffect } from "react";
import { create } from "zustand";
import type { Character } from "../model/character";
import type { Hand } from "../model/hand";
import { clearLayoutCache, resetHandMeasures } from "../handwriting/handLayout";

export type HandCtx = {
  glyphs: Hand;
  hand: Character["hand"];
};

export const DEFAULT_HAND_STYLE: Character["hand"] = { base: "caveat", size: 100, slant: 0, spacing: 0, wobble: 0 };

export const HandContext = createContext<HandCtx | null>(null);

export function useHand(): HandCtx | null {
  return useContext(HandContext);
}

/** Bumps when web fonts finish loading, so text measured with a fallback font is laid out again. */
export const useFontsVersion = create<{ version: number }>(() => ({ version: 0 }));

let watching = false;
export function useWatchFonts() {
  useEffect(() => {
    if (watching || typeof document === "undefined" || !document.fonts) return;
    watching = true;
    const bump = () => {
      resetHandMeasures();
      clearLayoutCache();
      useFontsVersion.setState((s) => ({ version: s.version + 1 }));
    };
    void document.fonts.ready.then(bump);
    document.fonts.addEventListener?.("loadingdone", bump);
  }, []);
}
