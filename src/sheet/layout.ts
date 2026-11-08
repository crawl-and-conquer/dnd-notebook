import {
  ABILITY_KEYS,
  ABILITY_LABELS,
  featureKey,
  hitDiceCount,
  signed,
  type Sheet,
  type SheetPageType,
  type Spell,
  type Trackers,
} from "../model/sheet";

/**
 * The character sheet pages as drawing instructions in page coordinates (570 x 720), laid out
 * to mockups 04 and 05. Values carry the path they edit; bubbles carry the tracker they toggle.
 * Colours are token names, so the print theme can swap them.
 */

export type Bubble =
  | { kind: "slot"; level: string; i: number }
  | { kind: "feature"; key: string; i: number }
  | { kind: "hitdie"; i: number }
  | { kind: "death"; which: "success" | "fail"; i: number }
  | { kind: "prepared"; spell: number };

export type Part =
  | { t: "text"; text: string; size?: number; bold?: boolean; colour?: string; path?: string; minW?: number; fit?: boolean }
  | { t: "label"; text: string; gap?: number }
  | { t: "dot"; on: boolean }
  | { t: "bubble"; filled: boolean; colour?: string; act: Bubble }
  | { t: "gap"; w: number };

export type Item =
  | { k: "box"; x: number; y: number; w: number; h: number; v: 1 | 2 }
  | { k: "shield"; x: number; y: number; w: number; h: number }
  | { k: "oval"; x: number; y: number; w: number; h: number }
  | { k: "coin"; cx: number; cy: number; r: number; fill: string }
  | { k: "dash"; x1: number; y1: number; x2: number; y2: number }
  | { k: "label"; x: number; y: number; text: string; align?: "left" | "center" | "right"; size?: number }
  | { k: "meta"; x: number; y: number; text: string; align?: "left" | "right"; size?: number }
  | { k: "title"; x: number; y: number; text: string }
  | {
      k: "value";
      x: number;
      y: number;
      /** Width available (also the click area for editing). */
      w: number;
      text: string;
      size: number;
      bold?: boolean;
      colour?: string;
      align?: "left" | "center" | "right";
      path?: string;
      /** Shrink the text, then cut it with an ellipsis, so it fits in `w`. */
      fit?: boolean;
    }
  | { k: "row"; x: number; y: number; w: number; parts: Part[] };

const L = 92;
const R = 540;
const W = R - L;
const BROWN = "#6b4a2e";
const GREEN = "#4f6b32";
const OX = "#8e2a2a";
const BLUE = "#2a4e7f";

const show = (v: string | number | null | undefined, signedNumber = false): string =>
  v === null || v === undefined ? "" : typeof v === "number" ? (signedNumber ? signed(v) : String(v)) : v;

const bubbles = (count: number, spent: number, colour: string, act: (i: number) => Bubble): Part[] =>
  Array.from({ length: count }, (_, i) => ({ t: "bubble", filled: i < spent, colour, act: act(i) }) as Part);

const lower = (xs: string[]) => xs.map((x) => x.replace(/\b(Armor|Armour|Weapons)\b/g, "").trim().toLowerCase()).filter(Boolean);

