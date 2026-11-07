import Konva from "konva";
import { useEffect, useRef } from "react";
import { Group, Path, Text } from "react-konva";
import type { Character } from "../model/character";
import type { GlyphsData } from "../model/hand";
import { PAD_BASELINE_Y, pickVariant } from "../model/hand";
import { glyphAdvance, glyphStrokePath } from "../handwriting/glyphPaths";
import { LINE_HEIGHT } from "./ElementNode";

type HandTextProps = {
  text: string;
  width: number;
  fontSize: number;
  colour: string;
  glyphs: GlyphsData;
  hand: Character["hand"];
};

type CharLayout = {
  char: string;
  x: number;
  y: number;
  charPos: number; // position in the full text string (for variant selection)
};

/** Lay out characters in lines, returning per-char positions. */
function layoutChars(
  text: string,
  width: number,
  fontSize: number,
  glyphs: GlyphsData,
  spacing: number, // extra spacing in scaled pixels
  scale: number,
): CharLayout[] {
  const lineH = fontSize * LINE_HEIGHT;
  const result: CharLayout[] = [];
  let cx = 0;
  let cy = 0;
  let charPos = 0;

  // Split into words to do word-wrap
  const tokens = text.split(/([ \n])/);
  for (const token of tokens) {
    if (token === "\n") {
      cx = 0;
      cy += lineH;
      charPos++;
      continue;
    }
    if (token === "") continue;

    // Measure word width first to decide wrapping
    let wordW = 0;
    for (const ch of token) {
      const g = glyphs[ch];
      if (g && g.length > 0 && g[0].length > 0) {
        wordW += glyphAdvance(g[0]) * scale + spacing;
      } else {
        wordW += fontSize * 0.5 + spacing;
      }
    }

    // Wrap before the word if it overflows (but not at the start of a line)
    if (cx > 0 && cx + wordW > width) {
      cx = 0;
      cy += lineH;
    }

    for (const ch of token) {
      const g = glyphs[ch];
      let charW: number;
      if (ch === " ") {
        charW = fontSize * 0.3 + spacing;
      } else if (g && g.length > 0 && g[0].length > 0) {
        charW = glyphAdvance(g[0]) * scale + spacing;
      } else {
        charW = fontSize * 0.5 + spacing;
      }
      result.push({ char: ch, x: cx, y: cy, charPos });
      cx += charW;
      charPos++;
    }
  }

  return result;
}

export function HandText({ text, width, fontSize, colour, glyphs, hand }: HandTextProps) {
  const groupRef = useRef<Konva.Group>(null);

  const scale = (fontSize * (hand.size / 100)) / 100;
  const spacing = hand.spacing * scale;
  // y offset so glyph baseline aligns with Caveat's baseline within a line
  // Caveat baseline ≈ fontSize * 0.78 from line top
  const baselineY = fontSize * 0.78;
  const glyphOriginY = -(PAD_BASELINE_Y * scale) + baselineY;

  const chars = layoutChars(text, width, fontSize, glyphs, spacing, scale);
  const strokeW = Math.max(1, fontSize * 0.025);

  // Cache the group after render for performance (40-line spreads)
  useEffect(() => {
    groupRef.current?.cache();
  });

  return (
    <Group ref={groupRef}>
      {chars.map(({ char, x, y, charPos }) => {
        if (char === " " || char === "\n") return null;
        const g = glyphs[char];
        if (!g || g.length === 0 || g[0].length === 0) {
          // Fallback: Caveat
          return (
            <Text
              key={charPos}
              x={x}
              y={y}
              text={char}
              fontSize={fontSize}
              fontFamily="'Caveat', cursive"
              lineHeight={LINE_HEIGHT}
              fill={colour}
              wrap="none"
            />
          );
        }

        const vi = pickVariant(char.charCodeAt(0), charPos, g.length);
        const variant = g[vi] ?? g[0];
        const opts = { scale, slant: hand.slant, wobble: hand.wobble, strokeWidth: strokeW };
        const wobbleSeed = char.charCodeAt(0) * 0.137 + charPos * 0.019;

        return (
          <Group key={charPos} x={x} y={y + glyphOriginY}>
            {variant.map((stroke, si) => {
              const d = glyphStrokePath(stroke, opts, wobbleSeed + si * 0.07);
              return d ? (
                <Path key={si} data={d} fill={colour} strokeWidth={0} perfectDrawEnabled={false} />
              ) : null;
            })}
          </Group>
        );
      })}
    </Group>
  );
}
