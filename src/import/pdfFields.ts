import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PdfField } from "./ddb/fields";

let configured = false;

/** Every form field in the PDF, in page order, with its value. Read locally; nothing is uploaded. */
export async function readPdfFields(data: ArrayBuffer): Promise<{ fields: PdfField[]; pages: number }> {
  if (!configured) {
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    configured = true;
  }
  const task = pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) });
  const doc = await task.promise;
  const fields: PdfField[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      for (const a of await page.getAnnotations()) {
        if (!a.fieldName) continue;
        const v = a.fieldValue ?? a.buttonValue ?? "";
        fields.push({ page: p, name: String(a.fieldName), value: Array.isArray(v) ? v.join(", ") : String(v) });
      }
    }
    return { fields, pages: doc.numPages };
  } finally {
    void task.destroy();
  }
}

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
