# DnD Notebook: Build Spec

Fri 6 Nov 2026 · @Jake

## Overview

Build a desktop notebook for D&D characters that looks and behaves like a real paper notebook: a two-page spread open on a wooden desk, beige paper with soft red rules, and divider tabs down the right edge. Each character gets their own book, with tabs for Sessions, Backstory, Likes, Dislikes, Wants, Notes and Character sheet. A D&D Beyond character sheet PDF can be imported to fill those tabs and draw the sheet as notebook pages. Each character can also have their own handwriting, drawn letter by letter in a builder.

The app is a fork of the Engineer's Notebook (`jakemulholland-code/engineers-notebook`, v0.1.5). It reuses that app's Tauri shell, canvas, tools, storage, autosave, folder watching, export and release pipeline. It lives in **its own new folder and its own new GitHub repo**, and must never change the Engineer's Notebook folder or repo.

The visual reference is the seven mockups in `mockups/` (PNG for looking at, standalone HTML for exact sizes, colours and CSS). Match them.

| # | Mockup | Shows |
| --- | --- | --- |
| 01 | `01-session-spread` | Main view: shelf of characters, toolbar, two-page spread, section tabs, status bar. Handwritten notes, checklist, highlighter, red circle, map sketch, a framed photo. |
| 02 | `02-backstory-spread` | Imported backstory text in the character's hand; "Print" and "Negative" photo frames with tape on all four corners; appearance facts. |
| 03 | `03-likes-dislikes-ink-palette` | The full ink flyout open: 20 inks, 6 highlighters, your own mixes. |
| 04 | `04-character-sheet-stats-skills` | Sheet page 1–2 drawn as notebook pages: abilities, saves, AC, HP, skills, attacks. A pen note written over it. |
| 05 | `05-character-sheet-features-spells-kit` | Sheet page 3–4: features and traits, spellcasting, slots, coins, pack. |
| 06 | `06-import-character-sheet` | Import dialog: file, what was found, where each part goes, re-import behaviour. |
| 07 | `07-handwriting-builder` | Glyph grid, drawing pad with guide lines, variants, preview with sliders. |

The source character sheet used for the mockups is `reference/cosworth-ddb-sheet.pdf` (a 5-page D&D Beyond export). Use it as the main import test fixture.

**Goals for v1**

- One book per character on a shelf at the left; one folder on disk per character.
- Spread view of two pages at a time, with section tabs on the right edge and page turning in the status bar.
- The same canvas tools as the Engineer's Notebook, with a much larger ink palette, see-through highlighters and saved colour mixes.
- "Lock to lines" in place of lock to grid: things snap to the ruled lines.
- Pasted or inserted images get an old-film photo frame with tape on each corner.
- A character sheet section whose pages are drawn from structured data, so numbers stay editable and can be refreshed from a new PDF without losing pen marks.
- Import a D&D Beyond PDF to create the sheet pages and fill Backstory, Likes, Dislikes and Notes.
- A handwriting builder per character; text on that character's pages renders in their hand, falling back to a base handwriting font for letters not yet drawn.
- Export a character, a section or a spread as Markdown, PDF or both.
- Windows installer from GitHub releases with auto-update, installable side by side with the Engineer's Notebook.

**Not in v1**

- Reminders, dates on items, the date popover and the Meetings view. Remove them (see "What to keep, change and remove").
- Importing sheets from anything other than D&D Beyond PDFs (no Roll20, Foundry or hand-filled PDFs).
- Making a font from a scanned page of writing. Mockup 07 has a "Scan a page of my writing" button; leave it out.
- Dice rolling, initiative tracking, or anything for the DM.
- Sync, sharing or a mobile app.

## Where to build it: new folder, new repo

This is a separate app. Build it in a new folder next to the existing one, and push it to a separate new GitHub repo.

- **Folder:** `C:\Users\jakem\Documents\Github\dnd-notebook` (a sibling of `engineers-notebook`). Create it if it doesn't exist. If it exists and is not empty, stop and ask.
- **Repo:** a new GitHub repo `jakemulholland-code/dnd-notebook`, public (the updater reads release files without a token), default branch `main`. Do not fork on GitHub and do not keep the old git history: start with a fresh `git init`.
- **The Engineer's Notebook folder is read-only for this work.** Copy from it; never edit, move, delete, commit to or push from `C:\Users\jakem\Documents\Github\engineers-notebook` or its repo.

**Setting up the new folder (first part of M0):**

1. Create the new folder and put this pack in it: `SPEC.md` and `CLAUDE.md` at the root, `mockups/` to `docs/mockups/`, `reference/` to `docs/reference/`, and the fonts in `assets/fonts/` to `src/styles/fonts/` (convert them to `.woff2`).
2. Copy the Engineer's Notebook source into the new folder **without** `.git/`, `node_modules/`, `src-tauri/target/`, `dist/`, `test-fixtures/_scratch/`, any `.env*` file, and the old `SPEC.md` and `CLAUDE.md` (this pack's versions replace them).
3. Rename everything that identifies the old app, so both apps can be installed and run side by side without sharing data, keys or updates:

