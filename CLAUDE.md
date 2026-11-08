# Notes for Claude Code

Copied from the last section of [SPEC.md](SPEC.md).

- Build in `C:\Users\jakem\Documents\Github\dnd-notebook` and push to the new repo `jakemulholland-code/dnd-notebook`. Never edit, commit to or push from the Engineer's Notebook folder or repo; only copy from it.
- Work milestone by milestone. At the end of each, run the tests and the app, list what passed against the acceptance criteria, and commit with a clear message.
- Treat the user's character folders as precious: never delete, overwrite or move user files except through the explicit flows in this spec. Use fixture folders under `test-fixtures/` for development and tests, never real character folders.
- Never log, print or commit API keys or the updater signing key. Keep `.env*` and local config in `.gitignore`.
- Match the mockups in `docs/mockups/` (open the HTML files for exact CSS values). Keep every visual token in `src/styles/tokens.css`.
- Use UK English in all interface text (colour, armour, organise) and sentence case for buttons and labels.
- Carry over the working notes from the Engineer's Notebook `CLAUDE.md` that still apply (canvas performance rules, `savePage` and `knownDiskText`, the `scrollIntoView` gotcha, dev runs with `DND_NOTEBOOK_APP_DIR` under `test-fixtures/_scratch`, close the installed app before `npm run tauri dev`), updating names as you go.
- Check the current docs for Tauri 2 plugins and `pdfjs-dist` before writing code that depends on them.
- When something in this spec is unclear or turns out to be impractical, stop and ask rather than guessing, and suggest the simplest option.

## Working notes

- Dev runs: set `DND_NOTEBOOK_APP_DIR` to a folder under `test-fixtures/_scratch` so the real `%APPDATA%\dnd-notebook` config is untouched. Close the installed app before `npm run tauri dev` or `npm run e2e`: single instance hands over to it and WebView2 will not share its data folder.
- `npm run dev` (browser only) uses the in-memory backend in `src/storage/backend.ts`; the real app goes through the Rust commands in `src-tauri/src/commands/`. Dev builds expose `window.__dnd = { useNotebook, useTools, backend, useImportDialog }` for scripted checks; never import store modules dynamically from a script (you get a second store).
- `npm run e2e` drives a built exe (`npx tauri build --no-bundle`) over the WebView2 debugging port. Tauri now locks `__TAURI_INTERNALS__.invoke`, so the script answers the native folder picker by intercepting `fetch` to `ipc.localhost/plugin%3Adialog%7Copen`.
- Files: `<folder>/notebook/` holds `character.json` (with an `"app":"dnd-notebook"` marker), `sheet.json`, `trackers.json`, `hand/hand.json`, `pages/<sectionId>/NNNN-slug.page.json`, `assets/`, `imports/`. Blank pages are virtual until written on (`materialise`, `ensurePage`). Always save pages through `savePage` so `knownDiskText` can tell our writes from outside changes; the watcher emits `section/file` names.
- Page geometry: 570 × 720, header 88 px, rules every 32 px from y = 95, margin lines at x 71 and 75, writing from x 92 to 534 (`WRITING_RIGHT`). New text boxes are clamped to that right edge (`fitWidth`). Text tops sit on 32n + 4 (baseline 25 px into the line).
- Canvas performance rules from the Engineer's Notebook still apply: two Konva layers, `pixelRatio` capped at 2, pan and zoom out of React state (BookView transforms `.book`), memoised element nodes. Each text element is one cached Konva Shape laid out by `src/handwriting/handLayout.ts` (the only layout engine).
- `currentSpreadPages` must return cached objects (WeakMaps); building new ones each call caused "Maximum update depth exceeded". Menus and popovers inside the transformed book render through portals.
- Character sheet: `sheet.json` values are nullable with an overrides list; trackers live in `trackers.json` and are never touched by re-import. Templates are item layouts in `src/sheet/layout.ts`; the spell list runs 18 rows a page.
- Import reads the PDF's AcroForm fields with pdfjs `getAnnotations` (no OCR). Field parsing is in `src/import/ddb/fields.ts`, tested against `test-fixtures/cosworth-fields.json`; placement measures with `layoutText` and keeps headings with the next block.
- Export: `src/export/runExport.ts` covers all, character, section or spread. Markdown per page with a spread snapshot, a landscape A4 PDF per spread, and `<Character>.pdf` with contents. A section ending on a left page gets a blank ruled facing page. Writes only through the Rust `export_*` commands into a fresh `notebook-export-<date>` folder. Colours go through `ThemeContext`; the print theme reads `--print-*` tokens.
- Previously on... (M8): `src/ai/previouslyOn.ts` sends the three sessions before the current session page (`src/ai/recap.ts`), plus up to five spread snapshots when the model accepts images and the setting is on, and adds a `sticky: true` text element. "Exclude from AI" blocks it. Nothing is sent unless the button is pressed.
- Gotcha: Chromium's `scrollIntoView` returns a Promise, so never write `useEffect(() => el.scrollIntoView())` as a one-liner.
- Releases: the repo is `crawl-and-conquer/dnd-notebook`; tags `v*` run `.github/workflows/release.yml` and make a draft release with `latest.json`. The productName has no apostrophe ("Adventurers Notebook") because NSIS breaks on it. The signing key lives only in repo secrets.
- Line endings are mixed CRLF and LF; scripted edits should normalise them.