function coreLeft(s: Sheet, t: Trackers, name: string): Item[] {
  const id = s.identity;
  const items: Item[] = [
    { k: "value", x: L, y: 46, w: 300, text: id.name ?? name, size: 48, bold: true, path: "identity.name", fit: true },
    {
      k: "row",
      x: L,
      y: 76,
      w: 330,
      parts: [
        { t: "text", text: show(id.classLevel), size: 20, colour: BROWN, path: "identity.classLevel", minW: 40 },
        { t: "text", text: " · ", size: 20, colour: BROWN },
        { t: "text", text: show(id.species), size: 20, colour: BROWN, path: "identity.species", minW: 40 },
        { t: "text", text: " · ", size: 20, colour: BROWN },
        { t: "text", text: show(id.background), size: 20, colour: BROWN, path: "identity.background", minW: 40 },
      ],
    },
    { k: "label", x: R, y: 54, text: "Player", align: "right" },
    { k: "value", x: R - 120, y: 76, w: 120, text: show(id.player), size: 20, colour: BROWN, align: "right", path: "identity.player", fit: true },
  ];

  const colW = (W - 28) / 3;
  ABILITY_KEYS.forEach((k, i) => {
    const x = L + (i % 3) * (colW + 14);
    const y = 104 + Math.floor(i / 3) * 120;
    const a = s.abilities[k];
    items.push(
      { k: "box", x, y, w: colW, h: 104, v: i % 2 ? 2 : 1 },
      { k: "label", x: x + colW / 2, y: y + 21, text: ABILITY_LABELS[k], align: "center" },
      { k: "value", x, y: y + 64, w: colW, text: show(a.mod, true), size: 40, bold: true, align: "center", path: `abilities.${k}.mod` },
      { k: "oval", x: x + colW / 2 - 22, y: y + 88, w: 44, h: 30 },
      { k: "value", x: x + colW / 2 - 22, y: y + 109, w: 44, text: show(a.score), size: 20, bold: true, align: "center", path: `abilities.${k}.score` },
    );
  });

  const saves: Part[] = [{ t: "label", text: "Saves", gap: 12 }];
  ABILITY_KEYS.forEach((k, i) => {
    const a = s.abilities[k];
    if (i) saves.push({ t: "text", text: " · ", size: 19 });
    if (a.saveProficient) saves.push({ t: "dot", on: true });
    saves.push({ t: "text", text: `${k[0].toUpperCase()}${k.slice(1)} ` , size: 19 });
    saves.push({ t: "text", text: show(a.save, true) || "  ", size: 19, path: `abilities.${k}.save`, minW: 18 });
  });
  items.push({ k: "row", x: L, y: 377, w: W, parts: saves });

  const statW = (W - 36) / 4;
  const stats: [string, string, string, boolean][] = [
    ["Armour", show(s.combat.ac), "combat.ac", false],
    ["Initiative", show(s.combat.initiative, true), "combat.initiative", false],
    ["Speed", show(s.combat.speed?.replace(/\.?\s*\(Walking\)/i, "").replace(/\.$/, "") ?? null), "combat.speed", false],
    ["Proficiency", show(s.combat.proficiency, true), "combat.proficiency", false],
  ];
  stats.forEach(([label, value, path], i) => {
    const x = L + i * (statW + 12);
    const y = 396;
    if (i === 0) items.push({ k: "shield", x: x + statW / 2 - 34, y: y + 4, w: 68, h: 76 });
    else items.push({ k: "box", x, y, w: statW, h: 96, v: i % 2 ? 2 : 1 });
    items.push(
      { k: "value", x, y: y + (i === 0 ? 50 : 50), w: statW, text: value, size: 30, bold: true, align: "center", path, fit: true },
      { k: "label", x: x + statW / 2, y: y + (i === 0 ? 94 : 78), text: label, align: "center" },
    );
  });

  const hpW = ((W - 12) * 1.6) / 2.6;
  const hdW = W - 12 - hpW;
  const hy = 510;
  items.push({ k: "box", x: L, y: hy, w: hpW, h: 104, v: 1 });
  const third = hpW / 3;
  const hpCols: [string, string, string, string, boolean][] = [
    ["Max HP", show(s.combat.maxHp), "combat.maxHp", OX, true],
    ["Current", t.hp.current === null ? "" : String(t.hp.current), "trackers.hp.current", "#6b5a4a", false],
    ["Temp", t.hp.temp === null || t.hp.temp === 0 ? "—" : String(t.hp.temp), "trackers.hp.temp", "#6b5a4a", false],
  ];
  hpCols.forEach(([label, value, path, colour, bold], i) => {
    const x = L + i * third;
    items.push(
      { k: "value", x, y: hy + 56, w: third, text: value, size: 40, bold, colour, align: "center", path },
      { k: "label", x: x + third / 2, y: hy + 84, text: label, align: "center" },
    );
  });
  items.push(
    { k: "dash", x1: L + third, y1: hy + 14, x2: L + third, y2: hy + 90 },
    { k: "dash", x1: L + 2 * third, y1: hy + 14, x2: L + 2 * third, y2: hy + 90 },
  );
  const hx = L + hpW + 12;
  const dice = hitDiceCount(s.combat.hitDice);
  items.push(
    { k: "box", x: hx, y: hy, w: hdW, h: 104, v: 2 },
    {
      k: "row",
      x: hx + 14,
      y: hy + 34,
      w: hdW - 28,
      parts: [
        { t: "label", text: "Hit dice", gap: 6 },
        { t: "text", text: show(s.combat.hitDice), size: 24, bold: true, path: "combat.hitDice", minW: 28 },
        { t: "gap", w: 6 },
        ...bubbles(Math.min(dice, 4), t.hitDiceSpent, "--sheet-box", (i) => ({ kind: "hitdie", i })),
      ],
    },
    {
      k: "row",
      x: hx + 14,
      y: hy + 64,
      w: hdW - 28,
      parts: [
        { t: "label", text: "Death saves", gap: 10 },
        ...bubbles(3, t.deathSaves.success, GREEN, (i) => ({ kind: "death", which: "success", i })),
      ],
    },
    {
      k: "row",
      x: hx + hdW - 14 - 3 * 21,
      y: hy + 90,
      w: 3 * 21,
      parts: bubbles(3, t.deathSaves.fail, OX, (i) => ({ kind: "death", which: "fail", i })),
    },
  );

  const p = s.proficiencies;
  const kit = p ? [...lower(p.armour), ...lower(p.weapons)].join(" · ") : "";
  const tools = p ? [...p.tools.map((x) => x.toLowerCase()), ...p.languages].join(" · ") : "";
  items.push(
    { k: "row", x: L, y: 664, w: W, parts: [{ t: "label", text: "Trained", gap: 8 }, { t: "text", text: kit, size: 19, fit: true }] },
    { k: "value", x: L, y: 696, w: W, text: tools, size: 19, fit: true },
  );
  return items;
}

