import { useEffect, useState } from "react";
import { backend } from "../storage/backend";

/** Photos are placed at most 260 px wide by default (SPEC: Photos); they can be resized after. */
export const MAX_IMAGE_WIDTH = 260;
/** ...and no taller than this, so a portrait photo still fits on the page. */
export const MAX_IMAGE_HEIGHT = 300;

const cache = new Map<string, Promise<HTMLImageElement>>();
const key = (notebookPath: string, rel: string) => `${notebookPath}|${rel}`;

function loadFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = url;
  });
}

export function loadAsset(notebookPath: string, rel: string): Promise<HTMLImageElement> {
  const k = key(notebookPath, rel);
  let p = cache.get(k);
  if (!p) {
    p = backend
      .readAsset(notebookPath, rel)
      .then((buf) => loadFromUrl(URL.createObjectURL(new Blob([buf], { type: "image/png" }))));
    p.catch(() => cache.delete(k));
    cache.set(k, p);
  }
  return p;
}

export function useAsset(notebookPath: string, rel: string): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    let live = true;
    loadAsset(notebookPath, rel).then(
      (i) => live && setImg(i),
      () => live && setImg(null),
    );
    return () => {
      live = false;
    };
  }, [notebookPath, rel]);
  return img;
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

/**
 * Converts any browser-readable image to PNG, stores it in `assets/` (de-duplicated
 * by hash on the Rust side) and returns its path and natural size.
 */
export async function importImage(
  notebookPath: string,
  blob: Blob,
): Promise<{ rel: string; width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not read the image");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const png = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not convert the image"))),
      "image/png",
    ),
  );
  const rel = await backend.saveAsset(notebookPath, toBase64(await png.arrayBuffer()));
  const k = key(notebookPath, rel);
  if (!cache.has(k)) cache.set(k, loadFromUrl(URL.createObjectURL(png)));
  return { rel, width: canvas.width, height: canvas.height };
}

/** Placed size: at most 260 x 300, keeping the aspect ratio; small images keep their size. */
export function placedSize(width: number, height: number): { w: number; h: number } {
  const k = Math.min(1, MAX_IMAGE_WIDTH / width, MAX_IMAGE_HEIGHT / height);
  return { w: Math.round(width * k), h: Math.round(height * k) };
}
