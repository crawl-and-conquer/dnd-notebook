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

Add notes here as the build goes, as in the Engineer's Notebook `CLAUDE.md`.
