import { describe, expect, it } from "vitest";
import { makeChecklist, makeText } from "../canvas/elements";
import { createPage, type Page } from "../model/page";
import { recapText, sessionGroups, sessionsBefore } from "./recap";

const session = (n: number, text = "", place = ""): Page => ({
  ...createPage(new Date(), `Session ${n}`),
  session: { number: n, date: `2026-10-0${n}`, place },
  elements: text ? [makeText(92, 100, "#000", false, text)] : [],
});
const cont = (text: string): Page => ({ ...createPage(), title: "", elements: [makeText(92, 100, "#000", false, text)] });

describe("sessionGroups", () => {
  it("groups each session with the pages after it", () => {
    const pages = [cont("loose"), session(1, "a"), cont("b"), session(2, "c"), cont("d"), cont("e")];
    expect(sessionGroups(pages).map((g) => [g.start, g.end])).toEqual([
      [1, 3],
      [3, 6],
    ]);
  });

  it("takes at most three sessions before the given page", () => {
    const pages = [1, 2, 3, 4, 5].map((n) => session(n, `s${n}`));
    expect(sessionsBefore(pages, 4).map((g) => g.page.session?.number)).toEqual([2, 3, 4]);
    expect(sessionsBefore(pages, 0)).toEqual([]);
  });
});

describe("recapText", () => {
  it("lists each session with its date, place, text and checklists, oldest first", () => {
    const pages = [session(1, "Met Varis at the docks", "Saltmarsh"), cont("Bought rope"), session(2, "Fought the sahuagin")];
    pages[2].elements.push(makeChecklist(92, 200, ["Pay the harbourmaster"]));
    const text = recapText(pages, sessionGroups(pages));
    expect(text).toContain("## Session 1 (2026-10-01, Saltmarsh)");
    expect(text).toContain("Met Varis at the docks\nBought rope");
    expect(text).toContain("- [ ] Pay the harbourmaster");
    expect(text.indexOf("Session 1")).toBeLessThan(text.indexOf("Session 2"));
  });

  it("leaves out earlier recap sticky notes", () => {
    const p = session(1, "Real notes");
    p.elements.push({ ...makeText(110, 132, "#000", false, "Previously on... old"), sticky: true });
    expect(recapText([p], sessionGroups([p]))).not.toContain("Previously on");
  });
});
