# Adventurer's Notebook

A desktop notebook for D&D characters that looks like a paper notebook: a two-page spread on a wooden desk, ruled beige paper, and divider tabs for Sessions, Backstory, Likes, Dislikes, Wants, Notes and Character sheet. Each character has their own book, their own handwriting (drawn letter by letter in a builder), and their pages are JSON files in a folder you choose. A D&D Beyond character sheet PDF can be imported to draw the sheet as notebook pages and fill the other tabs.

Built with Tauri 2, React 18, TypeScript and Konva. See [SPEC.md](SPEC.md) for the full spec and [CLAUDE.md](CLAUDE.md) for working rules.

## Status

Rebuilt against [SPEC.md](SPEC.md) in November 2026. "Checked" means unit tests plus the end-to-end run or screenshots against the mockups.

| Milestone | State | Not yet checked |
| --- | --- | --- |
| M0 Fork and rename | Done | |
| M1 Notebook shell | Checked | |
| M2 Tools, inks and lock to lines | Checked | Smoothness on your own screen (headless Edge at 2x: 500 strokes plus 40 lines of handwriting on a spread zoom and pan at a 6 ms median frame) |
| M3 Photos | Checked | |
| M4 Handwriting | Checked | |
| M5 Character sheet | Checked | |
| M6 Import | Checked | Only one D&D Beyond export (Cosworth) as a fixture |
| M7 Export and release | Export checked | Installing and updating the next release |
| M8 Previously on... | Built | A run against a real AI provider |

## Prerequisites

- Node 20 LTS or newer
- Rust stable
- Windows: WebView2 (built into Windows 10 and 11) and the MSVC build tools ([Tauri prerequisites](https://v2.tauri.app/start/prerequisites/))

## Development

```bash
npm install
```

```bash
npm run tauri dev
```

`npm run dev` runs the front end alone in a browser with an in-memory stand-in for the file system. It is useful for styling work and never touches disk.

Set `DND_NOTEBOOK_APP_DIR` to a folder under `test-fixtures/_scratch` for all dev runs so your real `%APPDATA%\dnd-notebook` config is not touched:

```powershell
$env:DND_NOTEBOOK_APP_DIR = "$PWD\test-fixtures\_scratch\appdata"
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9333"
npm run tauri dev
```

### Tests

```bash
npm test
```

```bash
npm run test:rust
```

### End-to-end check

`npm run e2e` builds nothing; it launches an already built app (`src-tauri/target/release/dnd-notebook.exe` by default, or the path in `DND_NOTEBOOK_EXE`) with its own app data folder and a character folder under `test-fixtures/_scratch/e2e`, then drives it over WebView2's debugging port: new character, import of the reference PDF, writing, an outside change to a page file, Previously on... without AI set up, export, change folder and the handwriting builder. Close the installed app first.

```bash
npx tauri build --no-bundle
```

```bash
npm run e2e
```

## Files on disk

Each character folder gets a `notebook` folder:

```
<character folder>/notebook/
  character.json          name, cover colour, sections, hand settings
  sheet.json              character sheet data (imported or typed in)
  trackers.json           HP, spent slots, feature uses, hit dice, death saves
  hand/hand.json          the character's drawn letters
  pages/<section>/0001-session-1.page.json
  assets/<sha256>.png     photos, de-duplicated by hash
  imports/<date>-<name>.pdf   a copy of each imported sheet
```

Pages save 800 ms after the last change, as an atomic write (temp file, then rename), keeping one `.bak` of the previous version. App settings live in `%APPDATA%\dnd-notebook\config.json`. API keys live in Windows Credential Manager (entry `dnd-notebook`), never in a file.

## Install

Download `Adventurers.Notebook_<version>_x64-setup.exe` from the [latest release](https://github.com/crawl-and-conquer/dnd-notebook/releases/latest) and run it. Windows SmartScreen warns because the installer is not code-signed: choose **More info**, then **Run anyway**. Then open the app from the Start menu.

The app checks for new versions when it opens (Settings › General › Check for updates on launch) and offers **Install and restart**.

## Releasing a new version

1. Bump `version` in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`.
2. Commit, then tag and push:

```bash
git tag v0.2.0
```

```bash
git push origin main --tags
```

3. The `release` workflow builds the installer on `windows-latest`, signs the updater files and attaches everything, including `latest.json`, to a **draft** release.
4. Check the draft, then publish it. Installed apps only see published releases.

### Updater signing key

Updates are signed. Generate a new key pair with:

```bash
npm run tauri signer generate
```

Store the private key and password outside the repo and as the repo secrets `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Paste the public key into `src-tauri/tauri.conf.json` under `plugins.updater.pubkey`. Never commit the private key.

To build an installer locally without releasing:

```bash
npm run tauri build
```

The installer lands in `src-tauri/target/release/bundle/nsis/`.
