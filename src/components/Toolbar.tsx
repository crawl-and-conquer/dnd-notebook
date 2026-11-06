import type { ReactNode } from "react";
import { useState } from "react";
import { STROKE_WIDTHS } from "../model/config";
import { restyle } from "../canvas/elements";
import { useCatchUp } from "../ai/catchUp";
import { useExportDialog } from "./ExportDialog";
import { currentPageOf, historyFor, useNotebook } from "../store/notebook";
import { useTools, type ToolId } from "../store/tools";
import {
  ArrowIcon,
  BoxIcon,
  BrushIcon,
  CatchUpIcon,
  CircleIcon,
  EraserIcon,
  ExportIcon,
  GearIcon,
  ImageIcon,
  LineIcon,
  LinesIcon,
  NotebookMark,
  PaletteIcon,
  PenIcon,
  RedoIcon,
  SelectIcon,
  TextIcon,
  UndoIcon,
} from "./Icons";
import { InkPalette } from "./InkPalette";

const TOOLS: { id: ToolId; label: string; key: string; icon: ReactNode }[] = [
  { id: "select", label: "Select", key: "V", icon: <SelectIcon /> },
  { id: "pen", label: "Pen", key: "P", icon: <PenIcon /> },
  { id: "brush", label: "Paint brush", key: "B", icon: <BrushIcon /> },
  { id: "line", label: "Line", key: "L", icon: <LineIcon /> },
  { id: "arrow", label: "Arrow", key: "A", icon: <ArrowIcon /> },
  { id: "rect", label: "Box", key: "R", icon: <BoxIcon /> },
  { id: "ellipse", label: "Circle", key: "O", icon: <CircleIcon /> },
  { id: "text", label: "Text", key: "T", icon: <TextIcon /> },
  { id: "image", label: "Paste or insert image", key: "I", icon: <ImageIcon /> },
  { id: "eraser", label: "Eraser", key: "E", icon: <EraserIcon /> },
];

const WIDTH_DOT: Record<number, number> = { 2: 4, 4: 8, 8: 13 };
const WIDTH_LABEL: Record<number, string> = {
  2: "Fine stroke",
  4: "Medium stroke",
  8: "Thick stroke",
};

export function Toolbar() {
  const tool = useTools((s) => s.tool);
  const setTool = useTools((s) => s.setTool);
  const general = useNotebook((s) => s.config.general);
  const updateConfig = useNotebook((s) => s.updateConfig);
  const openSettings = useNotebook((s) => s.setSettingsOpen);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const catchUpOpen = useCatchUp((s) => s.open);
  const undo = useNotebook((s) => s.undo);
  const redo = useNotebook((s) => s.redo);
  const editElements = useNotebook((s) => s.editElements);
  useNotebook((s) => s.historyTick); // re-render when undo/redo availability changes
  const pageId = useNotebook((s) => currentPageOf(s)?.loaded.page.id);
  const history = historyFor(pageId);

  const setGeneral = (patch: Partial<typeof general>) => {
    void updateConfig((c) => ({ ...c, general: { ...c.general, ...patch } }));
    // Colour and width also restyle the current selection.
    const sel = new Set(useTools.getState().selectedIds);
    const style = { colour: patch.inkColour, width: patch.strokeWidth };
    if (sel.size && (style.colour || style.width)) {
      editElements((els) => els.map((el) => (sel.has(el.id) ? restyle(el, style) : el)));
    }
  };

  return (
    <header className="toolbar">
      <div className="brand">
        <NotebookMark />
        <span>Notebook</span>
      </div>

      <div role="toolbar" aria-label="Drawing tools" className="tool-group">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className="icon-button"
            aria-label={t.label}
            title={`${t.label} (${t.key})`}
            aria-pressed={tool === t.id}
            onClick={() => setTool(t.id)}
          >
            {t.icon}
          </button>
        ))}
      </div>

      <div role="group" aria-label="Ink colour" className="swatches">
        {general.inkFavourites.map((v) => (
          <button
            key={v}
            className="swatch"
            aria-label={`Ink colour ${v}`}
            title={v}
            aria-pressed={general.inkColour.toLowerCase() === v.toLowerCase()}
            style={{ background: v }}
            onClick={() => setGeneral({ inkColour: v })}
          />
        ))}
        <div className="palette-anchor">
          <button
            className="icon-button"
            aria-label="Ink palette"
            title="Ink palette"
            aria-pressed={paletteOpen}
            onClick={() => setPaletteOpen((o) => !o)}
          >
            <PaletteIcon size={18} />
          </button>
          {paletteOpen && <InkPalette onClose={() => setPaletteOpen(false)} />}
        </div>
      </div>

      <div role="group" aria-label="Stroke width" className="width-group">
        {STROKE_WIDTHS.map((w) => (
          <button
            key={w}
            className="width-button"
            aria-label={WIDTH_LABEL[w]}
            title={`${WIDTH_LABEL[w]} (${w} px)`}
            aria-pressed={general.strokeWidth === w}
            onClick={() => setGeneral({ strokeWidth: w })}
          >
            <span style={{ width: WIDTH_DOT[w], height: WIDTH_DOT[w] }} />
          </button>
        ))}
      </div>

      <label className="grid-toggle" title="Lock to lines (G)">
        <input
          type="checkbox"
          checked={general.lockToLines}
          onChange={(e) => setGeneral({ lockToLines: e.target.checked })}
        />
        <span className="switch" aria-hidden="true" />
        <LinesIcon size={18} style={{ color: "var(--mint)" }} />
        <span>Lock to lines</span>
      </label>

      <div className="toolbar-end">
        <button
          className="icon-button"
          aria-label="Undo"
          title="Undo (Ctrl+Z)"
          disabled={!history.canUndo}
          onClick={undo}
        >
          <UndoIcon />
        </button>
        <button
          className="icon-button"
          aria-label="Redo"
          title="Redo (Ctrl+Y)"
          disabled={!history.canRedo}
          onClick={redo}
        >
          <RedoIcon />
        </button>
        <button
          className="pill primary"
          aria-pressed={catchUpOpen}
          onClick={() => useCatchUp.getState().setOpen(!catchUpOpen)}
        >
          <CatchUpIcon size={18} />
          Catch me up
        </button>
        <button
          className="icon-button"
          aria-label="Export"
          title="Export (Ctrl+Shift+E)"
          onClick={() => useExportDialog.getState().setOpen(true)}
        >
          <ExportIcon />
        </button>
        <button
          className="icon-button"
          aria-label="Settings"
          title="Settings (Ctrl+,)"
          onClick={() => openSettings(true)}
        >
          <GearIcon />
        </button>
      </div>
    </header>
  );
}
