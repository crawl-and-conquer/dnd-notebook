/**
 * Browser-based OCR pipeline for DDB character sheet PDFs.
 * Renders each page via pdfjs-dist (Chromium canvas) and OCRs with Tesseract.js.
 * Returns positioned OcrWord items in PDF points (top-left origin).
 */
import * as pdfjs from "pdfjs-dist";
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { OcrWord } from "./ddb/types";

/** Render scale: 2× is enough for Tesseract and keeps memory reasonable. */
const SCALE = 2;

/** Minimum Tesseract confidence to include a word (0–100). */
const MIN_CONF = 30;

let workerConfigured = false;

function configurePdfWorker() {
  if (!workerConfigured) {
    pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl as string;
    workerConfigured = true;
  }
}

/** Progress callback: page number (1-based) and total pages. */
export type OcrProgressFn = (page: number, total: number) => void;

/**
 * OCR all pages of a PDF file and return a flat array of OcrWord items.
 * Words are in PDF points, top-left origin, page 1 = page 1, etc.
 */
export async function ocrPdf(
  file: File | ArrayBuffer,
  onProgress?: OcrProgressFn,
): Promise<OcrWord[]> {
  configurePdfWorker();

  const data =
    file instanceof ArrayBuffer
      ? new Uint8Array(file)
      : new Uint8Array(await (file as File).arrayBuffer());

  const doc = await pdfjs.getDocument({ data }).promise;
  const pageCount = doc.numPages;

  // Lazy-load Tesseract to avoid bundling it unless import is actually used.
  const Tesseract = await import("tesseract.js");
  const worker = await Tesseract.createWorker("eng", 1);
  await worker.setParameters({ tessedit_pageseg_mode: "6" as unknown as Tesseract.PSM });

  const result: OcrWord[] = [];

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    onProgress?.(pageNum, pageCount);

    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: SCALE });

    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;

    const blob: Blob = await new Promise((res) =>
      canvas.toBlob((b) => res(b!), "image/png"),
    );

    const { data: ocr } = await worker.recognize(blob);
    const words: Tesseract.Word[] =
      (ocr as unknown as { words: Tesseract.Word[] }).words ??
      (ocr.blocks ?? []).flatMap((b) =>
        ((b as unknown as { lines?: { words?: Tesseract.Word[] }[] }).lines ?? []).flatMap(
          (l) => l.words ?? [],
        ),
      );

    for (const word of words) {
      if (!word.text.trim() || word.confidence < MIN_CONF) continue;
      result.push({
        str: word.text,
        x: Math.round((word.bbox.x0 / SCALE) * 10) / 10,
        y: Math.round((word.bbox.y0 / SCALE) * 10) / 10,
        w: Math.round(((word.bbox.x1 - word.bbox.x0) / SCALE) * 10) / 10,
        h: Math.round(((word.bbox.y1 - word.bbox.y0) / SCALE) * 10) / 10,
        page: pageNum,
        conf: Math.round(word.confidence),
      });
    }
  }

  await worker.terminate();
  return result;
}
