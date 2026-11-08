import { useLayoutEffect, useRef, useState } from "react";
import type { Element } from "../model/page";
import { lineHeightFor } from "../handwriting/handLayout";
import { TEXT_STYLE } from "./elements";
import { CHECK_GAP, CHECK_SIZE, FONT_BODY, FONT_HAND } from "./ElementNode";
import { DEFAULT_HAND_STYLE, useHand } from "./HandContext";

type Editable = Extract<Element, { type: "text" | "checklist" }>;

type Props = {
  el: Editable;
  onCommit(text: string): void;
};

/**
 * A textarea laid exactly over a text or checklist element while it is being edited. It shows
 * the base hand (Caveat) at the size and line height the committed text will render at, so
 * the writing does not jump; the character's own hand takes over once it is committed.
 * Checklists edit as one item per line.
 */
export function TextEditor({ el, onCommit }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  const hand = useHand()?.hand ?? DEFAULT_HAND_STYLE;
  const [value, setValue] = useState(() =>
    el.type === "text" ? el.text : el.items.map((i) => i.text).join("\n"),
  );

  const isChecklist = el.type === "checklist";
  const offsetX = isChecklist ? CHECK_SIZE + CHECK_GAP : 0;
  const fontSize = el.type === "text" ? el.fontSize : TEXT_STYLE.checklist.fontSize;
  const heading = el.type === "text" && el.heading;
  const printed = el.font === "print";
  const px = printed ? fontSize : (fontSize * hand.size) / 100;

  useLayoutEffect(() => {
    const t = ref.current;
    if (!t) return;
    t.focus({ preventScroll: true });
    t.setSelectionRange(t.value.length, t.value.length);
  }, []);

  useLayoutEffect(() => {
    const t = ref.current;
    if (!t) return;
    t.style.height = "0px";
    t.style.height = `${t.scrollHeight}px`;
  }, [value]);

  const commit = () => {
    if (done.current) return;
    done.current = true;
    onCommit(value);
  };

  return (
    <div
      className="text-editor"
      style={{ left: el.x, top: el.y, transform: `rotate(${el.rotation}deg)` }}
    >
      <textarea
        ref={ref}
        aria-label={isChecklist ? "Checklist items, one per line" : "Text"}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape" || (e.key === "Enter" && e.ctrlKey)) {
            e.preventDefault();
            commit();
          }
        }}
        spellCheck
        style={{
          marginLeft: offsetX,
          width: el.w - offsetX,
          minHeight: lineHeightFor(fontSize),
          fontSize: px,
          fontFamily: printed ? FONT_BODY : FONT_HAND,
          fontWeight: heading ? 700 : printed ? 500 : 400,
          lineHeight: `${lineHeightFor(fontSize)}px`,
          color: el.colour,
        }}
      />
    </div>
  );
}
