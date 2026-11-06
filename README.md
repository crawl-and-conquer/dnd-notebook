# DnD Notebook

A desktop D&D character notebook. It looks like a paper notebook (parchment pages, ink-on-paper grid), keeps each character's pages as JSON files in that character's own folder, and provides a canvas for freehand notes, sketches and character sheets.

Built with Tauri 2, React 18, TypeScript and Konva. See [SPEC.md](SPEC.md) for the full spec and [CLAUDE.md](CLAUDE.md) for working rules.

## Status

| Milestone | State |
| --- | --- |
| M0 Fork and rename | Done |
| M1 Notebook shell | Pending |
| M2 Tools and inks | Pending |
| M3 Photos | Pending |
| M4 Handwriting builder | Pending |
| M5 Character sheet | Pending |
| M6 Import | Pending |
| M7 Export and release | Pending |
| M8 AI recap | Pending |

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

### End-to-end checks

They run against the real app using scratch folders under `test-fixtures/_scratch` (git-ignored). Start the app as above, then in a second terminal:

```bash
npm run e2e:m1
```

`e2e:pages` covers the page list: open, rename, duplicate and delete. Start the app with `DND_NOTEBOOK_APP_DIR` set to `test-fixtures\_scratch\appdata-pages`, then:

```bash
npm run e2e:pages
```

`e2e:watch` edits, adds and removes page files on disk while the app is open and checks the app follows along. Start the app with `DND_NOTEBOOK_APP_DIR` set to `test-fixtures\_scratch\appdata-watch`, then:

```bash
npm run e2e:watch
```

`e2e:tabs` covers the tab right-click menu, dragging and Alt+arrow keys to reorder tabs, reordering in Settings, and restoring archived tabs. Start the app with `DND_NOTEBOOK_APP_DIR` set to `test-fixtures\_scratch\appdata-tabs`, then:

```bash
npm run e2e:tabs
```

`e2e:move` covers Change folder: moving existing notes and pointing at a new folder. Start the app with `DND_NOTEBOOK_APP_DIR` set to `test-fixtures\_scratch\appdata-move`, then:

```bash
npm run e2e:move
```

## Files on disk

Each character folder gets a `notes` folder:

```
<character folder>/notes/
  notebook.json
  pages/2026-11-06-session-notes.page.json
  assets/<sha256>.png
```

Pages save 800 ms after the last change, as an atomic write (temp file, then rename), keeping one `.bak` of the previous version. App settings live in `%APPDATA%\dnd-notebook\config.json`. API keys live in Windows Credential Manager (entry `dnd-notebook`), never in a file.

## Install

Download `DnD.Notebook_<version>_x64-setup.exe` from the [latest release](https://github.com/jakemulholland-code/dnd-notebook/releases/latest) and run it. Windows SmartScreen warns because the installer is not code-signed: choose **More info**, then **Run anyway**. Then open the app from the Start menu.

The app checks for new versions when it opens (Settings › General › Check for updates on launch) and offers **Install and restart**.

## Releasing a new version

1. Bump `version` in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`.
2. Commit, then tag and push:

```bash
git tag v0.1.0
```

```bash
git push origin main --tags
```

3. The `release` workflow builds the installer on `windows-latest`, signs the updater files and attaches everything, including `latest.json`, to a **draft** release.
4. Check the draft, then publish it. Installed apps only see published releases.
5. Optional: with an older version installed, `npm run e2e:update` opens it, accepts the update prompt and checks it restarts on the new version.

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
