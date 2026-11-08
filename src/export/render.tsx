import type Konva from "konva";
import { createRoot } from "react-dom/client";
import { Layer, Stage } from "react-konva";
import { loadAsset } from "../canvas/assets";
import { HandContext, type HandCtx } from "../canvas/HandContext";
import { PageScene, type SceneContext } from "../canvas/PageScene";
import { ThemeContext, printTheme, screenTheme } from "../canvas/theme";
import { PAGE_HEIGHT, PAGE_WIDTH, type Page } from "../model/page";

export type RenderOptions = {
  theme: "screen" | "print";
  /** 2 for exports (SPEC: rendered at 2x). */
  pixelRatio: number;
  includeImages: boolean;
};

export type RenderContext = SceneContext & { hand: HandCtx | null };

// setTimeout rather than requestAnimationFrame, which pauses in a hidden window.
const tick = (ms = 16) => new Promise((r) => setTimeout(r, ms));

function dataUrlToBytes(url: string): Uint8Array {
  const b64 = url.slice(url.indexOf(",") + 1);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** Draws a page off screen with the same components as the book and returns a canvas. */
async function renderPageCanvas(page: Page, ctx: RenderContext, opts: RenderOptions): Promise<HTMLCanvasElement> {
  await document.fonts.ready;
  if (opts.includeImages) {
    await Promise.all(
      page.elements.map((e) => (e.type === "image" ? loadAsset(ctx.notebookPath, e.asset).catch(() => null) : null)),
    );
  }
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = `position:fixed;left:-${PAGE_WIDTH * 4}px;top:0;width:${PAGE_WIDTH}px;height:${PAGE_HEIGHT}px;pointer-events:none;`;
  document.body.appendChild(host);
  const root = createRoot(host);
  let stage: Konva.Stage | null = null;
  const theme = { ...(opts.theme === "print" ? printTheme : screenTheme), images: opts.includeImages };
  try {
    root.render(
      <ThemeContext.Provider value={theme}>
        <HandContext.Provider value={ctx.hand}>
          <Stage
            width={PAGE_WIDTH}
            height={PAGE_HEIGHT}
            listening={false}
            ref={(s) => {
              stage = s;
            }}
          >
            <Layer>
              <PageScene page={page} ctx={ctx} />
            </Layer>
          </Stage>
        </HandContext.Provider>
      </ThemeContext.Provider>,
    );
    // Photos are already loaded, so they arrive within a couple of renders; text caches after mount.
    for (let i = 0; i < 6 && !stage; i++) await tick();
    await tick(40);
    await tick(40);
    const s = stage as Konva.Stage | null;
    if (!s) throw new Error("The page could not be drawn");
    s.draw();
    return s.toCanvas({ pixelRatio: opts.pixelRatio });
  } finally {
    root.unmount();
    host.remove();
  }
}

export async function renderPagePng(page: Page, ctx: RenderContext, opts: RenderOptions): Promise<Uint8Array> {
  const canvas = await renderPageCanvas(page, ctx, opts);
  return dataUrlToBytes(canvas.toDataURL("image/png"));
}

/** Two pages side by side, as the spread lies open (without the desk, cover or tabs). */
export async function renderSpreadPng(
  left: { page: Page; ctx: RenderContext },
  right: { page: Page; ctx: RenderContext } | null,
  opts: RenderOptions,
): Promise<Uint8Array> {
  const a = await renderPageCanvas(left.page, left.ctx, opts);
  const b = right ? await renderPageCanvas(right.page, right.ctx, opts) : null;
  const out = document.createElement("canvas");
  out.width = a.width * 2;
  out.height = a.height;
  const c = out.getContext("2d");
  if (!c) throw new Error("Could not draw the spread");
  c.drawImage(a, 0, 0);
  if (b) c.drawImage(b, a.width, 0);
  else {
    c.fillStyle = opts.theme === "print" ? "#ffffff" : "#f3e8d0";
    c.fillRect(a.width, 0, a.width, a.height);
  }
  // The crease where the pages meet.
  c.fillStyle = "rgba(90,60,30,0.25)";
  c.fillRect(a.width - opts.pixelRatio, 0, opts.pixelRatio * 2, a.height);
  return dataUrlToBytes(out.toDataURL("image/png"));
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
