import { create } from "zustand";
import { makeText } from "../canvas/elements";
import { bytesToBase64, renderSpreadPng, type RenderContext } from "../export/render";
import type { LoadedPage } from "../storage/notebook";
import { useNotebook } from "../store/notebook";
import { AiRequestError, createProvider, listModelsCached } from "./client";
import { PREVIOUSLY_ON_SYSTEM } from "./prompts";
import { recapText, sessionsBefore, type SessionGroup } from "./recap";

/** At most this many spread snapshots in one request. */
const MAX_SNAPSHOTS = 5;
const MAX_TOKENS = 500;
/** Where the sticky note goes on the session's first page: just under the header, inside the margin. */
const NOTE_X = 110;
const NOTE_Y = 132;
const NOTE_W = 360;
const NOTE_COLOUR = "#2b2622";

type Phase = "idle" | "running" | "done" | "error";

type PreviouslyOnStore = {
  phase: Phase;
  error: string | null;
  /** The page the last run was for, so the button shows its state on the right spread. */
  pageId: string | null;
  run(characterId: string, sectionId: string, pageId: string): Promise<void>;
  reset(): void;
};

export const usePreviouslyOn = create<PreviouslyOnStore>((set, get) => ({
  phase: "idle",
  error: null,
  pageId: null,

  async run(characterId, sectionId, pageId) {
    if (get().phase === "running") return;
    set({ phase: "running", error: null, pageId });
    try {
      const s = useNotebook.getState();
      const ch = s.characters[characterId];
      if (ch?.status !== "ok") throw new Error("This character's notebook is not loaded.");
      const loaded = ch.sectionPages[sectionId] ?? [];
      const pages = loaded.map((p) => p.page);
      const index = pages.findIndex((p) => p.id === pageId);
      if (index < 0) throw new Error("Write on this page first, then try again.");
      const groups = sessionsBefore(pages, index);
      if (!groups.length) throw new Error("There are no earlier sessions to recap yet.");

      const ai = s.config.ai;
      const model = ai.models[ai.provider] ?? "";
      if (!model) throw new AiRequestError("bad_config", "Choose a model in Settings, AI first.");

      let images: string[] | undefined;
      if (ai.includeSnapshots) {
        const vision = await listModelsCached(ai.provider, ai.provider === "custom" ? ai.customBaseUrl : undefined)
          .then(({ models }) => !!models.find((m) => m.id === model)?.vision)
          .catch(() => false);
        if (vision) images = await snapshots(loaded, groups, ch.notebookPath, { glyphs: ch.glyphs, hand: ch.character.hand });
      }

      const provider = createProvider(ai.provider, { model, baseUrl: ai.customBaseUrl });
      const recap = (
        await provider.complete({
          system: PREVIOUSLY_ON_SYSTEM,
          messages: [{ role: "user", content: recapText(pages, groups), images }],
          maxTokens: MAX_TOKENS,
          temperature: ai.temperature,
        })
      ).trim();
      if (!recap) throw new Error("The AI sent back an empty recap. Try again.");

      const target = loaded[index].page;
      const stickies = target.elements.filter((e) => e.type === "text" && e.sticky).length;
      const note = {
        ...makeText(NOTE_X, NOTE_Y + stickies * 32, NOTE_COLOUR, false, `Previously on...\n${recap}`),
        w: NOTE_W,
        sticky: true,
        rotation: -1.2,
      };
      useNotebook.getState().updatePageIn(characterId, sectionId, pageId, (p) => ({
        ...p,
        elements: [...p.elements, note],
      }));
      set({ phase: "done" });
      setTimeout(() => set((st) => (st.phase === "done" ? { phase: "idle" } : st)), 3000);
    } catch (e) {
      set({ phase: "error", error: e instanceof Error ? e.message : String(e) });
    }
  },

  reset() {
    set({ phase: "idle", error: null, pageId: null });
  },
}));

/** Renders the spreads the recapped sessions cover, newest last, at most MAX_SNAPSHOTS. */
async function snapshots(
  loaded: LoadedPage[],
  groups: SessionGroup[],
  notebookPath: string,
  hand: RenderContext["hand"],
): Promise<string[]> {
  const lefts: number[] = [];
  for (const g of groups) {
    for (let i = g.start - (g.start % 2); i < g.end; i += 2) if (!lefts.includes(i)) lefts.push(i);
  }
  const out: string[] = [];
  for (const left of lefts.slice(-MAX_SNAPSHOTS)) {
    const l = loaded[left];
    const r = loaded[left + 1] ?? null;
    const ctx = (side: "l" | "r", index: number, other: LoadedPage | null): RenderContext => ({
      notebookPath,
      side,
      index,
      otherTitle: other?.page.title ?? "",
      pill: null,
      hand,
    });
    try {
      const png = await renderSpreadPng(
        { page: l.page, ctx: ctx("l", left, r) },
        r ? { page: r.page, ctx: ctx("r", left + 1, l) } : null,
        { theme: "screen", pixelRatio: 1, includeImages: true },
      );
      out.push(bytesToBase64(png));
    } catch {
      // A spread that will not draw is left out; the text still goes.
    }
  }
  return out;
}