| What | Old | New |
| --- | --- | --- |
| npm package name | `engineers-notebook` | `dnd-notebook` |
| Cargo package name and description | `engineers-notebook`, "Engineer's Notebook" | `dnd-notebook`, "DnD Notebook" |
| Tauri `productName` and window title | "Engineers Notebook", "Engineer's Notebook" | "DnD Notebook" |
| Tauri `identifier` | `uk.co.paramountdigital.engineers-notebook` | `uk.co.paramountdigital.dnd-notebook` |
| App data folder and `APP_MARKER` (`fs.rs`) | `%APPDATA%/engineers-notebook` | `%APPDATA%/dnd-notebook` |
| Env vars | `ENGINEERS_NOTEBOOK_APP_DIR`, `_AI_HOST`, `_KEYRING_SERVICE` | `DND_NOTEBOOK_APP_DIR`, `_AI_HOST`, `_KEYRING_SERVICE` |
| Keyring service (`keychain.rs`) | `engineers-notebook` | `dnd-notebook` |
| Config backup file name | `engineers-notebook-config-<date>.json` | `dnd-notebook-config-<date>.json` |
| AI `APP_TITLE`, `APP_REFERER` (`providers.rs`), prompts, PDF creator, error text | Engineer's Notebook, `.../engineers-notebook` | DnD Notebook, `.../dnd-notebook` |
| Updater endpoint | `.../engineers-notebook/releases/latest/download/latest.json` | `.../dnd-notebook/releases/latest/download/latest.json` |
| Updater signing key and `pubkey` | the old key | **a new key** (`npm run tauri signer generate`), stored as repo secrets `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` on the new repo |
| App icon | notebook outline, mint on Oxford blue | a closed book with a d20 on the cover, gilt (`--gilt`) on cover green (`--cover-default`) |

Search the whole tree for `engineer`, `Engineer`, `ENGINEERS` and `engineers-notebook` afterwards; nothing should remain except in `docs/`.

4. Set the version to `0.1.0`, run `git init`, commit, create the GitHub repo, push and check CI passes.

## What to keep, change and remove

| Area | Action |
| --- | --- |
| Tauri shell, single instance, window state, autostart, updater, process plugins | Keep as is (renamed). |
| Konva canvas, `PageScene`, `ElementNode`, history (undo and redo), selection, paste handling, `perfect-freehand` strokes | Keep. Change the paper and page size (Visual design, Spreads and pages). |
| Canvas tools (select, pen, brush, line, arrow, box, circle, text, image, eraser) | Keep, with the changes in Canvas tools. |
| Ink colours (`INK_COLOURS`), `ThemeContext`, print theme | Replace with the new ink set and paper; keep the theme mechanism. |
| Lock to grid | Replace with Lock to lines. |
| Clients, tabs on the right, "Add client" in Settings | Replace with characters on the shelf, and sections as the right-hand tabs. |
| Storage, atomic autosave with `.bak`, `knownDiskText`, folder watching (`watch.rs`), assets de-duplicated by hash | Keep. Point at the new folder layout. |
| Move notes / change folder flow | Keep, renamed to change a character's folder. |
| Export (Rust `export_*` commands, Markdown, PDF, printer friendly) | Keep, with the changes in Export. |
| Settings panel | Keep the panel; change the sections (Settings). |
| Reminders, `DateTag`, date popover, date pills, `src/reminders/`, `reminders-cache.json`, overdue badge | Remove, with their tests and e2e scripts. |
| Meetings (`src/model/meeting.ts`, `MeetingsView`, meetings payload) | Remove, with their tests. |
| AI providers, keychain, model list, streaming (`providers.rs`, `ai.rs`, `src/ai/client.ts`) | Keep the plumbing. The catch-up panel and prompts go; M8 (optional) uses the plumbing for a session recap. |
| `scripts/e2e-*.mjs` | Keep the harness (`e2e-lib.mjs`); rewrite or drop the scripts per milestone. |

## Tech stack

Unchanged from the Engineer's Notebook unless listed here.

| Area | Choice | Why |
| --- | --- | --- |
| PDF text extraction | `pdfjs-dist` in the front end (text items with positions) | Reads D&D Beyond PDFs locally; positions let us map values to labels. |
| Handwriting rendering | Own Konva shape (`HandText`) drawing glyph strokes with `perfect-freehand` | Keeps strokes vector, supports variants per letter and adjustable slant, spacing and wobble without building a font file. |
| Fonts | Alegreya (headings), Alegreya Sans (interface), Caveat (base hand), Share Tech Mono (photo date stamp), bundled locally | All SIL Open Font License 1.1. TTFs are in `assets/fonts/` of this pack. |

React stays at 18, TypeScript at 5.9 (as in the existing CLAUDE.md).

## Data model and files on disk

Each character is bound to one folder the user chooses. The app creates a `notebook` subfolder in it (not `notes`, so it can't be confused with an Engineer's Notebook folder).

```
<chosen folder>/notebook/
  character.json                    # name, cover colour, section list and order, hand settings, schemaVersion
  sheet.json                        # structured character sheet data (from import or typed in)
  trackers.json                     # spent slots, current HP, death saves, uses: never touched by re-import
  hand/hand.json                    # the character's drawn glyphs
  pages/<sectionId>/0001-<slug>.page.json
  assets/<sha256>.png               # pasted and inserted images, de-duplicated by hash
  imports/2026-11-06-<original-name>.pdf   # copy of each imported sheet, kept as a record
```

