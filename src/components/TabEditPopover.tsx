import { useEffect, useRef, useState, type FormEvent } from "react";
import { COVER_COLOURS } from "../model/character";
import { useNotebook } from "../store/notebook";
import { CoverPicker } from "./CoverPicker";

/** Rename a character and change its cover colour, beside the shelf spine it belongs to. */
export function TabEditPopover({
  tabId,
  anchor,
  focus,
  onClose,
}: {
  tabId: string;
  anchor: DOMRect;
  focus: "name" | "colour";
  onClose(): void;
}) {
  const char = useNotebook((s) => s.config.characters.find((c) => c.id === tabId));
  const [name, setName] = useState(char?.name ?? "");
  const [cover, setCover] = useState(char?.cover ?? COVER_COLOURS[0].value);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const el =
      focus === "name"
        ? ref.current?.querySelector<HTMLInputElement>("input[type=text]")
        : (ref.current?.querySelector<HTMLButtonElement>(".swatch[aria-pressed=true]") ??
          ref.current?.querySelector<HTMLInputElement>("input[type=color]"));
    el?.focus();
    if (el instanceof HTMLInputElement && el.type === "text") el.select();
  }, [focus]);

  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", key, true);
    };
  }, [onClose]);

  if (!char) return null;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const s = useNotebook.getState();
    await s.renameCharacter(tabId, name);
    await s.setCharacterCover(tabId, cover);
    onClose();
  };

  const width = Math.min(340, window.innerWidth - 32);
  return (
    <form
      ref={ref}
      className="tab-edit"
      role="dialog"
      aria-label={`Edit ${char.name}`}
      onSubmit={(e) => void save(e)}
      style={{
        width,
        right: Math.max(16, window.innerWidth - anchor.left + 10),
        top: Math.max(16, Math.min(anchor.top, window.innerHeight - 260)),
      }}
    >
      <h3>Edit character</h3>
      <label className="field">
        Name
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="field">
        <span id="tab-edit-colour">Cover colour</span>
        <CoverPicker value={cover} onChange={setCover} labelledBy="tab-edit-colour" />
      </div>
      <div className="form-actions">
        <button type="button" className="pill ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="pill primary" disabled={!name.trim()}>
          Save
        </button>
      </div>
    </form>
  );
}
