//! File-system helpers for client notes folders and the app config.
//!
//! Rules (see SPEC.md "Saving rules"):
//! - Writes are atomic: write a temp file, then rename over the target.
//! - The previous version of a file is kept as `<name>.bak`.
//! - A missing client folder is reported, never silently recreated.

use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

const APP_MARKER: &str = "dnd-notebook";

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

/// `%APPDATA%/dnd-notebook` on Windows, the platform config dir elsewhere.
/// `DND_NOTEBOOK_APP_DIR` overrides it (dev runs and end-to-end tests use
/// a folder under `test-fixtures/`).
fn app_dir() -> Result<PathBuf, String> {
    if let Ok(dir) = std::env::var("DND_NOTEBOOK_APP_DIR") {
        if !dir.is_empty() {
            return Ok(PathBuf::from(dir));
        }
    }
    let base = dirs::config_dir().ok_or("Could not find the app data folder")?;
    Ok(base.join(APP_MARKER))
}

/// Atomic write with one `.bak` of the previous version.
pub fn atomic_write(path: &Path, contents: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or("Path has no parent folder")?;
    if !parent.exists() {
        return Err(format!("Folder not found: {}", parent.display()));
    }
    let file_name = path
        .file_name()
        .ok_or("Path has no file name")?
        .to_string_lossy()
        .to_string();
    let tmp = parent.join(format!(".{file_name}.tmp"));
    {
        let mut f = fs::File::create(&tmp).map_err(err)?;
        f.write_all(contents).map_err(err)?;
        f.sync_all().map_err(err)?;
    }
    if path.exists() {
        let bak = parent.join(format!("{file_name}.bak"));
        fs::copy(path, &bak).map_err(err)?;
    }
    // On Windows std::fs::rename replaces an existing target (MOVEFILE_REPLACE_EXISTING).
    fs::rename(&tmp, path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        err(e)
    })
}

#[tauri::command]
pub fn app_config_path() -> Result<String, String> {
    Ok(app_dir()?.join("config.json").to_string_lossy().to_string())
}

#[tauri::command]
pub fn read_app_config() -> Result<Option<String>, String> {
    let path = app_dir()?.join("config.json");
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(path).map(Some).map_err(err)
}

#[tauri::command]
pub fn write_app_config(contents: String) -> Result<(), String> {
    let dir = app_dir()?;
    fs::create_dir_all(&dir).map_err(err)?;
    atomic_write(&dir.join("config.json"), contents.as_bytes())
}

/// Only plain names like `reminders-cache.json` are allowed in the app data folder.
fn app_file(name: &str) -> Result<PathBuf, String> {
    let ok = !name.is_empty()
        && !name.starts_with('.')
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.');
    if !ok || name == "config.json" {
        return Err(format!("Invalid app file name: {name}"));
    }
    Ok(app_dir()?.join(name))
}

#[tauri::command]
pub fn read_app_file(name: String) -> Result<Option<String>, String> {
    let path = app_file(&name)?;
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(path).map(Some).map_err(err)
}

#[tauri::command]
pub fn write_app_file(name: String, contents: String) -> Result<(), String> {
    let path = app_file(&name)?;
    fs::create_dir_all(app_dir()?).map_err(err)?;
    atomic_write(&path, contents.as_bytes())
}

/// Opens the app data folder (config, caches) in Explorer.
#[tauri::command]
pub fn open_app_dir(app: tauri::AppHandle) -> Result<String, String> {
    use tauri_plugin_opener::OpenerExt;
    let dir = app_dir()?;
    fs::create_dir_all(&dir).map_err(err)?;
    let path = dir.to_string_lossy().to_string();
    app.opener().open_path(path.clone(), None::<&str>).map_err(err)?;
    Ok(path)
}

