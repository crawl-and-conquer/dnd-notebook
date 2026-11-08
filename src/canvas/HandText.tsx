import Konva from "konva";
import { useEffect, useRef } from "react";
import { Shape } from "react-konva";
import { drawLaid, layoutText, type TextSpec } from "../handwriting/handLayout";
import { useTools } from "../store/tools";
import { DEFAULT_HAND_STYLE, useFontsVersion, useHand } from "./HandContext";

/** Room around the text box for slant, descenders and wobble when caching. */
const BLEED = 14;

/**
 * Text drawn in the character's hand as one Konva shape. It is cached as a bitmap and redrawn
 * only when its text, size, colour, the hand, the loaded fonts or the zoom change, so pages
 * with a lot of writing pan and zoom as smoothly as empty ones.
 */
export function HandText({
  spec,
  colour,
  strike = false,
  opacity = 1,
  x = 0,
  y = 0,
}: {
  spec: TextSpec;
  colour: string;
  strike?: boolean;
  opacity?: number;
  x?: number;
  y?: number;
}) {
  const ref = useRef<Konva.Shape>(null);
  const ctx = useHand();
  const fonts = useFontsVersion((s) => s.version);
  const zoom = useTools((s) => s.zoom);
  const style = ctx?.hand ?? DEFAULT_HAND_STYLE;
  const laid = layoutText(spec, ctx?.glyphs ?? null, style);

  useEffect(() => {
    const s = ref.current;
    if (!s) return;
    s.clearCache();
    if (laid.lines.some((l) => l.items.length)) {
      s.cache({
        x: -BLEED,
        y: -BLEED,
        width: spec.width + BLEED * 2 + laid.fontPx,
        height: laid.height + BLEED * 2,
        pixelRatio: Math.min(4, (window.devicePixelRatio || 1) * Math.max(1.5, zoom)),
      });
    }
    s.getLayer()?.batchDraw();
  }, [laid, colour, strike, style, fonts, zoom, spec.width]);

  return (
    <Shape
      ref={ref}
      x={x}
      y={y}
      width={spec.width}
      height={laid.height}
      opacity={opacity}
      perfectDrawEnabled={false}
      sceneFunc={(c) => drawLaid(c._context, laid, style, { colour, strike })}
      hitFunc={(c, shape) => {
        c.beginPath();
        c.rect(0, 0, spec.width, laid.height);
        c.closePath();
        c.fillStrokeShape(shape);
      }}
    />
  );
}

/** Height of a text element as laid out, for editors and exports. */
export function useLaidHeight(spec: TextSpec): number {
  const ctx = useHand();
  useFontsVersion((s) => s.version);
  return layoutText(spec, ctx?.glyphs ?? null, ctx?.hand ?? DEFAULT_HAND_STYLE).height;
}
