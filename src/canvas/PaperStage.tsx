import Konva from "konva";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { Group, Layer, Rect, Stage, Transformer } from "react-konva";
import { PAGE_HEIGHT, PAGE_WIDTH, type Element, type Page } from "../model/page";
import { useNotebook } from "../store/notebook";
import { useTools } from "../store/tools";
import { importImage, placedSize } from "./assets";
import { ElementNode, clearMeasureCache, token } from "./ElementNode";
import {
  applyTransform,
  checklistFromLines,
  duplicate,
  makeChecklist,
  makeImage,
  makeLine,
  makeShape,
  makeStroke,
  makeText,
  translate,
} from "./elements";
import { LINES_Y, boxFromCorners, lockAngle, snapTextTop, snapToLines, squareCorner, type Point } from "./geometry";
import { TextEditor } from "./TextEditor";
import { PaperBackground, drawOrder } from "./PageScene";
import { ContextMenu, type MenuItem } from "../components/ContextMenu";
import { PhotoMenu } from "../components/PhotoMenu";
import { useExportDialog } from "../components/ExportDialog";

const ERASER_RADIUS = 6;

// Very high-density screens (3x) make every layer a huge canvas; 2x is still sharp
// and keeps pan and zoom smooth.
const MAX_PIXEL_RATIO = 2;
Konva.pixelRatio = Math.min(MAX_PIXEL_RATIO, window.devicePixelRatio || 1);

type Draft =
  | { kind: "stroke"; tool: "pen" | "brush"; pts: number[] }
  | { kind: "shape"; type: "line" | "arrow" | "rect" | "ellipse"; start: Point; end: Point }
  | { kind: "marquee"; start: Point; end: Point; additive: boolean; base: string[] }
  | { kind: "erase"; last: Point };

type Editing = { el: Extract<Element, { type: "text" | "checklist" }>; isNew: boolean };

type Props = {
  page: Page;
  readOnly: boolean;
  notebookPath: string;
  /** The page tools, keys and paste act on. Only one page of a spread is active. */
  active: boolean;
  /** Called on pointer down, before the gesture, so edits go to this page. */
  onActivate?(): void;
  /** Sheet pages draw their own template instead of ruled paper. */
  paper?: boolean;
};

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

/**
 * One page of the spread: a Konva stage the exact size of the page (570 x 720). Zoom and
 * pan belong to the spread (BookView), which scales the whole book with a CSS transform.
 */