/// Copies config.json into `folder` as `dnd-notebook-config-<date>.json`
/// so the setup can move to another PC. Keys are never in it. Never overwrites.
pub fn backup_config_to(src: &Path, folder: &Path, date: &str) -> Result<PathBuf, String> {
    if !folder.is_dir() {
        return Err(format!("Folder not found: {}", folder.display()));
    }
    if !date.chars().all(|c| c.is_ascii_digit() || c == '-') {
        return Err("Invalid date".into());
    }
    let text = fs::read_to_string(src).unwrap_or_else(|_| "{}".into());
    for n in 1..100 {
        let name = if n == 1 {
            format!("dnd-notebook-config-{date}.json")
        } else {
            format!("dnd-notebook-config-{date}-{n}.json")
        };
        let target = folder.join(name);
        if !target.exists() {
            atomic_write(&target, text.as_bytes())?;
            return Ok(target);
        }
    }
    Err("Too many backups for one day in that folder".into())
}

#[tauri::command]
pub fn backup_config(folder: String, date: String) -> Result<String, String> {
    backup_config_to(&app_dir()?.join("config.json"), Path::new(&folder), &date)
        .map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
pub fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PrepareResult {
    /// "created" (new notes folder), "existing" (this app's notes folder, loaded as is),
    /// or "foreign" (an unrelated `notes` folder; nothing was written).
    pub status: String,
    pub notebook_path: String,
}

#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(err)
}

#[tauri::command]
pub fn write_text_atomic(path: String, contents: String) -> Result<(), String> {
    atomic_write(Path::new(&path), contents.as_bytes())
}

/// Renames a file, refusing to overwrite. Moves its `.bak` along with it.
pub fn rename_no_clobber(from: &Path, to: &Path) -> Result<(), String> {
    if to.exists() {
        return Err(format!("A file named {} already exists", to.display()));
    }
    fs::rename(from, to).map_err(err)?;
    let bak_from = PathBuf::from(format!("{}.bak", from.display()));
    let bak_to = PathBuf::from(format!("{}.bak", to.display()));
    if bak_from.exists() && !bak_to.exists() {
        let _ = fs::rename(bak_from, bak_to);
    }
    Ok(())
}

#[tauri::command]
pub fn rename_file(from: String, to: String) -> Result<(), String> {
    rename_no_clobber(Path::new(&from), Path::new(&to))
}

/// Checks whether the notebook folder looks like ours (has our character.json marker).
pub fn is_our_character_notebook(notebook: &Path) -> bool {
    let Ok(text) = fs::read_to_string(notebook.join("character.json")) else {
        return false;
    };
    let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) else {
        return false;
    };
    v.get("app").and_then(|a| a.as_str()) == Some(APP_MARKER)
}

/// Creates (or checks) `<folder>/notebook/` with section dirs, then writes `character.json`.
pub fn prepare_character(
    folder: &Path,
    name: &str,
    cover: &str,
    allow_foreign: bool,
) -> Result<PrepareResult, String> {
    if !folder.is_dir() {
        return Err(format!("Folder not found: {}", folder.display()));
    }
    let notebook = folder.join("notebook");
    let notebook_path = notebook.to_string_lossy().to_string();

    if notebook.exists() {
        if is_our_character_notebook(&notebook) {
            fs::create_dir_all(notebook.join("assets")).map_err(err)?;
            return Ok(PrepareResult { status: "existing".into(), notebook_path });
        }
        if !allow_foreign {
            return Ok(PrepareResult { status: "foreign".into(), notebook_path });
        }
        if notebook.join("character.json").exists() {
            return Err("This notebook folder already has a character.json from another app. Choose a different folder.".into());
        }
    }

    // Default section ids (must match src/model/character.ts DEFAULT_SECTIONS).
    let section_ids = ["sessions", "backstory", "likes", "dislikes", "wants", "notes", "sheet"];
    for sid in section_ids {
        fs::create_dir_all(notebook.join("pages").join(sid)).map_err(err)?;
    }
    fs::create_dir_all(notebook.join("assets")).map_err(err)?;

    let character = serde_json::json!({
        "app": APP_MARKER,
        "schemaVersion": 1,
        "name": name,
        "cover": cover,
    });
    let text = serde_json::to_string_pretty(&character).map_err(err)?;
    atomic_write(&notebook.join("character.json"), text.as_bytes())?;
    Ok(PrepareResult { status: "created".into(), notebook_path })
}

