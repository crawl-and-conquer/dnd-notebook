//! Watches each character's `notebook/pages` folder and tells the front end which page files
//! changed (SPEC: Saving rules). The front end decides whether a change came from the app
//! itself, and whether to reload the page or keep unsaved edits.

use notify_debouncer_mini::notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_mini::{new_debouncer, DebounceEventResult, Debouncer};
use serde::Serialize;
use std::collections::{BTreeSet, HashMap};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

/// Changes closer together than this arrive as one event (sync tools write in bursts).
const DEBOUNCE: Duration = Duration::from_millis(400);

#[derive(Default)]
pub struct WatchState {
    watchers: Mutex<HashMap<String, Debouncer<RecommendedWatcher>>>,
}

impl WatchState {
    /// Stops watching a notes folder. Windows will not move a folder that is being watched.
    pub fn stop(&self, notes_path: &str) {
        if let Ok(mut watchers) = self.watchers.lock() {
            watchers.remove(notes_path);
        }
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct NotesChanged {
    notes_path: String,
    /// File names (not paths) of page files that were created, changed or removed.
    files: Vec<String>,
    /// The watcher reported an error (for example the folder went away): check the folder.
    rescan: bool,
}

/// `<sectionId>/<file>.page.json` for every page file directly inside a section folder under
/// `pages`, sorted and de-duplicated. Temp files, `.bak` files and anything else are ignored.
pub fn page_file_names(paths: impl IntoIterator<Item = PathBuf>) -> Vec<String> {
    let set: BTreeSet<String> = paths
        .into_iter()
        .filter_map(|p| {
            let file = p.file_name()?.to_str()?.to_string();
            let section_dir = p.parent()?;
            let section = section_dir.file_name()?.to_str()?.to_string();
            let pages = section_dir.parent()?.file_name()?;
            let ok = pages == "pages"
                && section != "pages"
                && file.ends_with(".page.json")
                && !file.starts_with('.');
            ok.then(|| format!("{section}/{file}"))
        })
        .collect();
    set.into_iter().collect()
}

/// Watch all section subdirectories under `<notebook>/pages/` (recursive on that folder).
#[tauri::command]
pub fn watch_notebook_folder(
    app: AppHandle,
    state: State<'_, WatchState>,
    notebook_path: String,
) -> Result<(), String> {
    let mut watchers = state.watchers.lock().map_err(|e| e.to_string())?;
    if watchers.contains_key(&notebook_path) {
        return Ok(());
    }
    let pages = Path::new(&notebook_path).join("pages");
    if !pages.is_dir() {
        return Err(format!("Folder not found: {}", pages.display()));
    }
    let key = notebook_path.clone();
    let mut debouncer = new_debouncer(DEBOUNCE, move |res: DebounceEventResult| {
        let payload = match res {
            Ok(events) => {
                let files = page_file_names(events.into_iter().map(|e| e.path));
                if files.is_empty() {
                    return;
                }
                NotesChanged { notes_path: key.clone(), files, rescan: false }
            }
            Err(_) => NotesChanged { notes_path: key.clone(), files: vec![], rescan: true },
        };
        let _ = app.emit("notes-changed", payload);
    })
    .map_err(|e| format!("Could not watch {}: {e}", pages.display()))?;
    debouncer
        .watcher()
        .watch(&pages, RecursiveMode::Recursive)
        .map_err(|e| format!("Could not watch {}: {e}", pages.display()))?;
    watchers.insert(notebook_path, debouncer);
    Ok(())
}

#[tauri::command]
pub fn unwatch_notebook_folder(state: State<'_, WatchState>, notebook_path: String) {
    state.stop(&notebook_path);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_only_page_files_in_pages() {
        let base = PathBuf::from("C:/Characters/Cosworth/notebook");
        let names = page_file_names(vec![
            base.join("pages").join("sessions").join("2026-11-06-b.page.json"),
            base.join("pages").join("sessions").join("2026-11-06-a.page.json"),
            base.join("pages").join("sessions").join("2026-11-06-a.page.json"),
            base.join("pages").join("sessions").join("2026-11-06-a.page.json.bak"),
            base.join("pages").join("sessions").join(".2026-11-06-a.page.json.tmp"),
            base.join("pages").join("sessions").join("notes.txt"),
            base.join("character.json"),
            base.join("assets").join("x.page.json"),
            base.join("pages").join("sessions"),
            base.join("pages").join("sessions").join("extra").join("deep.page.json"),
        ]);
        assert_eq!(names, vec!["sessions/2026-11-06-a.page.json", "sessions/2026-11-06-b.page.json"]);
    }

    #[test]
    fn reports_real_changes_in_a_folder() {
        use std::sync::mpsc;
        let dir = tempfile::tempdir().unwrap();
        let section = dir.path().join("notebook").join("pages").join("sessions");
        std::fs::create_dir_all(&section).unwrap();
        let pages = section.parent().unwrap();
        let (tx, rx) = mpsc::channel();
        let mut d = new_debouncer(Duration::from_millis(100), move |res: DebounceEventResult| {
            if let Ok(events) = res {
                let _ = tx.send(page_file_names(events.into_iter().map(|e| e.path)));
            }
        })
        .unwrap();
        d.watcher().watch(pages, RecursiveMode::Recursive).unwrap();
        std::fs::write(section.join("2026-11-06-x.page.json"), "{}").unwrap();
        let got = rx.recv_timeout(Duration::from_secs(5)).unwrap();
        assert_eq!(got, vec!["sessions/2026-11-06-x.page.json"]);
    }
}