function coreRight(s: Sheet, t: Trackers): Item[] {
  const items: Item[] = [
    { k: "meta", x: L, y: 76, text: "Sheet 1 of 2" },
    { k: "label", x: L, y: 122, text: "Skills" },
    { k: "meta", x: R, y: 122, text: "● proficient", align: "right", size: 12 },
  ];
  const colW = (W - 10) / 2;
  s.skills.forEach((sk, i) => {
    const x = L + (i < 9 ? 0 : colW + 10);
    const y = 152 + (i % 9) * 32;
    items.push({
      k: "row",
      x,
      y,
      w: colW,
      parts: [
        { t: "dot", on: sk.proficient },
        { t: "text", text: show(sk.mod, true), size: 22, bold: true, path: `skills.${i}.mod`, minW: 34 },
        { t: "gap", w: 8 },
        { t: "text", text: sk.name + (sk.expertise ? " ★" : ""), size: 22 },
        { t: "gap", w: 6 },
        { t: "label", text: sk.ability },
      ],
    });
  });
  const pv = s.passives;
  items.push({
    k: "row",
    x: L,
    y: 440,
    w: W,
    parts: [
      { t: "label", text: "Passive", gap: 12 },
      { t: "text", text: "Perception ", size: 22 },
      { t: "text", text: show(pv.perception), size: 22, bold: true, path: "passives.perception", minW: 18 },
      { t: "text", text: " · Insight ", size: 22 },
      { t: "text", text: show(pv.insight), size: 22, bold: true, path: "passives.insight", minW: 18 },
      { t: "text", text: " · Investigation ", size: 22 },
      { t: "text", text: show(pv.investigation), size: 22, bold: true, path: "passives.investigation", minW: 18 },
    ],
  });
  items.push({ k: "label", x: L, y: 474, text: "Attacks & cantrips" });
  const c1 = (W - 50) * (1.5 / 3.1);
  const atk = s.attacks ?? [];
  const rows = Math.max(3, Math.min(5, atk.length));
  for (let i = 0; i < rows; i++) {
    const a = atk[i];
    const y = 504 + i * 32;
    items.push(
      { k: "value", x: L, y, w: c1 - 6, text: a?.name ?? "", size: 23, path: a ? `attacks.${i}.name` : undefined, fit: true },
      { k: "value", x: L + c1, y, w: 50, text: a?.hit ?? "", size: 23, bold: true, path: a ? `attacks.${i}.hit` : undefined },
      { k: "value", x: L + c1 + 50, y, w: W - c1 - 50, text: a ? a.damage.replace(/([+-])/g, " $1 ").replace(/\s+/g, " ").toLowerCase() : "", size: 23, path: a ? `attacks.${i}.damage` : undefined, fit: true },
    );
  }
  const limited = (s.features ?? []).filter((f) => f.uses).slice(0, 1);
  limited.forEach((f, j) => {
    const used = t.featureUses[featureKey(f)] ?? 0;
    items.push({
      k: "row",
      x: L,
      y: 504 + rows * 32 + j * 32,
      w: W,
      parts: [
        { t: "label", text: f.name, gap: 10 },
        ...bubbles(f.uses!.max, used, GREEN, (i) => ({ kind: "feature", key: featureKey(f), i })),
        { t: "gap", w: 10 },
        { t: "text", text: `${f.uses!.max} per ${f.uses!.per} rest`, size: 19, colour: BROWN },
      ],
    });
  });
  return items;
}