#[tauri::command]
pub fn prepare_character_folder(
    folder: String,
    name: String,
    cover: String,
    allow_foreign: bool,
) -> Result<PrepareResult, String> {
    prepare_character(Path::new(&folder), &name, &cover, allow_foreign)
}

/// File names (not paths) of every `*.page.json` in `<notebook>/pages/<sectionId>`.
#[tauri::command]
pub fn list_section_page_files(
    notebook_path: String,
    section_id: String,
) -> Result<Vec<String>, String> {
    if section_id.contains(['/', '\\', '.']) {
        return Err(format!("Invalid section id: {section_id}"));
    }
    let pages = Path::new(&notebook_path).join("pages").join(&section_id);
    if !pages.is_dir() {
        return Err(format!("Folder not found: {}", pages.display()));
    }
    let mut out: Vec<String> = fs::read_dir(&pages)
        .map_err(err)?
        .filter_map(|e| e.ok())
        .map(|e| e.file_name().to_string_lossy().to_string())
        .filter(|n| n.ends_with(".page.json"))
        .collect();
    out.sort();
    Ok(out)
}

/// Keeps the name and cover colour in this app's `character.json` in step with the app config.
pub fn update_character_meta_in(notebook: &Path, name: &str, cover: &str) -> Result<(), String> {
    if !is_our_character_notebook(notebook) {
        return Ok(());
    }
    let path = notebook.join("character.json");
    let text = fs::read_to_string(&path).map_err(err)?;
    let mut v: serde_json::Value = serde_json::from_str(&text).map_err(err)?;
    let Some(obj) = v.as_object_mut() else { return Ok(()) };
    obj.insert("name".into(), serde_json::Value::String(name.into()));
    obj.insert("cover".into(), serde_json::Value::String(cover.into()));
    let out = serde_json::to_string_pretty(&v).map_err(err)?;
    if out != text {
        atomic_write(&path, out.as_bytes())?;
    }
    Ok(())
}

#[tauri::command]
pub fn update_character_meta(
    notebook_path: String,
    name: String,
    cover: String,
) -> Result<(), String> {
    update_character_meta_in(Path::new(&notebook_path), &name, &cover)
}

/// Section ids name folders under `pages/`: lower-case letters, digits and hyphens only.
pub fn valid_section_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && !id.starts_with('-')
        && id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

/// Creates `hand`, `imports`, `assets` or `pages/<sectionId>` inside one of this app's notebooks.
pub fn ensure_dir_in(notebook: &Path, rel: &str) -> Result<(), String> {
    if !is_our_character_notebook(notebook) {
        return Err(format!("Not a notebook folder made by this app: {}", notebook.display()));
    }
    let target = match rel {
        "hand" | "imports" | "assets" => notebook.join(rel),
        _ => {
            let id = rel.strip_prefix("pages/").ok_or_else(|| format!("Invalid folder: {rel}"))?;
            if !valid_section_id(id) {
                return Err(format!("Invalid section id: {id}"));
            }
            notebook.join("pages").join(id)
        }
    };
    fs::create_dir_all(target).map_err(err)
}

#[tauri::command]
pub fn ensure_notebook_dir(notebook_path: String, rel: String) -> Result<(), String> {
    ensure_dir_in(Path::new(&notebook_path), &rel)
}

/// Moves a removed section's folder to the Recycle Bin. Never a hard delete.
pub fn trash_section_dir(notebook: &Path, section_id: &str) -> Result<(), String> {
    if !valid_section_id(section_id) {
        return Err(format!("Invalid section id: {section_id}"));
    }
    if !is_our_character_notebook(notebook) {
        return Err(format!("Not a notebook folder made by this app: {}", notebook.display()));
    }
    let dir = notebook.join("pages").join(section_id);
    if !dir.is_dir() {
        return Ok(());
    }
    trash::delete(&dir).map_err(|e| format!("Could not move the section to the Recycle Bin: {e}"))
}

#[tauri::command]
pub fn trash_section_folder(notebook_path: String, section_id: String) -> Result<(), String> {
    trash_section_dir(Path::new(&notebook_path), &section_id)
}

