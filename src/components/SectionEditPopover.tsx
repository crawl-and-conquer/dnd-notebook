import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { DEFAULT_SECTIONS } from "../model/character";
import { CoverPicker } from "./CoverPicker";

const TAB_PAPERS = DEFAULT_SECTIONS.map((s) => ({ label: `${s.name} paper`, value: s.colour }));

/** Name and paper colour for a new or existing section tab, opened beside the tab. */
export function SectionEditPopover({
  anchor,
  title,
  initialName,
  initialColour,
  submitLabel,
  onSubmit,
  onClose,
}: {
  anchor: DOMRect;
  title: string;
  initialName: string;
  initialColour: string;
  submitLabel: string;
  onSubmit(name: string, colour: string): void;
  onClose(): void;
}) {
  const [name, setName] = useState(initialName);
  const [colour, setColour] = useState(initialColour);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const input = ref.current?.querySelector<HTMLInputElement>("input[type=text]");
    input?.focus();
    input?.select();
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

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit(name.trim(), colour);
    onClose();
  };

  const width = Math.min(340, window.innerWidth - 32);
  return createPortal(
    <form
      ref={ref}
      className="tab-edit"
      role="dialog"
      aria-label={title}
      onSubmit={submit}
      style={{
        width,
        left: Math.max(16, Math.min(anchor.left - width - 12, window.innerWidth - width - 16)),
        top: Math.max(16, Math.min(anchor.top, window.innerHeight - 300)),
      }}
    >
      <h3>{title}</h3>
      <label className="field">
        Name
        <input type="text" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="field">
        <span id="section-colour-label">Tab colour</span>
        <CoverPicker
          value={colour}
          onChange={setColour}
          labelledBy="section-colour-label"
          options={TAB_PAPERS}
        />
      </div>
      <div className="form-actions">
        <button type="button" className="pill ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="pill primary" disabled={!name.trim()}>
          {submitLabel}
        </button>
      </div>
    </form>,
    document.body,
  );
}
