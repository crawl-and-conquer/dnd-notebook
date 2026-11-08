import { create } from "zustand";

export type ToolId =
  "select" | "pen" | "brush" | "line" | "arrow" | "rect" | "ellipse" | "text" | "image" | "eraser";

export type TextKind = "note" | "heading" | "checklist";

export const TOOL_KEYS: Record<string, ToolId> = {
  v: "select",
  p: "pen",
  b: "brush",
  l: "line",
  a: "arrow",
  r: "rect",
  o: "ellipse",
  t: "text",
  i: "image",
  e: "eraser",
};

type ToolStore = {
  tool: ToolId;
  /** The tool to return to after a one-shot tool (Image) finishes. */
  previousTool: ToolId;
  /** The spread's zoom once it has settled (1 = a page drawn at 570 x 720 px). */
  zoom: number;
  /** Space is held: dragging pans the spread instead of drawing. */
  panMode: boolean;
  selectedIds: string[];
  shapeDashed: boolean;
  textKind: TextKind;
  setTool(tool: ToolId): void;
  setZoom(zoom: number): void;
  setPanMode(on: boolean): void;
  setSelected(ids: string[]): void;
  setShapeDashed(dashed: boolean): void;
  setTextKind(kind: TextKind): void;
};

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 3;

export const useTools = create<ToolStore>((set, get) => ({
  tool: "pen",
  previousTool: "pen",
  zoom: 1,
  panMode: false,
  selectedIds: [],
  shapeDashed: false,
  textKind: "note",
  setTool: (tool) => {
    const cur = get().tool;
    set({
      tool,
      previousTool: cur === "image" ? get().previousTool : cur,
      selectedIds: tool === "select" ? get().selectedIds : [],
    });
  },
  setZoom: (zoom) => set({ zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) }),
  setPanMode: (panMode) => set({ panMode }),
  setSelected: (selectedIds) => set({ selectedIds }),
  setShapeDashed: (shapeDashed) => set({ shapeDashed }),
  setTextKind: (textKind) => set({ textKind }),
}));