export function PaperStage({ page, readOnly, notebookPath, active, onActivate, paper = true }: Props) {
  const stageRef = useRef<Konva.Stage>(null);
  const layerRef = useRef<Konva.Layer>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [, setFontTick] = useState(0);

  const tool = useTools((s) => s.tool);
  const zoom = useTools((s) => s.zoom);
  const panMode = useTools((s) => s.panMode);
  const setTool = useTools((s) => s.setTool);
  const selectedIds = useTools((s) => s.selectedIds);
  const setSelected = useTools((s) => s.setSelected);
  const general = useNotebook((s) => s.config.general);
  const editElements = useNotebook((s) => s.editElements);

  // Refs mirror values that stable callbacks need to read.
  const live = useRef({
    lock: general.lockToLines,
    alt: false,
    selected: selectedIds,
    elements: page.elements,
  });
  live.current.lock = general.lockToLines;
  live.current.selected = selectedIds;
  live.current.elements = page.elements;
  const lastPointer = useRef<Point | null>(null);
  const erased = useRef(new Set<string>());

  const colours = useMemo(
    () => ({
      gilt: token("--gilt"),
      desk: token("--desk"),
    }),
    [],
  );

  // The book is scaled with CSS while zooming (smooth, no redraw); once the zoom settles the
  // canvases are redrawn at a resolution that suits the new size, capped at 2x.
  useEffect(() => {
    const st = stageRef.current;
    if (!st) return;
    const ratio = Math.min(MAX_PIXEL_RATIO, (window.devicePixelRatio || 1) * Math.max(1, zoom));
    for (const layer of st.getLayers()) {
      if (layer.getCanvas().getPixelRatio() !== ratio) {
        layer.getCanvas().setPixelRatio(ratio);
        layer.batchDraw();
      }
    }
  }, [zoom]);

  useLayoutEffect(() => {
    if (active) setSelected([]);
    setEditing(null);
    setDraft(null);
    setMenu(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.id]);

  // Leaving a page (clicking the other one) drops its selection and open editor.
  useEffect(() => {
    if (active) return;
    setMenu(null);
  }, [active]);

  useEffect(() => {
    void document.fonts.ready.then(() => {
      clearMeasureCache();
      setFontTick((n) => n + 1);
      stageRef.current?.batchDraw();
    });
  }, []);

  const toPage = useCallback((evt?: Event): Point | null => {
    const stage = stageRef.current;
    const layer = layerRef.current;
    if (!stage || !layer) return null;
    if (evt) stage.setPointersPositions(evt);
    return layer.getRelativePointerPosition();
  }, []);

  const viewCentre = (): Point => ({ x: PAGE_WIDTH / 2, y: PAGE_HEIGHT / 2 });

  // ---------- element callbacks (stable, so memoised nodes don't re-render) ----------

  // Lock to lines: shapes snap onto the rules, text so its baseline sits on a rule; Alt frees both.
  const dragBound = useCallback((abs: Konva.Vector2d) => {
    const { lock, alt } = live.current;
    return snapToLines(abs, lock && !alt);
  }, []);
  const textDragBound = useCallback((abs: Konva.Vector2d) => {
    const { lock, alt } = live.current;
    return snapTextTop(abs, lock && !alt);
  }, []);

  const dragCommitQueued = useRef(false);
  const onDragEnd = useCallback(() => {
    if (dragCommitQueued.current) return;
    dragCommitQueued.current = true;
    requestAnimationFrame(() => {
      dragCommitQueued.current = false;
      const layer = layerRef.current;
      if (!layer) return;
      const nodes = new Map<string, Konva.Node>();
      for (const n of layer.find(".element")) nodes.set(n.id(), n);
      editElements((els) =>
        els.map((el) => {
          const n = nodes.get(el.id);
          if (!n || (n.x() === el.x && n.y() === el.y)) return el;
          return { ...el, x: n.x(), y: n.y(), updatedAt: new Date().toISOString() };
        }),
      );
    });
  }, [editElements]);

  const onDblClick = useCallback((id: string) => {
    if (useTools.getState().tool !== "select") return;
    const el = live.current.elements.find((e) => e.id === id);
    if (el && (el.type === "text" || el.type === "checklist")) setEditing({ el, isNew: false });
  }, []);

  const onToggleItem = useCallback(
    (elementId: string, itemId: string) => {
      const now = new Date().toISOString();
      editElements((els) =>
        els.map((el) => {
          if (el.id !== elementId || el.type !== "checklist") return el;
          return {
            ...el,
            updatedAt: now,
            items: el.items.map((i) =>
              i.id !== itemId ? i : { ...i, done: !i.done },
            ),
          };
        }),
      );
    },
    [editElements],
  );

  // ---------- context menu ----------

  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    elementId: string;
    itemId?: string;
  } | null>(null);

  const [photoEdit, setPhotoEdit] = useState<{ x: number; y: number; elementId: string } | null>(
    null,
  );

  const onContextMenu = (e: Konva.KonvaEventObject<PointerEvent>) => {
    e.evt.preventDefault();
    if (readOnly) return;
    const node = e.target.findAncestor(".element", true);
    if (!node) {
      setMenu(null);
      return;
    }
    const id = node.id();
    if (!live.current.selected.includes(id)) setSelected([id]);
    const row = e.target.findAncestor(".checklist-item", true);
    const itemId = row
      ?.name()
      .split(" ")
      .find((n) => n.startsWith("ci-"))
      ?.slice(3);
    setMenu({ x: e.evt.clientX, y: e.evt.clientY, elementId: id, itemId });
  };

  const menuItems = (): MenuItem[] => {
    if (!menu) return [];
    const el = page.elements.find((x) => x.id === menu.elementId);
    if (!el) return [];
    const items: MenuItem[] = [];

    if (el.type === "image") {
      items.push({
        label: "Edit photo…",
        onSelect: () => setPhotoEdit({ x: menu.x, y: menu.y, elementId: el.id }),
      });
      const patchImg = (fields: Partial<typeof el>) =>
        editElements((els) =>
          els.map((e) =>
            e.id === el.id && e.type === "image"
              ? { ...e, ...fields, updatedAt: new Date().toISOString() }
              : e,
          ),
        );
      const frameLabel = { print: "Print frame", negative: "Negative frame", none: "No frame" };
      for (const f of ["print", "negative", "none"] as const) {
        items.push({
          label: (el.frame === f ? "✓ " : "  ") + frameLabel[f],
          onSelect: () => patchImg({ frame: f }),
        });
      }
      items.push({
        label: (el.filmLook ? "✓ " : "  ") + "Film look",
        onSelect: () => patchImg({ filmLook: !el.filmLook }),
      });
    }

    items.push({
      label: "Duplicate",
      onSelect: () => {
        const copy = duplicate(el, LINES_Y, LINES_Y);
        editElements((els) => [...els, copy]);
        setSelected([copy.id]);
      },
    });
    items.push({
      label: "Delete",
      danger: true,
      onSelect: () => {
        editElements((els) => els.filter((x) => x.id !== el.id));
        setSelected([]);
      },
    });
    return items;
  };

  // ---------- selection transformer ----------

  const selectedEls = useMemo(
    () => page.elements.filter((e) => selectedIds.includes(e.id)),
    [page.elements, selectedIds],
  );
  const textOnly =
    selectedEls.length > 0 && selectedEls.every((e) => e.type === "text" || e.type === "checklist");

  useEffect(() => {
    const tr = trRef.current;
    const layer = layerRef.current;
    if (!tr || !layer) return;
    const nodes = selectedIds
      .filter((id) => id !== editing?.el.id)
      .map((id) => layer.findOne(`#${id}`))
      .filter((n): n is Konva.Node => !!n);
    tr.nodes(tool === "select" ? nodes : []);
    tr.getLayer()?.batchDraw();
  }, [selectedIds, page.elements, editing, tool]);

  // A page reloaded from disk may no longer have some selected elements.
  useEffect(() => {
    const ids = new Set(page.elements.map((el) => el.id));
    const sel = live.current.selected;
    if (sel.some((id) => !ids.has(id))) setSelected(sel.filter((id) => ids.has(id)));
  }, [page.elements, setSelected]);

  const onTransformEnd = () => {
    const tr = trRef.current;
    if (!tr) return;
    const updates = new Map<
      string,
      { x: number; y: number; rotation: number; scaleX: number; scaleY: number }
    >();
    for (const n of tr.nodes()) {
      updates.set(n.id(), {
        x: n.x(),
        y: n.y(),
        rotation: n.rotation(),
        scaleX: n.scaleX(),
        scaleY: n.scaleY(),
      });
      n.scale({ x: 1, y: 1 });
    }
    const g = live.current.lock && !live.current.alt ? LINES_Y : null;
    editElements((els) =>
      els.map((el) => (updates.has(el.id) ? applyTransform(el, updates.get(el.id)!, g) : el)),
    );
  };

  // ---------- drawing gestures ----------

  const snapOn = (alt: boolean) => general.lockToLines && !alt;

  const eraseAlong = (from: Point, to: Point) => {
    const stage = stageRef.current;
    const layer = layerRef.current;
    if (!stage || !layer) return;
    const toAbs = layer.getAbsoluteTransform();
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(dist / 4));
    const r = ERASER_RADIUS / Math.max(0.5, useTools.getState().zoom);
    let changed = false;
    for (let s = 0; s <= steps; s++) {
      const p = {
        x: from.x + ((to.x - from.x) * s) / steps,
        y: from.y + ((to.y - from.y) * s) / steps,
      };
      for (const [ox, oy] of [
        [0, 0],
        [r, 0],
        [-r, 0],
        [0, r],
        [0, -r],
      ]) {
        const hit = stage.getIntersection(toAbs.point({ x: p.x + ox, y: p.y + oy }));
        const g = hit?.findAncestor(".element", true);
        if (g && !erased.current.has(g.id())) {
          erased.current.add(g.id());
          g.visible(false);
          changed = true;
        }
      }
    }
    if (changed) layer.batchDraw();
  };

  const finishDraft = (d: Draft, end: Point | null, evt: PointerEvent | null) => {
    setDraft(null);
    const ink = general.inkColour;
    const width = general.strokeWidth;
    const shift = evt?.shiftKey ?? false;
    switch (d.kind) {
      case "stroke":
        if (d.pts.length >= 3) {
          const el = makeStroke(d.tool, d.pts, ink, width);
          editElements((els) => [...els, el]);
        }
        break;
      case "shape": {
        const { start, end: e } = d;
        if (d.type === "line" || d.type === "arrow") {
          if (Math.hypot(e.x - start.x, e.y - start.y) < 4) break;
          const el = makeLine(d.type, start.x, start.y, e.x, e.y, ink, width);
          editElements((els) => [...els, el]);
        } else {
          const box = boxFromCorners(start, e);
          if (box.w < 4 && box.h < 4) break;
          const el = makeShape(d.type, box, ink, width, useTools.getState().shapeDashed);
          editElements((els) => [...els, el]);
        }
        break;
      }
      case "marquee": {
        const layer = layerRef.current;
        if (!layer) break;
        const box = boxFromCorners(d.start, end ?? d.end);
        if (box.w < 3 && box.h < 3) break;
        const hits: string[] = [];
        for (const n of layer.find(".element")) {
          const r = n.getClientRect({ relativeTo: layer });
          if (
            r.x <= box.x + box.w &&
            box.x <= r.x + r.width &&
            r.y <= box.y + box.h &&
            box.y <= r.y + r.height
          )
            hits.push(n.id());
        }
        setSelected(d.additive || shift ? [...new Set([...d.base, ...hits])] : hits);
        break;
      }
      case "erase": {
        const gone = new Set(erased.current);
        erased.current.clear();
        if (gone.size) editElements((els) => els.filter((el) => !gone.has(el.id)));
        break;
      }
    }
  };

  // Gestures continue on window so they survive leaving the canvas. Listeners are
  // attached synchronously on pointer down (not in an effect) so a very quick
  // down-move-up never misses its pointer up.
  const draftRef = useRef<Draft | null>(null);
  const updateDraft = (d: Draft | null) => {
    draftRef.current = d;
    setDraft(d);
  };
  const gesture = useRef<{ move: (e: PointerEvent) => void; up: (e: PointerEvent) => void }>({
    move: () => {},
    up: () => {},
  });
  const startGesture = (d: Draft) => {
    updateDraft(d);
    const move = (e: PointerEvent) => gesture.current.move(e);
    const up = (e: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      gesture.current.up(e);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };
  {
    const move = (evt: PointerEvent) => {
      const p = toPage(evt);
      const d = draftRef.current;
      if (!p || !d) return;
      lastPointer.current = p;
      live.current.alt = evt.altKey;
      switch (d.kind) {
        case "stroke": {
          const n = d.pts.length;
          if (Math.hypot(p.x - d.pts[n - 3], p.y - d.pts[n - 2]) < 0.75) return;
          const pressure = evt.pointerType === "pen" ? evt.pressure : 0.5;
          updateDraft({ ...d, pts: [...d.pts, p.x, p.y, pressure] });
          break;
        }
        case "shape": {
          let end = snapToLines(p, snapOn(evt.altKey));
          if (evt.shiftKey && (d.type === "line" || d.type === "arrow")) {
            const l = lockAngle(end.x - d.start.x, end.y - d.start.y);
            end = { x: d.start.x + l.x, y: d.start.y + l.y };
          } else if (evt.shiftKey) {
            end = squareCorner(d.start, end);
          }
          updateDraft({ ...d, end });
          break;
        }
        case "marquee":
          updateDraft({ ...d, end: p });
          break;
        case "erase":
          eraseAlong(d.last, p);
          updateDraft({ ...d, last: p });
          break;
      }
    };
    const up = (evt: PointerEvent) => {
      move(evt); // include the final position
      const d = draftRef.current;
      draftRef.current = null;
      if (d) finishDraft(d, toPage(evt), evt);
    };
    gesture.current = { move, up };
  }

  const onPointerDown = (e: Konva.KonvaEventObject<PointerEvent>) => {
    const evt = e.evt;
    // Middle-drag and Space-drag pan the spread; BookView handles those.
    if (evt.button === 1 || useTools.getState().panMode) return;
    onActivate?.();
    if (evt.button !== 0 || readOnly || editing) return;
    const p = toPage();
    if (!p) return;
    lastPointer.current = p;
    live.current.alt = evt.altKey;
    const snapped = snapToLines(p, snapOn(evt.altKey));

    switch (tool) {
      case "select": {
        if (e.target.findAncestor("Transformer", true)) return;
        const node = e.target.findAncestor(".element", true);
        const sel = live.current.selected;
        if (node) {
          const id = node.id();
          if (evt.shiftKey)
            setSelected(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
          else if (!sel.includes(id)) setSelected([id]);
          return;
        }
        if (!evt.shiftKey) setSelected([]);
        startGesture({
          kind: "marquee",
          start: p,
          end: p,
          additive: evt.shiftKey,
          base: evt.shiftKey ? sel : [],
        });
        return;
      }
      case "eraser":
        erased.current.clear();
        eraseAlong(p, p);
        startGesture({ kind: "erase", last: p });
        return;
      case "pen":
      case "brush":
        startGesture({
          kind: "stroke",
          tool,
          pts: [p.x, p.y, evt.pointerType === "pen" ? evt.pressure : 0.5],
        });
        return;
      case "line":
      case "arrow":
      case "rect":
      case "ellipse":
        startGesture({ kind: "shape", type: tool, start: snapped, end: snapped });
        return;
      case "text": {
        evt.preventDefault(); // keep focus in the editor that is about to open
        const kind = useTools.getState().textKind;
        // The line clicked on is the one written on: its baseline is the rule below the pointer.
        const at = snapTextTop({ x: p.x, y: p.y - LINES_Y / 2 }, snapOn(evt.altKey));
        const el =
          kind === "checklist"
            ? makeChecklist(at.x, at.y, [""], general.inkColour)
            : makeText(at.x, at.y, general.inkColour, kind === "heading");
        setEditing({ el, isNew: true });
        return;
      }
      case "image":
        return;
    }
  };

  const onStageMove = () => {
    const p = toPage();
    if (p) lastPointer.current = p;
  };

  const commitEditing = (text: string) => {
    const cur = editing;
    setEditing(null);
    if (!cur) return;
    const { el, isNew } = cur;
    const now = new Date().toISOString();
    let next: Element | null;
    if (el.type === "text") {
      const t = text.replace(/\s+$/, "");
      next = t.trim() ? { ...el, text: t, updatedAt: now } : null;
    } else {
      const lines = text
        .split("\n")
        .map((l) => l.trimEnd())
        .filter((l) => l.trim() !== "");
      next = lines.length
        ? { ...el, items: checklistFromLines(el.items, lines), updatedAt: now }
        : null;
    }
    if (isNew) {
      if (next) editElements((els) => [...els, next]);
    } else {
      editElements((els) =>
        next ? els.map((x) => (x.id === el.id ? next : x)) : els.filter((x) => x.id !== el.id),
      );
    }
  };

  // ---------- images: picker, paste, drop ----------

  const placeImage = useCallback(
    async (blob: Blob, at: Point) => {
      try {
        const { rel, width, height } = await importImage(notebookPath, blob);
        const { w, h } = placedSize(width, height);
        const p = snapToLines(at, live.current.lock);
        const cfg = useNotebook.getState().config.general;
        const now = new Date();
        const yy = String(now.getFullYear()).slice(2);
        const mm = String(now.getMonth() + 1).padStart(2, "0");
        const dd = String(now.getDate()).padStart(2, "0");
        const el = makeImage(rel, p.x, p.y, w, h, {
          frame: cfg.defaultPhotoFrame,
          filmLook: cfg.filmLook,
          stamp: `'${yy} ${mm} ${dd}`,
        });
        editElements((els) => [...els, el]);
        useTools.getState().setTool("select");
        setSelected([el.id]);
      } catch (e) {
        useNotebook.setState({ notice: `Could not add the image: ${String(e)}` });
      }
    },
    [notebookPath, editElements, setSelected],
  );

  useEffect(() => {
    if (tool !== "image" || !active) return;
    if (!readOnly) fileRef.current?.click();
    setTool(useTools.getState().previousTool);
  }, [tool, readOnly, setTool, active]);

  useEffect(() => {
    if (!active) return;
    const onPaste = (e: ClipboardEvent) => {
      if (readOnly || isTyping(e.target) || useNotebook.getState().settingsOpen || !e.clipboardData)
        return;
      const at = lastPointer.current ?? viewCentre();
      const file = [...e.clipboardData.items]
        .find((i) => i.kind === "file" && i.type.startsWith("image/"))
        ?.getAsFile();
      if (file) {
        e.preventDefault();
        void placeImage(file, at);
        return;
      }
      const text = e.clipboardData.getData("text/plain");
      if (text.trim()) {
        e.preventDefault();
        const p = snapTextTop(at, general.lockToLines);
        const el = makeText(
          p.x,
          p.y,
          general.inkColour,
          false,
          text.replace(/\r\n/g, "\n").trimEnd(),
        );
        editElements((els) => [...els, el]);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (readOnly) return;
    const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith("image/"));
    const at = toPage(e.nativeEvent) ?? viewCentre();
    void (async () => {
      for (let i = 0; i < files.length; i++)
        await placeImage(files[i], { x: at.x + i * LINES_Y, y: at.y + i * LINES_Y });
    })();
  };

  // ---------- keyboard ----------

  useEffect(() => {
    if (!active) return;
    const down = (e: KeyboardEvent) => {
      if (e.key === "Alt") {
        live.current.alt = true;
        e.preventDefault();
      }
      if (
        isTyping(e.target) ||
        useNotebook.getState().settingsOpen ||
        useNotebook.getState().pageListOpen ||
        useNotebook.getState().handwritingOpen ||
        useExportDialog.getState().open
      )
        return;
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      const store = useNotebook.getState();
      const sel = new Set(live.current.selected);

      if (ctrl && k === "z" && !e.shiftKey) {
        e.preventDefault();
        store.undo();
      } else if (ctrl && (k === "y" || (k === "z" && e.shiftKey))) {
        e.preventDefault();
        store.redo();
      } else if (ctrl && k === "a") {
        e.preventDefault();
        setTool("select");
        setSelected(live.current.elements.map((el) => el.id));
      } else if (readOnly) {
        return;
      } else if (ctrl && k === "d") {
        e.preventDefault();
        if (!sel.size) return;
        const copies = live.current.elements
          .filter((el) => sel.has(el.id))
          .map((el) => duplicate(el, LINES_Y, LINES_Y));
        store.editElements((els) => [...els, ...copies]);
        setSelected(copies.map((c) => c.id));
      } else if ((e.key === "Delete" || e.key === "Backspace") && sel.size) {
        e.preventDefault();
        store.editElements((els) => els.filter((el) => !sel.has(el.id)));
        setSelected([]);
      } else if (e.key.startsWith("Arrow") && sel.size) {
        e.preventDefault();
        const step = e.shiftKey ? 1 : LINES_Y;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        store.editElements((els) => els.map((el) => (sel.has(el.id) ? translate(el, dx, dy) : el)));
      } else if (e.key === "Escape") {
        setSelected([]);
        draftRef.current = null;
        setDraft(null);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Alt") live.current.alt = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [setTool, setSelected, readOnly, active]);

  // ---------- render ----------

  const ordered = useMemo(() => drawOrder(page.elements), [page.elements]);

  const draftElement: Element | null = useMemo(() => {
    if (!draft) return null;
    const ink = general.inkColour;
    const width = general.strokeWidth;
    if (draft.kind === "stroke") return makeStroke(draft.tool, draft.pts, ink, width);
    if (draft.kind === "shape") {
      if (draft.type === "line" || draft.type === "arrow")
        return makeLine(
          draft.type,
          draft.start.x,
          draft.start.y,
          draft.end.x,
          draft.end.y,
          ink,
          width,
        );
      return makeShape(
        draft.type,
        boxFromCorners(draft.start, draft.end),
        ink,
        width,
        useTools.getState().shapeDashed,
      );
    }
    return null;
  }, [draft, general.inkColour, general.strokeWidth]);

  // Memoised so panning and zooming (which re-render this component) never
  // touch the element nodes: React reuses the same element objects and skips them.
  const draggable = tool === "select" && !readOnly;
  const editingId = editing?.el.id;
  const elementNodes = useMemo(
    () =>
      ordered.map((el) => (
        <ElementNode
          key={el.id}
          el={el}
          notebookPath={notebookPath}
          draggable={draggable}
          hidden={editingId === el.id}
          dragBoundFunc={el.type === "text" || el.type === "checklist" ? textDragBound : dragBound}
          onDragEnd={onDragEnd}
          onDblClick={onDblClick}
          onToggleItem={readOnly ? undefined : onToggleItem}
        />
      )),
    [
      ordered,
      notebookPath,
      draggable,
      editingId,
      dragBound,
      textDragBound,
      onDragEnd,
      onDblClick,
      onToggleItem,
      readOnly,
    ],
  );

  const interactive = tool === "select" || tool === "eraser";
  const cursor = panMode
    ? "grab"
    : tool === "select"
      ? "default"
      : tool === "text"
        ? "text"
        : "crosshair";

  return (
    <div
      className="paper-surface"
      style={{ cursor }}
      onScroll={(e) => {
        e.currentTarget.scrollTop = 0;
        e.currentTarget.scrollLeft = 0;
      }}
      onDragOver={(e) => {
        if ([...e.dataTransfer.types].includes("Files")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }
      }}
      onDrop={onDrop}
    >
      <Stage
        ref={stageRef}
        width={PAGE_WIDTH}
        height={PAGE_HEIGHT}
        onPointerDown={onPointerDown}
        onPointerMove={onStageMove}
        onContextMenu={onContextMenu}
      >
        {/* Two layers only: each layer is a full-size canvas the browser composites every frame. */}
        <Layer ref={layerRef} listening={interactive}>
          <Group>
            {paper && <PaperBackground />}
            {elementNodes}
          </Group>
        </Layer>

        <Layer>
          {draftElement && (
            <Group listening={false}>
              <ElementNode
                el={draftElement}
                notebookPath={notebookPath}
                draggable={false}
                hidden={false}
              />
            </Group>
          )}
          {draft?.kind === "marquee" && (
            <Rect
              {...(() => {
                const b = boxFromCorners(draft.start, draft.end);
                return { x: b.x, y: b.y, width: b.w, height: b.h };
              })()}
              stroke={colours.gilt}
              strokeWidth={1}
              dash={[6, 4]}
              fill="rgba(212,168,90,0.10)"
              listening={false}
            />
          )}
          <Transformer
            ref={trRef}
            rotateEnabled
            flipEnabled={false}
            keepRatio={false}
            ignoreStroke
            rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
            rotationSnapTolerance={6}
            enabledAnchors={
              textOnly
                ? ["middle-left", "middle-right"]
                : [
                    "top-left",
                    "top-center",
                    "top-right",
                    "middle-left",
                    "middle-right",
                    "bottom-left",
                    "bottom-center",
                    "bottom-right",
                  ]
            }
            anchorSize={10}
            anchorCornerRadius={2}
            anchorStroke={colours.gilt}
            anchorFill={colours.desk}
            anchorStrokeWidth={1.5}
            borderStroke={colours.gilt}
            borderDash={[6, 4]}
            padding={6}
            boundBoxFunc={(oldBox, newBox) =>
              Math.abs(newBox.width) < 10 || Math.abs(newBox.height) < 10 ? oldBox : newBox
            }
            onTransformEnd={onTransformEnd}
            onDragEnd={onDragEnd}
          />
        </Layer>
      </Stage>

      <div className="paper-overlay">
        {editing && <TextEditor key={editing.el.id} el={editing.el} onCommit={commitEditing} />}
        {menu && (
          <ContextMenu x={menu.x} y={menu.y} items={menuItems()} onClose={() => setMenu(null)} />
        )}
        {photoEdit && (() => {
          const imgEl = page.elements.find((e) => e.id === photoEdit.elementId);
          return imgEl?.type === "image" ? (
            <PhotoMenu
              el={imgEl}
              x={photoEdit.x}
              y={photoEdit.y}
              onClose={() => setPhotoEdit(null)}
            />
          ) : null;
        })()}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void placeImage(f, lastPointer.current ?? viewCentre());
        }}
      />
    </div>
  );
}