/// Keeps a copy of an imported sheet as `imports/<name>.pdf`, adding -2, -3 rather than overwriting.
pub fn save_import_copy_in(notebook: &Path, file_name: &str, bytes: &[u8]) -> Result<String, String> {
    let ok = file_name.ends_with(".pdf")
        && !file_name.starts_with('.')
        && file_name.len() <= 120
        && file_name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_');
    if !ok {
        return Err(format!("Invalid import file name: {file_name}"));
    }
    ensure_dir_in(notebook, "imports")?;
    let dir = notebook.join("imports");
    let stem = file_name.trim_end_matches(".pdf");
    let mut name = file_name.to_string();
    let mut n = 2;
    while dir.join(&name).exists() {
        name = format!("{stem}-{n}.pdf");
        n += 1;
    }
    atomic_write(&dir.join(&name), bytes)?;
    Ok(format!("imports/{name}"))
}

#[tauri::command]
pub fn save_import_copy(
    notebook_path: String,
    file_name: String,
    data_base64: String,
) -> Result<String, String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_base64.as_bytes())
        .map_err(err)?;
    save_import_copy_in(Path::new(&notebook_path), &file_name, &bytes)
}

/// Only a `*.page.json` file directly inside `<notebook>/pages/<sectionId>` may be moved to the bin.
pub fn check_page_file(path: &Path) -> Result<(), String> {
    use std::path::Component;
    let bad = || format!("Not a page file: {}", path.display());
    if path.components().any(|c| matches!(c, Component::ParentDir | Component::CurDir)) {
        return Err(bad());
    }
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
    // Expected: <notebook>/pages/<sectionId>/<file>.page.json
    let section_dir = path.parent();
    let pages_dir = section_dir.and_then(Path::parent);
    let notebook = pages_dir.and_then(Path::parent);
    let named = |p: Option<&Path>, want: &str| {
        p.and_then(Path::file_name).map(|n| n == want).unwrap_or(false)
    };
    // section_dir name is any non-empty string without separators
    let section_ok = section_dir
        .and_then(Path::file_name)
        .and_then(|n| n.to_str())
        .map(|n| !n.is_empty() && !n.starts_with('.') && !n.contains(['/', '\\']))
        .unwrap_or(false);
    if !name.ends_with(".page.json") || !named(pages_dir, "pages") || !section_ok {
        return Err(bad());
    }
    let _ = notebook;
    if !path.is_file() {
        return Err(format!("File not found: {}", path.display()));
    }
    Ok(())
}

/// Deletes a page by moving it, and its `.bak`, to the Recycle Bin. Never a hard delete.
#[tauri::command]
pub fn trash_page_file(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    check_page_file(p)?;
    trash::delete(p).map_err(|e| format!("Could not move the page to the Recycle Bin: {e}"))?;
    let bak = PathBuf::from(format!("{}.bak", p.display()));
    if bak.is_file() {
        let _ = trash::delete(&bak);
    }
    Ok(())
}

#[tauri::command]
pub fn open_in_explorer(app: tauri::AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    if !Path::new(&path).exists() {
        return Err(format!("Folder not found: {path}"));
    }
    app.opener().open_path(path, None::<&str>).map_err(err)
}


#[cfg(test)]
mod tests {
    use super::*;

    fn character(root: &Path, name: &str) -> PathBuf {
        let folder = root.join(name);
        fs::create_dir_all(&folder).unwrap();
        prepare_character(&folder, name, "#46562f", false).unwrap();
        folder.join("notebook")
    }

