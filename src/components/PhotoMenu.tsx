import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Element } from "../model/page";
import { useNotebook } from "../store/notebook";

type PhotoEl = Extract<Element, { type: "image" }>;

export function PhotoMenu({
  el,
  x,
  y,
  onClose,
}: {
  el: PhotoEl;
  x: number;
  y: number;
  onClose(): void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const editElements = useNotebook((s) => s.editElements);

  const [stamp, setStamp] = useState(el.stamp);
  const [caption, setCaption] = useState(el.caption);

  useEffect(() => {
    ref.current?.querySelector("input")?.focus();
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", key);
    };
  }, [onClose]);

  function patch(fields: Partial<PhotoEl>) {
    editElements((els) =>
      els.map((e) => (e.id === el.id && e.type === "image" ? { ...e, ...fields, updatedAt: new Date().toISOString() } : e)),
    );
  }

  function commitText() {
    patch({ stamp, caption });
    onClose();
  }

  const leftPx = Math.min(x, window.innerWidth - 280);
  const topPx = Math.min(y, window.innerHeight - 320);

  return createPortal(
    <div
      ref={ref}
      className="photo-menu"
      style={{ left: leftPx, top: topPx }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <p className="photo-menu-heading">Frame</p>
      <div className="photo-menu-row">
        {(["print", "negative", "none"] as const).map((f) => (
          <button
            key={f}
            className={el.frame === f ? "active" : undefined}
            onClick={() => { patch({ frame: f }); onClose(); }}
          >
            {f === "print" ? "Print" : f === "negative" ? "Negative" : "None"}
          </button>
        ))}
      </div>

      <p className="photo-menu-heading">Film look</p>
      <div className="photo-menu-row">
        <button
          className={el.filmLook ? "active" : undefined}
          onClick={() => { patch({ filmLook: true }); onClose(); }}
        >On</button>
        <button
          className={!el.filmLook ? "active" : undefined}
          onClick={() => { patch({ filmLook: false }); onClose(); }}
        >Off</button>
      </div>

      <p className="photo-menu-heading">Date stamp</p>
      <input
        className="photo-menu-input"
        value={stamp}
        placeholder="e.g. '26 11 06"
        onChange={(e) => setStamp(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitText(); } }}
      />

      <p className="photo-menu-heading">Caption</p>
      <input
        className="photo-menu-input"
        value={caption}
        placeholder="Optional caption"
        onChange={(e) => setCaption(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitText(); } }}
      />

      <button className="photo-menu-apply" onClick={commitText}>Apply</button>
    </div>,
    document.body,
  );
}
