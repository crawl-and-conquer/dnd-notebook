import type { ReactNode } from "react";
import { useState } from "react";
import { INK_COLOURS, HIGHLIGHTER_COLOURS, STROKE_WIDTHS } from "../model/config";
import { restyle } from "../canvas/elements";
import { useExportDialog } from "./ExportDialog";
import { useImportDialog } from "./ImportDialog";
import { currentPageOf, historyFor, useNotebook } from "../store/notebook";
import { useTools, type ToolId } from "../store/tools";
import {
  ArrowIcon,
  BoxIcon,
  BrushIcon,
  CircleIcon,
  EraserIcon,
  ExportIcon,
  GearIcon,
  HandIcon,
  ImageIcon,
  ImportIcon,
  LineIcon,
  NotebookMark,
  PaletteIcon,
  PenIcon,
  RedoIcon,
  SelectIcon,
  TextIcon,
  UndoIcon,
} from "./Icons";
import { InkPalette } from "./InkPalette";
import { ToolOptions } from "../canvas/ToolOptions";

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

const NIB_DOT: Record<number, number> = { 2: 4, 4: 8, 8: 13 };
const NIB_LABEL: Record<number, string> = { 2: "Fine nib", 4: "Medium nib", 8: "Broad nib" };

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The ink's name, for labels and tooltips; a mix or custom colour shows its hex value. */
export function inkName(value: string): string {
  return (
    INK_COLOURS.find((i) => same(i.value, value))?.label ??
    HIGHLIGHTER_COLOURS.find((i) => same(i.value, value))?.label ??
    value
  );
}

export function Toolbar() {
  const tool = useTools((s) => s.tool);
  const setTool = useTools((s) => s.setTool);
  const general = useNotebook((s) => s.config.general);
  const updateConfig = useNotebook((s) => s.updateConfig);
  const openSettings = useNotebook((s) => s.setSettingsOpen);
  const handwritingOpen = useNotebook((s) => s.handwritingOpen);
  const setHandwritingOpen = useNotebook((s) => s.setHandwritingOpen);
  const hasCharacter = useNotebook((s) => "characterId" in s.view);
  const [paletteOpen, setPaletteOpen] = useState(false);

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

      <div role="toolbar" aria-label="Drawing tools" className="tb-group tool-anchor">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={`tb-icon${tool === t.id ? " on" : ""}`}
            aria-label={`${t.label} (${t.key})`}
            title={`${t.label} (${t.key})`}
            aria-pressed={tool === t.id}
            onClick={() => setTool(t.id)}
          >
            {t.icon}
          </button>
        ))}
        <ToolOptions />
      </div>

      <div role="group" aria-label="Ink colour" className="tb-group palette-anchor">
        {general.inkFavourites.map((v) => (
          <button
            key={v}
            className={`tb-swatch${same(general.inkColour, v) ? " on" : ""}`}
            aria-label={`${inkName(v)} ink`}
            title={inkName(v)}
            aria-pressed={same(general.inkColour, v)}
            onClick={() => setGeneral({ inkColour: v })}
          >
            <span style={{ background: v }} />
          </button>
        ))}
        <button
          className={`tb-icon${paletteOpen ? " active" : ""}`}
          aria-label="All inks and highlighters"
          title="All inks and highlighters"
          aria-expanded={paletteOpen}
          onClick={() => setPaletteOpen((o) => !o)}
        >
          <PaletteIcon />
        </button>
        {paletteOpen && <InkPalette onClose={() => setPaletteOpen(false)} />}
      </div>

      <div role="group" aria-label="Nib" className="tb-group">
        {STROKE_WIDTHS.map((w) => (
          <button
            key={w}
            className={`tb-nib${general.strokeWidth === w ? " on" : ""}`}
            aria-label={NIB_LABEL[w]}
            title={NIB_LABEL[w]}
            aria-pressed={general.strokeWidth === w}
            onClick={() => setGeneral({ strokeWidth: w })}
          >
            <span style={{ width: NIB_DOT[w], height: NIB_DOT[w] }} />
          </button>
        ))}
      </div>

      <label className="tb-toggle" title="Lock to lines (G). Hold Alt to place freely.">
        <input
          type="checkbox"
          role="switch"
          checked={general.lockToLines}
          onChange={(e) => setGeneral({ lockToLines: e.target.checked })}
        />
        <span className="switch" aria-hidden="true" />
        <span>Lock to lines</span>
      </label>

      <div className="tb-end">
        <button
          className="tb-icon"
          aria-label="Undo"
          title="Undo (Ctrl+Z)"
          disabled={!history.canUndo}
          onClick={undo}
        >
          <UndoIcon />
        </button>
        <button
          className="tb-icon"
          aria-label="Redo"
          title="Redo (Ctrl+Y)"
          disabled={!history.canRedo}
          onClick={redo}
        >
          <RedoIcon />
        </button>
        <button
          className="tb-icon"
          aria-label="Import character sheet"
          title="Import character sheet (Ctrl+Shift+I)"
          disabled={!hasCharacter}
          onClick={() => useImportDialog.getState().setOpen(true)}
        >
          <ImportIcon />
        </button>
        <button
          className={`tb-icon${handwritingOpen ? " active" : ""}`}
          aria-label="Handwriting builder"
          title="Handwriting builder"
          aria-pressed={handwritingOpen}
          disabled={!hasCharacter}
          onClick={() => setHandwritingOpen(!handwritingOpen)}
        >
          <HandIcon />
        </button>
        <button
          className="tb-icon"
          aria-label="Export"
          title="Export (Ctrl+Shift+E)"
          onClick={() => useExportDialog.getState().setOpen(true)}
        >
          <ExportIcon />
        </button>
        <button
          className="tb-icon"
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
