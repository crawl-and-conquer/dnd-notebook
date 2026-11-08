import type { Sheet } from "../../model/sheet";

/**
 * Where the words on a sheet go (SPEC: Where things go). The backstory goes to Backstory with
 * an "At a glance" block; lines that start with "loves", "hates", "wants", "friend:" and so on
 * are also copied to Likes, Dislikes, Wants or Notes. A line goes only to the first of those
 * it matches. Matching ignores case.
 */
export type Routed = {
  backstory: string | null;
  glance: { label: string; value: string }[];
  likes: string[];
  dislikes: string[];
  wants: string[];
  /** Notes under "People": allies and organisations, friend/foe/rival/ally lines. */
  people: string[];
  /** Plain notes: flaws and additional notes. */
  notes: string[];
};

const RULES: { to: "likes" | "dislikes" | "wants" | "people"; re: RegExp }[] = [
  { to: "likes", re: /^(loves|likes|enjoys)\b/i },
  { to: "dislikes", re: /^(hates|dislikes|can['’]t stand)\b/i },
  { to: "wants", re: /^(wants|goals?\b|dreams of)\b/i },
  { to: "people", re: /^(friend|foe|rival|ally)\s*:/i },
];

const lines = (text: string | null | undefined) =>
  (text ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

export function routeDetails(sheet: Sheet): Routed {
  const id = sheet.identity;
  const out: Routed = {
    backstory: sheet.details.backstory?.trim() || null,
    glance: (
      [
        ["Gender", id.gender],
        ["Age", id.age],
        ["Size", id.size],
        ["Height", id.height],
        ["Weight", id.weight],
        ["Alignment", id.alignment],
        ["Faith", id.faith],
        ["Skin", id.skin],
        ["Eyes", id.eyes],
        ["Hair", id.hair],
      ] as const
    ).flatMap(([label, value]) => (value ? [{ label, value }] : [])),
    likes: [],
    dislikes: [],
    wants: [],
    people: [],
    notes: [],
  };
  for (const line of [...lines(sheet.details.backstory), ...lines(sheet.details.personality)]) {
    const rule = RULES.find((r) => r.re.test(line));
    if (rule) out[rule.to].push(line);
  }
  out.wants.push(...lines(sheet.details.ideals), ...lines(sheet.details.bonds));
  out.people.unshift(...lines(sheet.details.allies));
  out.notes.push(...lines(sheet.details.flaws), ...lines(sheet.details.additionalNotes));
  return out;
}

/** Names mentioned in the people lines, for the dialog's quote ("Ash-Seven, Benjamin, Jerimiah"). */
export function peopleNames(people: string[]): string[] {
  return people
    .map((l) => l.replace(/^(friend|foe|rival|ally)\s*:\s*/i, "").split(/\s+[-–—]\s+|,/)[0].trim())
    .filter(Boolean)
    .map((n) => n.replace(/\b\p{Ll}/u, (c) => c.toUpperCase()));
}