/** A feature's text cut down to its first sentence, without D&D Beyond's "|" lines. */
export function featureSummary(text: string): string {
  const plain = text
    .split("\n")
    .map((l) => l.trim().replace(/^\|\s*/, ""))
    .filter((l) => l && !/^\d+\s*\/\s*(Long|Short) Rest/i.test(l))
    .join(" ")
    .replace(/\s*•\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  const first = /^(.+?[.!?])(\s|$)/.exec(plain);
  return (first ? first[1] : plain).replace(/\.$/, "");
}

function features(s: Sheet, t: Trackers): Item[] {
  const items: Item[] = [
    { k: "title", x: L, y: 74, text: "Features & traits" },
    { k: "meta", x: R, y: 74, text: "Sheet 2 of 2", align: "right" },
  ];
  let y = 96;
  const bottom = 704;
  let group = "";
  let hidden = 0;
  for (const f of (s.features ?? []).filter((x) => x.text.trim() || x.uses)) {
    const need = (f.group !== group ? 32 : 0) + 32 + (f.uses ? 32 : 0);
    if (y + need > bottom) {
      hidden++;
      continue;
    }
    if (f.group !== group) {
      group = f.group;
      items.push({ k: "label", x: L, y: y + 25, text: group });
      y += 32;
    }
    items.push({
      k: "row",
      x: L,
      y: y + 25,
      w: W,
      parts: [
        { t: "text", text: f.name, size: 23, bold: true },
        { t: "text", text: "  ", size: 20 },
        { t: "text", text: featureSummary(f.text), size: 20, colour: BROWN, fit: true },
      ],
    });
    y += 32;
    if (f.uses) {
      const used = t.featureUses[featureKey(f)] ?? 0;
      items.push({
        k: "row",
        x: L + 24,
        y: y + 25,
        w: W - 24,
        parts: [
          { t: "text", text: "uses", size: 20, colour: BROWN },
          { t: "gap", w: 4 },
          ...bubbles(f.uses.max, used, "--sheet-box", (i) => ({ kind: "feature", key: featureKey(f), i })),
          { t: "text", text: `  back on a ${f.uses.per} rest`, size: 20, colour: BROWN },
        ],
      });
      y += 32;
    }
  }
  if (hidden) items.push({ k: "meta", x: L, y: y + 22, text: `…and ${hidden} more in the export and the PDF` });
  return items;
}

const ORD = ["Cantrips", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];
const COIN_FILL: Record<string, string> = { cp: "#d9a57a", sp: "#e2e0d6", ep: "#d7d2b8", gp: "#e6c66a", pp: "#e9ecef" };

function spellsKit(s: Sheet, t: Trackers, spellPages: number): Item[] {
  const sc = s.spellcasting;
  const abilityName = sc?.ability
    ? (ABILITY_LABELS as Record<string, string>)[sc.ability.toLowerCase()] ?? sc.ability
    : "";
  const items: Item[] = [
    { k: "title", x: L, y: 74, text: "Spells & kit" },
    { k: "meta", x: R, y: 74, text: [sc?.class, abilityName].filter(Boolean).join(" · "), align: "right" },
  ];
  const bw = (W - 24) / 3;
  const boxes: [string, string, string][] = [
    ["Ability", show(sc?.ability ?? null), "spellcasting.ability"],
    ["Save DC", show(sc?.saveDc ?? null), "spellcasting.saveDc"],
    ["Spell attack", show(sc?.attack ?? null, true), "spellcasting.attack"],
  ];
  boxes.forEach(([label, value, path], i) => {
    const x = L + i * (bw + 12);
    items.push(
      { k: "box", x, y: 100, w: bw, h: 84, v: i % 2 ? 2 : 1 },
      { k: "value", x, y: 141, w: bw, text: value, size: 30, bold: true, align: "center", path: sc ? path : undefined },
      { k: "label", x: x + bw / 2, y: 170, text: label, align: "center" },
    );
  });
  let y = 192;
  const row = (parts: Part[]) => {
    items.push({ k: "row", x: L, y: y + 25, w: W, parts });
    y += 32;
  };
  const slotParts: Part[] = [{ t: "label", text: "Slots", gap: 10 }];
  for (const [level, count] of Object.entries(sc?.slots ?? {})) {
    slotParts.push({ t: "text", text: `${ORD[Number(level)] ?? level} `, size: 23 });
    slotParts.push(...bubbles(count, t.slotsSpent[level] ?? 0, "--sheet-box", (i) => ({ kind: "slot", level, i })));
    slotParts.push({ t: "gap", w: 16 });
  }
  row(slotParts);
  const spells = sc?.spells ?? [];
  row([{ t: "label", text: "Cantrips", gap: 10 }, { t: "text", text: spells.filter((x) => x.level === 0).map((x) => x.name).join(" · "), size: 23, fit: true }]);
  const always = spells.filter((x) => x.prepared === "always");
  if (always.length) row([{ t: "label", text: "Always", gap: 10 }, { t: "text", text: always.map((x) => x.name).join(" · "), size: 23, fit: true }]);
  if (spells.length) {
    const from = 5;
    const to = 4 + spellPages;
    row([{ t: "text", text: `Full spell list → spell ${to > from ? `pages ${from}–${to}` : `page ${from}`}`, size: 23, colour: BLUE }]);
  }
  const eq = s.equipment;
  items.push({ k: "label", x: L, y: y + 25, text: "Coin" });
  if (eq?.carried) items.push({ k: "meta", x: R, y: y + 25, text: `carrying ${eq.carried.replace(/\.$/, "")} of ${eq.encumbered ?? "?"}`, align: "right", size: 12 });
  y += 32;
  (["cp", "sp", "ep", "gp", "pp"] as const).forEach((c, i) => {
    const cx = L + 20 + i * 54;
    items.push(
      { k: "coin", cx, cy: y + 22, r: 20, fill: COIN_FILL[c] },
      { k: "value", x: cx - 20, y: y + 30, w: 40, text: show(eq?.coins[c] ?? null), size: 20, bold: true, align: "center", path: eq ? `equipment.coins.${c}` : undefined },
      { k: "label", x: cx, y: y + 58, text: c.toUpperCase(), align: "center" },
    );
  });
  y += 70;
  items.push({ k: "label", x: L, y: y + 25, text: "Pack" });
  y += 32;
  const kit = eq?.items ?? [];
  const half = (W - 16) / 2;
  const fits = Math.max(0, Math.floor((704 - y) / 32)) * 2;
  kit.slice(0, fits).forEach((it, i) => {
    const x = L + (i % 2) * (half + 16);
    const yy = y + Math.floor(i / 2) * 32 + 25;
    items.push({
      k: "row",
      x,
      y: yy,
      w: half,
      parts: [
        { t: "text", text: `${it.name}${it.qty > 1 ? ` ×${it.qty}` : ""}`, size: 22, fit: true },
        { t: "text", text: `  ${it.weight.replace(/\.$/, "")}`, size: 18, colour: BROWN },
      ],
    });
  });
  if (kit.length > fits) items.push({ k: "meta", x: R, y: 712, text: `+${kit.length - fits} more`, align: "right", size: 12 });
  return items;
}

/** Rows the spell list needs: a header per level, then a row per spell. */
type ListRow = { kind: "head"; level: number; slots: number | undefined } | { kind: "spell"; spell: Spell; index: number };
export const SPELL_ROWS_PER_PAGE = 18;

export function spellListRows(s: Sheet): ListRow[] {
  const sc = s.spellcasting;
  if (!sc) return [];
  const rows: ListRow[] = [];
  let level = -1;
  sc.spells
    .map((spell, index) => ({ spell, index }))
    .sort((a, b) => a.spell.level - b.spell.level || a.index - b.index)
    .forEach(({ spell, index }) => {
      if (spell.level !== level) {
        level = spell.level;
        rows.push({ kind: "head", level, slots: sc.slots[String(level)] });
      }
      rows.push({ kind: "spell", spell, index });
    });
  return rows;
}

/** How many spell-list pages the sheet needs (at least one). */
export function spellListPageCount(s: Sheet): number {
  return Math.max(1, Math.ceil(spellListRows(s).length / SPELL_ROWS_PER_PAGE));
}

const shortDuration = (d: string) =>
  d
    .replace(/^Concentration,\s*up to\s*/i, "")
    .replace(/\bminutes?\b/i, "min")
    .replace(/\bhours?\b/i, "h")
    .replace(/Instantaneous/i, "instant");

function spellList(s: Sheet, index: number): Item[] {
  const sc = s.spellcasting;
  const items: Item[] = [
    { k: "title", x: L, y: 74, text: index === 0 ? "Spells" : "Spells, cont." },
    {
      k: "meta",
      x: R,
      y: 74,
      text: sc ? [sc.class, sc.saveDc !== null ? `DC ${sc.saveDc}` : null, sc.attack !== null ? signed(sc.attack) : null].filter(Boolean).join(" · ") : "",
      align: "right",
    },
  ];
  const cols = { bub: L, name: L + 22, time: L + 196, range: L + 248, comp: L + 334, dur: L + 384, conc: R - 10 };
  const head = (x: number, text: string) => items.push({ k: "label", x, y: 122, text, size: 9.5 });
  head(cols.name, "Name");
  head(cols.time, "Time");
  head(cols.range, "Range");
  head(cols.comp, "Comp.");
  head(cols.dur, "Duration");
  items.push({ k: "label", x: R, y: 122, text: "C", align: "right", size: 9.5 });
  const rows = spellListRows(s).slice(index * SPELL_ROWS_PER_PAGE, (index + 1) * SPELL_ROWS_PER_PAGE);
  rows.forEach((r, i) => {
    const y = 152 + i * 32;
    if (r.kind === "head") {
      items.push({ k: "label", x: L, y, text: r.level === 0 ? "Cantrips" : `${ORD[r.level]} level${r.slots ? ` · ${r.slots} slots` : ""}` });
      return;
    }
    const sp = r.spell;
    items.push(
      {
        k: "row",
        x: cols.bub,
        y,
        w: 18,
        parts: [{ t: "bubble", filled: sp.prepared !== "no", colour: sp.prepared === "always" ? GREEN : "--sheet-box", act: { kind: "prepared", spell: r.index } }],
      },
      { k: "value", x: cols.name, y, w: 170, text: sp.name + (sp.ritual ? " (R)" : ""), size: 21, bold: true, fit: true },
      { k: "value", x: cols.time, y, w: 48, text: sp.time, size: 18, fit: true },
      { k: "value", x: cols.range, y, w: 82, text: sp.range.replace(/\/.*/, ""), size: 18, fit: true },
      { k: "value", x: cols.comp, y, w: 46, text: sp.components.replace(/,/g, ""), size: 18, fit: true },
      { k: "value", x: cols.dur, y, w: 128, text: shortDuration(sp.duration), size: 18, fit: true },
    );
    if (sp.concentration) items.push({ k: "value", x: cols.conc - 6, y, w: 16, text: "C", size: 18, bold: true, colour: OX, align: "right" });
  });
  if (!sc) items.push({ k: "meta", x: L, y: 160, text: "No spells yet. Import a sheet, or write them in." });
  return items;
}

export function layoutSheetPage(
  type: SheetPageType,
  index: number,
  sheet: Sheet,
  trackers: Trackers,
  characterName: string,
): Item[] {
  switch (type) {
    case "core-left":
      return coreLeft(sheet, trackers, characterName);
    case "core-right":
      return coreRight(sheet, trackers);
    case "features":
      return features(sheet, trackers);
    case "spells-kit":
      return spellsKit(sheet, trackers, spellListPageCount(sheet));
    case "spell-list":
      return spellList(sheet, index);
  }
}
