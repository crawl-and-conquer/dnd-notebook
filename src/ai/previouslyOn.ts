import { create } from "zustand";
import { makeText } from "../canvas/elements";
import { bytesToBase64, renderPagePng } from "../export/render";
import type { Page } from "../model/page";
import { PAGE_HEADER_H } from "../model/page";
import { useNotebook } from "../store/notebook";
import { AiRequestError, createProvider, listModelsCached } from "./client";
import { PREVIOUSLY_ON_SYSTEM } from "./prompts";

const MAX_TOKENS = 500;
const PREV_PAGES = 3;
const NOTE_X = 60;
const NOTE_Y = PAGE_HEADER_H + 20;
const NOTE_COLOUR = "#2b2622";

type Phase = "idle" | "running" | "done" | "error";

type PreviouslyOnStore = {
  phase: Phase;
  error: string | null;
  run(characterId: string, sectionId: string, leftPageId: string): Promise<void>;
  reset(): void;
};

function pageToText(page: Page): string {
  const lines: string[] = [];
  if (page.title.trim()) lines.push(`## ${page.title.trim()}`);
  for (const el of page.elements) {
    if (el.type === "text" && el.text.trim()) lines.push(el.text.trim());
    if (el.type === "checklist") {
      for (const item of el.items) {
        if (item.text.trim()) lines.push(`- ${item.text.trim()}`);
      }
    }
  }
  return lines.join("\n");
}

export const usePreviouslyOn = create<PreviouslyOnStore>((set) => ({
  phase: "idle",
  error: null,

  async run(characterId, sectionId, leftPageId) {
    set({ phase: "running", error: null });
    try {
      const s = useNotebook.getState();
      const ch = s.characters[characterId];
      if (ch?.status !== "ok") throw new Error("Character not loaded.");

      const pages = ch.sectionPages[sectionId] ?? [];
      const leftIdx = pages.findIndex((p) => p.page.id === leftPageId);
      const priorPages = leftIdx > 0
        ? pages.slice(Math.max(0, leftIdx - PREV_PAGES), leftIdx).map((p) => p.page)
        : [];

      const userText = priorPages.length
        ? priorPages.map(pageToText).filter(Boolean).join("\n\n---\n\n")
        : "(No previous session notes found.)";

      const ai = s.config.ai;
      const model = ai.models[ai.provider] ?? "";
      if (!model) throw new AiRequestError("bad_config", "Choose a model in AI settings first.");

      // Optional page snapshots when model supports vision and setting is on
      let images: string[] | undefined;
      if (ai.includeSnapshots && priorPages.length) {
        const vision = await listModelsCached(
          ai.provider,
          ai.provider === "custom" ? ai.customBaseUrl : undefined,
        )
          .then(({ models }) => !!models.find((m) => m.id === model)?.vision)
          .catch(() => false);
        if (vision) {
          images = [];
          for (const page of priorPages) {
            try {
              const png = await renderPagePng(page, ch.notebookPath, {
                theme: "screen",
                pixelRatio: 1,
                includeImages: true,
              });
              images.push(bytesToBase64(png));
            } catch {
              // skip snapshot if render fails
            }
          }
        }
      }

      const provider = createProvider(ai.provider, { model, baseUrl: ai.customBaseUrl });
      const recap = await provider.complete({
        system: PREVIOUSLY_ON_SYSTEM,
        messages: [{ role: "user", content: userText, images }],
        maxTokens: MAX_TOKENS,
        temperature: ai.temperature,
      });

      // Add recap as a text element on the left page
      const el = makeText(NOTE_X, NOTE_Y, NOTE_COLOUR, false, recap.trim());
      useNotebook.getState().updatePageIn(characterId, sectionId, leftPageId, (p) => ({
        ...p,
        elements: [...p.elements, el],
      }));

      set({ phase: "done" });
      // Auto-reset after 3 seconds
      setTimeout(() => set((st) => st.phase === "done" ? { phase: "idle" } : st), 3000);
    } catch (e) {
      const msg = e instanceof AiRequestError ? e.message : String(e);
      set({ phase: "error", error: msg });
    }
  },

  reset() {
    set({ phase: "idle", error: null });
  },
}));