    #[test]
    fn prepare_creates_sections_and_marker_then_reuses() {
        let dir = tempfile::tempdir().unwrap();
        let r = prepare_character(dir.path(), "Cosworth", "#46562f", false).unwrap();
        assert_eq!(r.status, "created");
        let nb = dir.path().join("notebook");
        for s in ["sessions", "backstory", "likes", "dislikes", "wants", "notes", "sheet"] {
            assert!(nb.join("pages").join(s).is_dir(), "{s}");
        }
        assert!(nb.join("assets").is_dir());
        assert!(is_our_character_notebook(&nb));
        fs::write(nb.join("character.json"), r#"{"app":"dnd-notebook","name":"Kept"}"#).unwrap();
        let r2 = prepare_character(dir.path(), "Other", "#fff", false).unwrap();
        assert_eq!(r2.status, "existing");
        assert!(fs::read_to_string(nb.join("character.json")).unwrap().contains("Kept"));
    }

    #[test]
    fn prepare_flags_foreign_notebook_without_writing() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join("notebook")).unwrap();
        fs::write(dir.path().join("notebook/todo.txt"), "mine").unwrap();
        let r = prepare_character(dir.path(), "X", "#fff", false).unwrap();
        assert_eq!(r.status, "foreign");
        assert!(!dir.path().join("notebook/character.json").exists());
        let r2 = prepare_character(dir.path(), "X", "#fff", true).unwrap();
        assert_eq!(r2.status, "created");
        assert_eq!(fs::read_to_string(dir.path().join("notebook/todo.txt")).unwrap(), "mine");
    }

    #[test]
    fn prepare_never_creates_missing_folder() {
        let dir = tempfile::tempdir().unwrap();
        let missing = dir.path().join("gone");
        assert!(prepare_character(&missing, "X", "#fff", false).is_err());
        assert!(!missing.exists());
    }

    #[test]
    fn character_meta_updates_only_our_file() {
        let dir = tempfile::tempdir().unwrap();
        let nb = character(dir.path(), "a");
        update_character_meta_in(&nb, "New name", "#6b2a26").unwrap();
        let v: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(nb.join("character.json")).unwrap()).unwrap();
        assert_eq!(v["name"], "New name");
        assert_eq!(v["cover"], "#6b2a26");
        assert_eq!(v["app"], APP_MARKER);

        let other = dir.path().join("b").join("notebook");
        fs::create_dir_all(&other).unwrap();
        fs::write(other.join("character.json"), r#"{"name":"Theirs"}"#).unwrap();
        update_character_meta_in(&other, "New name", "#fff").unwrap();
        assert_eq!(fs::read_to_string(other.join("character.json")).unwrap(), r#"{"name":"Theirs"}"#);
    }

    #[test]
    fn section_ids_are_safe_folder_names() {
        for ok in ["sessions", "notes", "spells-2", "s-ab12cd"] {
            assert!(valid_section_id(ok), "{ok}");
        }
        for bad in ["", "..", "a/b", "a\\b", "Sessions", "-x", "a.b", "a b"] {
            assert!(!valid_section_id(bad), "{bad}");
        }
    }

    #[test]
    fn ensure_dir_only_inside_our_notebook() {
        let dir = tempfile::tempdir().unwrap();
        let nb = character(dir.path(), "a");
        ensure_dir_in(&nb, "pages/quests").unwrap();
        ensure_dir_in(&nb, "hand").unwrap();
        ensure_dir_in(&nb, "imports").unwrap();
        assert!(nb.join("pages/quests").is_dir());
        assert!(nb.join("hand").is_dir());
        for bad in ["pages/../x", "pages/A", "..", "other", "pages/"] {
            assert!(ensure_dir_in(&nb, bad).is_err(), "{bad}");
        }
        let foreign = dir.path().join("f").join("notebook");
        fs::create_dir_all(&foreign).unwrap();
        assert!(ensure_dir_in(&foreign, "hand").is_err());
        assert!(!foreign.join("hand").exists());
    }

    #[test]
    fn trashing_a_section_checks_its_id_and_owner() {
        let dir = tempfile::tempdir().unwrap();
        let nb = character(dir.path(), "a");
        assert!(trash_section_dir(&nb, "..").is_err());
        assert!(trash_section_dir(&nb, "missing-section").is_ok());
        let foreign = dir.path().join("f").join("notebook");
        fs::create_dir_all(foreign.join("pages/notes")).unwrap();
        assert!(trash_section_dir(&foreign, "notes").is_err());
        assert!(foreign.join("pages/notes").is_dir());
    }

    #[test]
    fn import_copies_never_overwrite() {
        let dir = tempfile::tempdir().unwrap();
        let nb = character(dir.path(), "a");
        let a = save_import_copy_in(&nb, "2026-11-06-sheet.pdf", b"one").unwrap();
        let b = save_import_copy_in(&nb, "2026-11-06-sheet.pdf", b"two").unwrap();
        assert_eq!(a, "imports/2026-11-06-sheet.pdf");
        assert_eq!(b, "imports/2026-11-06-sheet-2.pdf");
        assert_eq!(fs::read(nb.join(&a)).unwrap(), b"one");
        for bad in ["../x.pdf", "x.txt", ".x.pdf", "a b.pdf", "a/b.pdf"] {
            assert!(save_import_copy_in(&nb, bad, b"x").is_err(), "{bad}");
        }
    }

    #[test]
    fn only_page_files_in_a_section_can_be_binned() {
        let dir = tempfile::tempdir().unwrap();
        let section = dir.path().join("Cosworth").join("notebook").join("pages").join("sessions");
        fs::create_dir_all(&section).unwrap();
        let pages = section.parent().unwrap();
        let page = section.join("0001-session-1.page.json");
        fs::write(&page, "{}").unwrap();
        let other = section.join("notes.txt");
        fs::write(&other, "x").unwrap();
        let loose = dir.path().join("Cosworth").join("a.page.json");
        fs::write(&loose, "{}").unwrap();

        assert!(check_page_file(&page).is_ok());
        assert!(check_page_file(&other).is_err());
        assert!(check_page_file(&loose).is_err());
        assert!(check_page_file(&section.join("missing.page.json")).is_err());
        assert!(check_page_file(
            &pages.join("..").join("pages").join("sessions").join("0001-session-1.page.json")
        )
        .is_err());
    }

    #[test]
    fn atomic_write_keeps_one_backup() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("a.page.json");
        atomic_write(&p, b"one").unwrap();
        assert!(!dir.path().join("a.page.json.bak").exists());
        atomic_write(&p, b"two").unwrap();
        atomic_write(&p, b"three").unwrap();
        assert_eq!(fs::read_to_string(&p).unwrap(), "three");
        assert_eq!(fs::read_to_string(dir.path().join("a.page.json.bak")).unwrap(), "two");
        assert!(!dir.path().join(".a.page.json.tmp").exists());
    }

    #[test]
    fn atomic_write_refuses_missing_folder() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("gone").join("x.json");
        assert!(atomic_write(&p, b"x").is_err());
        assert!(!dir.path().join("gone").exists());
    }

    #[test]
    fn rename_refuses_to_clobber_and_moves_bak() {
        let dir = tempfile::tempdir().unwrap();
        let a = dir.path().join("a.page.json");
        let b = dir.path().join("b.page.json");
        atomic_write(&a, b"1").unwrap();
        atomic_write(&a, b"2").unwrap();
        rename_no_clobber(&a, &b).unwrap();
        assert!(!a.exists());
        assert_eq!(fs::read_to_string(&b).unwrap(), "2");
        assert!(dir.path().join("b.page.json.bak").exists());
        fs::write(&a, "other").unwrap();
        assert!(rename_no_clobber(&a, &b).is_err());
        assert_eq!(fs::read_to_string(&b).unwrap(), "2");
    }

    #[test]
    fn config_backup_never_overwrites() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("config.json");
        fs::write(&src, "{\"characters\":[]}").unwrap();
        let out = dir.path().join("out");
        fs::create_dir(&out).unwrap();
        let a = backup_config_to(&src, &out, "2026-11-05").unwrap();
        let b = backup_config_to(&src, &out, "2026-11-05").unwrap();
        assert!(a.ends_with("dnd-notebook-config-2026-11-05.json"));
        assert!(b.ends_with("dnd-notebook-config-2026-11-05-2.json"));
        assert!(backup_config_to(&src, &dir.path().join("missing"), "2026-11-05").is_err());
    }

    #[test]
    fn app_file_names_are_restricted() {
        assert!(app_file("summary-cache.json").is_ok());
        assert!(app_file("../evil.json").is_err());
        assert!(app_file("a/b.json").is_err());
        assert!(app_file(".hidden").is_err());
        assert!(app_file("config.json").is_err());
    }
}