**App config** at `%APPDATA%/dnd-notebook/config.json`: characters (id, name, cover colour, folder path, shelf order, archived), ink favourites and saved mixes, default photo frame, general settings, export defaults, and AI settings if M8 is built. Never API keys.

**character.json**

```ts
type Character = {
  schemaVersion: 1;
  id: string; name: string;
  cover: string;                         // hex, the book's cover and spine colour
  sections: Section[];                   // in tab order
  hand: { base: "caveat"; size: number; slant: number; spacing: number; wobble: number }; // builder sliders
  createdAt: string; updatedAt: string;
};
type Section = {
  id: string;                            // "sessions", "backstory", "likes", "dislikes", "wants", "notes", "sheet", or a generated id
  name: string; colour: string;          // tab paper colour
  kind: "free" | "sessions" | "sheet";
  pageOrder: string[];                   // page ids
};
```

New characters get the seven default sections in mockup order, with the tab colours from Visual design. Sections can be added (the "+" tab), renamed, recoloured, reordered and removed; removing a section with pages asks first and moves its files to the Recycle Bin.

**Page file** (extends the existing schema; validate with `zod`; open read-only when `schemaVersion` is newer than the app knows):

```ts
type Page = {
  schemaVersion: 1;
  id: string; title: string;
  section: string;
  template?: SheetTemplate;              // only for pages in the sheet section, see Character sheet
  session?: { number: number; date: string; place: string };  // first page of each session
  createdAt: string; updatedAt: string;
  elements: Element[];                   // drawn in array order, over the template if there is one
};
```

Element changes from the Engineer's Notebook schema:

