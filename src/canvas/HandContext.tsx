import { createContext, useContext } from "react";
import type { Character } from "../model/character";
import type { GlyphsData } from "../model/hand";

export type HandCtx = {
  glyphs: GlyphsData;
  hand: Character["hand"];
};

export const HandContext = createContext<HandCtx | null>(null);

export function useHand(): HandCtx | null {
  return useContext(HandContext);
}