- Remove `date` from the base and from checklist items.
- `text` and `checklist` gain `font: "hand" | "print"` (default `"hand"`: the character's hand; `"print"`: Alegreya Sans, for labels).
- `image` gains `frame: "print" | "negative" | "none"`, `caption: string`, `stamp: string` (the date stamp text, default the date pasted as `'YY MM DD`), `tilt: number` (degrees) and `tapeSeed: number`.
- Colours stay hex strings; any hex is allowed, so saved mixes need no schema change.

**Saving rules:** unchanged (800 ms autosave, atomic write with one `.bak`, watch for outside changes, "Folder not found" state, file renamed when a page is renamed). Page files are numbered within their section (`0001-`, `0002-`) so reading order survives renames.

## Visual design

Match the mockups. Put every value in `src/styles/tokens.css` and use only those.

| Token | Value | Used for |
| --- | --- | --- |
| `--desk` | `#2b2019`, radial gradient to `#3b2c22` at the centre and `#1d1611` at the edges | Background behind the book |
| `--chrome` | `#1c1510` | Toolbar, status bar |
| `--panel` | `#241b15` | Flyouts, dialogs, builder panels |
| `--line` | `rgba(241,230,210,.08)` (panels `.12`) | Chrome borders |
| `--chip` | `rgba(241,230,210,.06)`, hover `.10` | Toolbar groups, ghost buttons |
| `--text` | `#f1e6d2` | Chrome text |
| `--text-soft` | `#e6d9bf` | Icons, secondary chrome text |
| `--text-muted` | `#bfae90` | Labels and hints (passes 4.5:1 on `--chrome` and `--panel`) |
| `--gilt` | `#d4a85a` | Active tool, primary buttons, selected swatch ring, switches, focus ring |
| `--ok` | `#a9cf86` | "Read" ticks, progress |
| `--cover-default` | `#46562f` | Default book cover and spine |
| `--spine-text` | `#ecd398` | Name and bands on spines |
| `--paper` | `#f3e8d0`, with a soft highlight `rgba(255,251,238,.7)` top left | Pages |
| `--paper-edge` | `#e4d5b5`, `#d6c4a0`, `#cbb892` | Stacked page edges (1 px steps) |
| `--rule` | `rgba(201,96,84,.30)`, 1 px every 32 px | Ruled lines |
| `--margin-line` | `rgba(201,74,62,.55)` 1.5 px at x 71, plus `rgba(201,74,62,.32)` 1 px at x 75 | Double margin line, on both pages |
| `--gutter-shadow` | inset 46 px shadow `rgba(110,70,25,.5)` at the spine side of each page | Fold into the spine |
| `--ink-text` | `#2b2622` | Default ink and text on paper |
| `--label` | `#a0493e` | Printed labels on sheet pages (small capitals) |
| `--muted-on-paper` | `#6f5a45` | Page meta text |

Cover colours (new character picker, plus custom): Moss `#46562f` (default), Oxblood `#6b2a26`, Navy `#26344f`, Walnut `#4a3424`, Plum `#4e2f45`, Teal `#2a4f4e`, Slate `#3d4148`, Ochre `#7a5a24`.

Section tab colours (paper tabs): Sessions `#e3d6b6`, Backstory `#d8c29a`, Likes `#d9b7a2`, Dislikes `#c9b6a8`, Wants `#c6c7a0`, Notes `#b9c3ae`, Character sheet `#e0cf9e`. The active tab is `--paper` so it joins the page, is 8 px wider, and its text is oxblood ink.

- **Type:** Alegreya 700 for page titles and panel headings; Alegreya Sans 400/500/700 for all interface text; the character's hand (base Caveat) for writing on pages; Share Tech Mono for photo date stamps only.
- **Layout (1440 × 900 window):** toolbar 64 px across the top; shelf 104 px down the left; status bar 40 px at the bottom; the book centred in the rest. The book is a 10 px cover border around two pages, with tabs sticking out of the right edge.
- **Shape:** 12 px radius toolbar groups, 18 px flyouts and panels, 20 px dialogs, 44 px minimum hit targets, visible gilt focus ring.
- **Hand-drawn boxes on sheet pages:** 2 px `#3a2e26` border with uneven radii (`255px 15px 225px 15px / 15px 225px 15px 255px` and its mirror), fill `rgba(255,250,236,.45)`. Draw these in Konva as slightly wobbly paths so they export identically.
- No emoji in the interface; stroke icons at 20 px as in the mockups.

## Spreads and pages

- **Page size:** a page is 570 × 720 in page coordinates (the size in the mockups at 100%). The header band is the top 88 px (no rules), rules start at y 95 and repeat every 32 px, and writing starts at x 92 (right of the margin line).
- **Spread view:** pages are shown in pairs, left and right, in section order. The first page of a section is always on the left (a section with an odd number of pages ends with a blank right page, which becomes real when written on).
- **View:** fit the spread to the window by default; zoom 50% to 300% (Ctrl+scroll, Ctrl+0 resets), pan with Space-drag or middle-drag. Keep the Engineer's Notebook canvas performance rules (two Konva layers, `pixelRatio` capped at 2, pan and zoom out of React state). Each page can be its own `PageScene`; drawing across the gutter is clipped to the page where the stroke started.
- **Page header:** left page shows the page title (Alegreya 30 px) and meta line; right page shows a continuation label and the page number. Both are editable in place.
- **Turning pages:** status bar buttons and PageUp/PageDown move a spread. In the Sessions section they read "Session 3" / "Session 5" and jump between sessions. A short page-turn animation (under 300 ms, none when Windows reduce motion is on).
- **Page list:** Ctrl+P or clicking "Pages 7–8 of 14" opens the list for the current section (titles, dates), with New spread, rename, duplicate and delete (delete goes to the Recycle Bin).
- **Sessions section:** "New session" starts a new spread with the title "Session N" (next number), today's date and a place field. The pill top right of the first page shows class, level and max HP from `sheet.json` when there is one.

## Characters and the shelf

- **Shelf:** each character is a book spine (60 × 224) in their cover colour, name in vertical Alegreya with two gilt bands top and bottom. The open character's spine sticks out 16 px. A dashed "New" spine at the bottom.
- **New character:** name, cover colour (the eight cover swatches plus custom), Choose folder (native dialog). Creates `notebook/` and the default sections, then offers "Import a character sheet" or "Start blank".
- **Right-click a spine:** rename, cover colour, open folder in Explorer, change folder, handwriting builder, import character sheet, archive. Drag spines to reorder.
- **Startup:** reopen the last character, section and spread. First run with no characters shows the empty shelf with a prompt to add one.

## Canvas tools

Same ten tools, keys and behaviours as the Engineer's Notebook, with these changes.

- **Text:** text and checklist render in the open character's hand by default. While editing, the DOM text editor shows the base hand (Caveat) at the same size and line height; the committed text renders in the character's hand. Text size defaults so one line fits one rule (line height 32).
- **Lock to lines** (toolbar toggle, G key, on by default and remembered): text baselines snap to the rule lines; positions, shape corners and line ends snap to the 32 px rows vertically and 16 px horizontally. Freehand strokes never snap point by point. Alt ignores it while held.
- **Nibs:** three widths, fine 2, medium 4, broad 8, as before.
- **Ink palette:** the toolbar shows six favourite inks and a palette button. The palette flyout (mockup 03) has:
  - 20 inks: Iron gall `#2b2622`, Walnut `#4a3424`, Sepia `#6b4a2e`, Oxblood `#8e2a2a`, Vermilion `#c4452c`, Rust `#a85a2a`, Amber `#d07a2e`, Ochre `#b8902c`, Olive `#6e7a2e`, Moss `#4f6b32`, Forest `#2f5d46`, Teal `#2d7a7a`, Prussian blue `#2a4e7f`, Ultramarine `#3b5bb5`, Indigo `#3e3a86`, Violet `#6d4a8a`, Plum `#7b3b5e`, Rose `#b85a7a`, Slate `#5a6470`, Gilt `#c9a54a`.
  - 6 highlighters for the paint brush, drawn see-through and under text: Sunlight `rgba(240,200,60,.55)`, Sage `rgba(150,195,110,.5)`, Sky `rgba(120,170,220,.45)`, Blush `rgba(230,130,150,.45)`, Lilac `rgba(170,140,210,.45)`, Ember `rgba(240,160,90,.5)`. Picking one switches to the brush.
  - Your mixes: up to 12 saved colours, added with "Mix a colour" (a colour picker with a live sample on paper). Right-click a mix to remove it.
  - Right-click any ink to pin it to, or unpin it from, the six toolbar favourites. Default favourites: Iron gall, Oxblood, Prussian blue, Moss, Sepia, Violet.
  - Picking an ink also restyles the current selection, as before.
- **Print theme:** printer-friendly export uses white paper, rules and margin lines at half strength, and the inks unchanged (they are already dark on light).

## Photos

Every pasted, dropped or inserted image is placed as a framed photo, like a print from an old film camera, held down with tape on all four corners (mockups 01 and 02).

- **Frames** (per image, default set in Settings, changed from the image's right-click menu or a small flyout when selected):
  - **Print:** off-white border `#f8f4ea`, 10 px sides and top, 30 px bottom with a caption in the character's hand; drop shadow `0 12px 20px rgba(50,30,10,.28)`.
  - **Negative:** near-black film `#17120f` with a row of sprocket holes along the top and bottom (holes are paper coloured), and edge print in orange mono (`▸ 14A  400`).
  - **None:** the image with tape only.
- **Film look:** a warm tint, a soft vignette and light grain over the picture. Applied at render time only; the asset file is never changed. A "Film look" switch per image (on by default).
- **Date stamp:** orange seven-segment-style digits in the bottom right of the picture (Share Tech Mono, `#ff9b4d` with an orange glow), default the date pasted as `'26 11 05`. Editable; can be hidden.
- **Tape:** four strips about 80 × 26, translucent cream `rgba(238,226,192,.72)` with torn ends, one across each corner at roughly 40°, overlapping the page. Angles and lengths vary a little per image from `tapeSeed` so photos don't look identical. Tape is part of the photo element (it moves, scales and rotates with it).
- **Tilt:** each new photo gets a random tilt between −4° and 4°; the rotate handle still works.
- Images are still saved to `assets/` as PNG, de-duplicated by hash, and placed at most 260 px wide by default (resizable).

## Handwriting builder

Each character can have their own hand. Open it from the toolbar button, the spine's right-click menu, or the status bar ("Writing in Cosworth's hand"). Layout as mockup 07.

- **Glyph set (70):** A–Z, a–z, 0–9 and `. , ! ? ' " - &`. The grid shows drawn glyphs on paper squares and missing ones dashed. A progress bar and "41 of 70 drawn".
- **Drawing pad:** a paper card with five guide lines: ascender, capital (dotted), x-height (dashed), baseline (solid red), descender. Draw with the pen (pressure from a pen or tablet when available). Undo stroke, Clear letter, previous and next letter (also arrow keys), and a faint ghost of the previous variant.
- **Variants:** up to three versions of each glyph. When rendering, pick a variant per letter from a hash of the element id and the letter's position, so text is stable between renders but repeated letters differ.
- **Preview:** two lines of sample text on ruled paper, with letters not yet drawn underlined with a red squiggle. Sliders: Size (70–140%), Slant (−15° to 15°), Spacing (−20 to 40), Wobble (0–100%, small random offsets and rotation per glyph). Slider values save to `character.json`.
- **Use this hand** closes the builder; all of that character's text re-renders.
- **Storage** (`hand/hand.json`):

```ts
type Hand = {
  schemaVersion: 1;
  metrics: { ascender: number; capHeight: number; xHeight: number; descender: number }; // in em units, baseline 0
  glyphs: Record<string, { variants: { strokes: number[][]; advance: number }[] }>; // strokes are flat [x, y, pressure, ...] in em units
};
```

- **Rendering:** a `HandText` Konva shape lays out text with glyph advances, wraps to the element width, and draws each glyph's strokes with `perfect-freehand` in the element's colour. Missing glyphs are drawn from the base hand (Caveat) scaled so its x-height and baseline match the hand's metrics. Cache each rendered text element as a bitmap and redraw only when its text, size, colour or the hand changes, to keep pages with lots of writing fast.
- A character with no glyphs drawn simply writes in Caveat.

## Character sheet

The Character sheet section holds generated pages drawn from `sheet.json` and `trackers.json`, with the usual canvas layer on top so you can write, draw and paste over them (mockups 04 and 05).

**Templates** (fixed layouts drawn by code, one per page):

| Template | Page | Contents |
| --- | --- | --- |
| `core-left` | 1 | Name (in the hand, 48 px), class, species, background, player; six ability boxes (modifier large, score in an oval); saves line with proficiency dots; AC shield, initiative, speed, proficiency; HP (max, current, temp); hit dice; death saves; trained in (armour, weapons, tools, languages). |
| `core-right` | 2 | Skills in two columns with proficiency dots, value and ability; passive perception, insight, investigation; attacks and cantrips (name, hit, damage); Wild Shape or other limited-use class feature bubbles. |
| `features` | 3 | Features and traits grouped by source (class, species, feats), one line each with a short summary; uses as bubbles. |
| `spells-kit` | 4 | Spellcasting ability, save DC, spell attack; slots as bubbles by level; cantrips; always-prepared spells; coins; pack items with weights; weight carried. |
| `spell-list` | 5+ | The full spell list in a ruled table: prepared bubble, name, level, casting time, range, components, duration, concentration mark. As many pages as needed, grouped by level. Not mocked: follow the style of mockup 05. |

- **Values are handwritten** in the character's hand; labels are printed small capitals in `--label`. Boxes are hand-drawn (Visual design).
- **Editing:** double-click a value to type a new one. A typed value is saved to `sheet.json` and marked as an override (shown with a tiny pencil dot) so a re-import can list it.
- **Trackers:** bubbles for spell slots, feature uses, death saves and hit dice toggle on click; current and temp HP are typed. These live in `trackers.json`. A "Long rest" button in the sheet page header resets slots, uses and hit dice per their rules; "Short rest" resets short-rest uses. Both can be undone.
- **No sheet yet:** the Character sheet tab shows a blank template with an "Import a character sheet" button and lets you type values in.
- **Synced pill:** "Synced from D&D Beyond PDF · 6 Nov" in the header when imported.

**sheet.json** (fields marked `?` may be missing; every field can be `null` when it couldn't be read):

```ts
type Sheet = {
  schemaVersion: 1;
  source?: { kind: "ddb-pdf"; file: string; sha256: string; importedAt: string };
  overrides: string[];                       // JSON paths of values typed by hand
  identity: { name: string; player: string; classLevel: string; species: string; background: string; xp: string;
    alignment: string; gender: string; age: string; size: string; height: string; weight: string;
    faith: string; skin: string; eyes: string; hair: string };
  abilities: Record<"str" | "dex" | "con" | "int" | "wis" | "cha",
    { score: number; mod: number; save: number; saveProficient: boolean }>;
  combat: { ac: number; initiative: number; speed: string; proficiency: number; maxHp: number; hitDice: string;
    heroicInspiration: boolean };
  skills: { name: string; ability: string; mod: number; proficient: boolean; expertise: boolean }[];
  passives: { perception: number; insight: number; investigation: number };
  attacks: { name: string; hit: string; damage: string; notes: string }[];
  proficiencies: { armour: string[]; weapons: string[]; tools: string[]; languages: string[] };
  actions: { group: string; text: string }[];          // the actions block on page 1
  features: { group: string; name: string; source: string; text: string; uses?: { max: number; per: "long" | "short" } }[];
  spellcasting?: { class: string; ability: string; saveDc: number; attack: number;
    slots: Record<string, number>;                     // "1": 4, "2": 2
    spells: { level: number; name: string; source: string; saveAtk: string; time: string; range: string;
      components: string; duration: string; ref: string; notes: string;
      prepared: "always" | "yes" | "no"; ritual: boolean; concentration: boolean }[] };
  equipment: { coins: { cp: number; sp: number; ep: number; gp: number; pp: number };
    items: { name: string; qty: number; weight: string }[]; attuned: { name: string; qty: number; weight: string }[];
    carried: string; encumbered: string; pushDragLift: string };
  details: { appearance: string; backstory: string; allies: string; additionalNotes: string;
    personality: string; ideals: string; bonds: string; flaws: string };
};
```

## Importing a D&D Beyond sheet

Import from the toolbar, the spine menu, the empty sheet tab, or by dropping a PDF on the book. Layout as mockup 06.

**Reading the PDF**

- Use `pdfjs-dist` to get each page's text items with positions. The fixture PDF has no form fields (it is a flattened PDFsharp export), so values must be found by position relative to their printed labels.
- Identify pages by their footer or section labels, not by page number: `SKILLS` / `SAVING THROWS` (core), `FEATURES & TRAITS`, `EQUIPMENT`, `CHARACTER BACKSTORY` / `ALLIES & ORGANIZATIONS` (details), `SPELLS` / `SPELLCASTING CLASS` (one or more spell pages).
- For labelled fields (`CLASS & LEVEL`, `PLAYER NAME`, `SPECIES`, `BACKGROUND`, `ARMOR`, `INITIATIVE`, `Max HP`, `SPEED`, and so on), take the nearest text above the label within its column.
- Ability blocks: label (`STRENGTH`) then score then modifier, stacked. Saving throws and skills are rows of `modifier name [ABILITY]`, with a `P` (proficient) or `E` (expertise) mark in a column to their left.
- Feature, action and proficiency blocks use `=== HEADING ===` lines and `* Name • Source page` entries; keep their text.
- Spell rows: a leading `O` (not prepared) or `P` (always prepared), then the columns in the header row. Slot counts come from lines like `=== 1st LEVEL === 4 Slots OOOO`.
- Keep the parser in `src/import/ddb/` as pure functions over the extracted text items, so it can be unit tested without a PDF library.
- Anything not found is `null` and shown in the dialog as "Couldn't read" with a field to type it in. Never guess a number.

**Where things go** (each row in the dialog can be unticked):

| From the sheet | Goes to |
| --- | --- |
| Abilities, saves, skills, HP, AC, attacks, actions, proficiencies | Sheet pages 1–2 |
| Features, traits, feats, spellcasting, slots, coins, equipment | Sheet pages 3–4 |
| Spell list | Sheet pages 5+ |
| Character backstory and appearance (gender, age, size, height, weight, alignment, faith, skin, eyes, hair) | Backstory: the backstory text as handwritten text, then an "At a glance" block (mockup 02) |
| Backstory or personality lines starting "loves", "likes", "enjoys" | Likes, one line each with a ♡ |
| Lines starting "hates", "dislikes", "can't stand" | Dislikes, one line each |
| Lines starting "wants", "goal", "dreams of", and Ideals and Bonds | Wants |
| Allies and organisations, and lines starting "friend:", "foe:", "rival:", "ally:" | Notes, under "People" |
| Flaws, additional notes | Notes |

Line matching is case-insensitive; a line that matches goes only to its first destination in this table. Show quoted examples under each row as in the mockup.

**Options**

- "Write it in Cosworth's hand" (on): imported text uses the character's hand; off uses print.
- Re-import behaviour: **Update numbers, keep my marks** (default) or **Replace pages**. "Update" replaces `sheet.json` (listing any overrides that will be replaced, with a tick box to keep each one), regenerates template pages, keeps every element drawn on them, never touches `trackers.json`, and only adds to Backstory, Likes, Dislikes, Wants and Notes text that isn't already there. "Replace" asks before doing anything.
- The footer states exactly what will happen ("Adds 6 sheet pages and fills 4 tabs. Nothing you've written is touched.").
- On import, copy the PDF to `notebook/imports/` with the date prefix.

**Fixture expectations** (from `reference/cosworth-ddb-sheet.pdf`, used in tests): name Cosworth; player MolotovMully; Druid 3; species Konomin (Bokkurin); background Farmer; XP "(Milestone)"; STR 9/−1, DEX 18/+4, CON 18/+4, INT 12/+1, WIS 20/+5, CHA 15/+2; saves INT +3 and WIS +7 proficient; AC 17; initiative +4; speed "30 ft. (Walking)"; proficiency +2; max HP 40; hit dice 3d8; proficient skills Animal Handling +7, Arcana +3, Medicine +7, Nature +3, Survival +7; passives 15/15/11; attacks Staff +1 "1d6-1 Bludgeoning", Shillelagh +7 "1d8+5 Bludgeoning", Shocking Grasp +7 "1d8 Lightning", Unarmed Strike +1 "0 Bludgeoning"; spellcasting WIS, DC 15, +7, slots 1st 4 and 2nd 2; SP 68 and other coins 0; 13 equipment rows starting with Shield (1, 6 lb.); alignment Chaotic Good; age 10; height "3ft 2"; ally text containing "Ash-seven"; backstory containing "loves nature, family and adventure with friends" (to Likes) and "hates people nosing on his heartseed" (to Dislikes).

## Settings panel

Same panel as before (Ctrl+,), with these sections:

- **Characters and folders:** a list of characters with cover colour, name, folder path, Open folder, Change folder (move notes or point at the new folder, as before), Archive, and drag to reorder. Add character opens the new character flow.
- **Paper and ink:** default photo frame (Print, Negative, None), film look on by default, date stamp on by default; ink favourites and mixes (same as the flyout); lock to lines on by default; default nib.
- **Export:** as before (format, destination, include images, printer friendly).
- **General:** start with Windows (off), check for updates on launch (on), date format (UK `ddd d MMM yyyy`), backup (open app data folder, export config as JSON).
- **AI:** only if M8 is built; same provider, key and model settings as before.

## Export

Same Rust export commands and output rules as before (fresh `notebook-export-<date>` folder, never overwrite).

- **Scope:** all characters, this character, this section, this spread.
- **Layout:** `<destination>/notebook-export-2026-11-06/Cosworth/<section>/0001-<slug>.md` and `.pdf`, plus `Cosworth.pdf` combining every section with a contents page.
- **PDF:** one spread per landscape A4 page, rendered from `PageScene` at 2x: paper, rules, writing and photos with their frames and tape, without the desk, cover or tabs. Printer friendly: white paper, lighter rules.
- **Markdown:** front matter (character, section, page, created, updated), a spread snapshot image, then text in reading order. Handwritten text exports as its plain text. Sheet pages export as Markdown tables built from `sheet.json` and `trackers.json`.
- PDF header text still uses Helvetica, so keep `safeText` for characters outside Windows-1252.

## Build, install and releases

Same pipeline as the Engineer's Notebook, on the new repo:

1. `.github/workflows/ci.yml` (lint, typecheck, Vitest, `cargo test`) on pushes and pull requests.
2. `.github/workflows/release.yml` with `tauri-apps/tauri-action` on `windows-latest`, triggered by `v*` tags, NSIS installer, draft release with `latest.json`.
3. A **new** updater signing key on the new repo's secrets (never the Engineer's Notebook key, never committed).
4. Installing must not affect an installed Engineer's Notebook: different identifier, app data folder, keyring service, Start menu entry and updater feed.

## Milestones and acceptance criteria

Build in these milestones, each ending with a working app and a commit; do not start the next until the criteria pass. M8 is optional and only built if Jake confirms.

### M0: New folder, fork and rename

- [ ] `C:\Users\jakem\Documents\Github\dnd-notebook` exists with this pack in place and the copied source, without the old `.git`, build output or scratch data.
- [ ] Every identifier in the rename table is changed; a search for `engineer` finds nothing outside `docs/`.
- [ ] Reminders, dates and Meetings are removed with their tests; the app builds, tests pass and it runs as "DnD Notebook".
- [ ] New GitHub repo `jakemulholland-code/dnd-notebook` exists, `main` is pushed, CI is green.
- [ ] `git status` in the Engineer's Notebook folder shows no changes made by this work.

### M1: Notebook shell

- [ ] Desk, toolbar, shelf, book with two pages, section tabs and status bar match mockup 01 at 1440 × 900, using only `tokens.css` values.
- [ ] New character flow creates `notebook/`, `character.json` and the seven default sections; characters show as spines and switch on click.
- [ ] Sections can be added, renamed, recoloured, reordered and removed; pages save into `pages/<sectionId>/` and reload.
- [ ] Spread navigation, page list, New session and zoom and pan work; startup reopens the last spread.
- [ ] Unit tests cover the character and page schemas, section ordering and odd page counts.

### M2: Tools, inks and lock to lines

- [ ] All ten tools work on both pages of a spread, with selection, resize, rotate, undo and redo.
- [ ] Lock to lines snaps text baselines and shapes as specified; Alt overrides.
- [ ] Ink flyout matches mockup 03: 20 inks, 6 highlighters (brush, under text), up to 12 mixes, pin and unpin favourites; choices persist.
- [ ] Pan and zoom stay smooth on a spread with 500 strokes.

### M3: Photos

- [ ] Pasting, dropping and inserting an image places a Print-framed photo with four tape strips, film look, date stamp and a random tilt, as in mockups 01 and 02.
- [ ] Frame, film look, stamp and caption can be changed per photo; the default frame comes from Settings.
- [ ] The asset file on disk is the original image (film look is render only).

### M4: Handwriting

- [ ] Builder matches mockup 07: glyph grid, pad with guide lines, three variants, undo, clear, next and previous, preview with four sliders.
- [ ] Text on the character's pages renders in their hand, with missing glyphs falling back to Caveat aligned to the same baseline and x-height.
- [ ] Variants are stable across reloads and repeated letters differ; slider changes re-render all of the character's text.
- [ ] A spread with 40 lines of handwritten text pans and zooms as smoothly as one without.

### M5: Character sheet pages

- [ ] The sheet section renders `core-left`, `core-right`, `features`, `spells-kit` and `spell-list` from a fixture `sheet.json`, matching mockups 04 and 05.
- [ ] Values can be typed in and are marked as overrides; bubbles and HP update `trackers.json`; Long rest and Short rest reset the right trackers and can be undone.
- [ ] Pen marks and photos placed on sheet pages save and stay in place when the template re-renders.

### M6: Import

- [ ] Importing `docs/reference/cosworth-ddb-sheet.pdf` produces a `sheet.json` matching every fixture expectation (unit tested on the parser).
- [ ] The dialog matches mockup 06, lists each destination with quotes, and fills Backstory, Likes, Dislikes and Notes as specified.
- [ ] Re-importing with "Update numbers, keep my marks" keeps all drawn elements and trackers, lists overrides, and doesn't duplicate text.
- [ ] Fields that can't be read show "Couldn't read" and never contain a guessed value (tested with a PDF that has a page removed).

### M7: Export and release

- [ ] Markdown and PDF export for spread, section, character and all scopes, matching the layout; printer friendly works.
- [ ] Tagging `v0.1.0` on the new repo produces an installer; it installs alongside the Engineer's Notebook without affecting it, pins to the taskbar, runs as a single instance and updates from a newer tag.

### M8 (optional): Previously on...

- [ ] A "Previously on..." button on a Sessions spread sends the last three sessions' text (and, if the model accepts images and the setting is on, snapshots of those spreads) to the chosen AI provider and writes a short recap on a sticky note on the new session's first page.
- [ ] Uses the kept provider plumbing; keys stay in Credential Manager; nothing is sent unless the button is pressed.

## Notes for Claude Code

Copy this section into `CLAUDE.md` at the repo root (this pack already includes it).

- Build in `C:\Users\jakem\Documents\Github\dnd-notebook` and push to the new repo `jakemulholland-code/dnd-notebook`. Never edit, commit to or push from the Engineer's Notebook folder or repo; only copy from it.
- Work milestone by milestone. At the end of each, run the tests and the app, list what passed against the acceptance criteria, and commit with a clear message.
- Treat the user's character folders as precious: never delete, overwrite or move user files except through the explicit flows in this spec. Use fixture folders under `test-fixtures/` for development and tests, never real character folders.
- Never log, print or commit API keys or the updater signing key. Keep `.env*` and local config in `.gitignore`.
- Match the mockups in `docs/mockups/` (open the HTML files for exact CSS values). Keep every visual token in `src/styles/tokens.css`.
- Use UK English in all interface text (colour, armour, organise) and sentence case for buttons and labels.
- Carry over the working notes from the Engineer's Notebook `CLAUDE.md` that still apply (canvas performance rules, `savePage` and `knownDiskText`, the `scrollIntoView` gotcha, dev runs with `DND_NOTEBOOK_APP_DIR` under `test-fixtures/_scratch`, close the installed app before `npm run tauri dev`), updating names as you go.
- Check the current docs for Tauri 2 plugins and `pdfjs-dist` before writing code that depends on them.
- When something in this spec is unclear or turns out to be impractical, stop and ask rather than guessing, and suggest the simplest option.

**Open questions to confirm before M1**

- App name: "DnD Notebook" is a placeholder. Keep it, or choose another (for example "Adventurer's Notebook")?
- Should M8 ("Previously on..." recap with AI) be built, or should the AI code be removed entirely?
- Long rest and Short rest buttons on the sheet: wanted, or keep trackers manual only?
- Are there other D&D Beyond exports (2014 sheet layout, multiclass, a spell-heavy character) to add as import fixtures?
