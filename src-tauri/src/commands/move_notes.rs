//! "Move existing notes" when a client's folder changes (SPEC: Settings, Change folder):
//! copy the notes folder, verify every file, then remove the old copy.
//!
//! The old copy goes to the Recycle Bin rather than being deleted outright, so a move can
//! always be undone by hand. If anything fails before that point the original is untouched
//! and the partial copy (which this command created) is removed.

use crate::commands::fs::is_our_character_notebook;
use crate::commands::watch::WatchState;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use tauri::State;

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

/// Every file under `dir`, as paths relative to it. Links are refused rather than followed.
fn list_files(dir: &Path) -> Result<Vec<PathBuf>, String> {
    let mut out = Vec::new();
    let mut stack = vec![PathBuf::new()];
    while let Some(rel) = stack.pop() {
        for entry in fs::read_dir(dir.join(&rel)).map_err(err)? {
            let entry = entry.map_err(err)?;
            let kind = entry.file_type().map_err(err)?;
            let child = rel.join(entry.file_name());
            if kind.is_symlink() {
                return Err(format!(
                    "The notes folder contains a link ({}), which the app will not move. Move it by hand instead.",
                    child.display()
                ));
            } else if kind.is_dir() {
                stack.push(child);
            } else {
                out.push(child);
            }
        }
    }
    out.sort();
    Ok(out)
}

fn file_hash(path: &Path) -> Result<(u64, [u8; 32]), String> {
    let mut f = fs::File::open(path).map_err(err)?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 64 * 1024];
    let mut len = 0u64;
    loop {
        let n = f.read(&mut buf).map_err(err)?;
        if n == 0 {
            break;
        }
        len += n as u64;
        hasher.update(&buf[..n]);
    }
    Ok((len, hasher.finalize().into()))
}

fn copy_tree(from: &Path, to: &Path, files: &[PathBuf]) -> Result<(), String> {
    fs::create_dir_all(to).map_err(err)?;
    // Recreate empty folders too (for example an empty `assets`).
    let mut stack = vec![PathBuf::new()];
    while let Some(rel) = stack.pop() {
        for entry in fs::read_dir(from.join(&rel)).map_err(err)? {
            let entry = entry.map_err(err)?;
            if entry.file_type().map_err(err)?.is_dir() {
                let child = rel.join(entry.file_name());
                fs::create_dir_all(to.join(&child)).map_err(err)?;
                stack.push(child);
            }
        }
    }
    for rel in files {
        fs::copy(from.join(rel), to.join(rel))
            .map_err(|e| format!("Could not copy {}: {e}", rel.display()))?;
    }
    Ok(())
}

fn verify(from: &Path, to: &Path, files: &[PathBuf]) -> Result<(), String> {
    for rel in files {
        let a = file_hash(&from.join(rel))?;
        let b = file_hash(&to.join(rel))
            .map_err(|e| format!("{} is missing from the copy: {e}", rel.display()))?;
        if a != b {
            return Err(format!("{} did not copy correctly.", rel.display()));
        }
    }
    Ok(())
}

/// Same folder, or one inside the other, after resolving `..` and links.
fn overlaps(a: &Path, b: &Path) -> bool {
    let (Ok(a), Ok(b)) = (a.canonicalize(), b.canonicalize()) else {
        return false;
    };
    a.starts_with(&b) || b.starts_with(&a)
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MoveNotebookResult {
    pub notebook_path: String,
    pub files: usize,
    pub old_left_behind: Option<String>,
}

/// The move itself, with the final "remove the old copy" step passed in so tests can run it
/// without touching the real Recycle Bin.
pub fn move_notebook_with(
    from_notebook: &Path,
    to_folder: &Path,
    remove_old: impl Fn(&Path) -> Result<(), String>,
) -> Result<MoveNotebookResult, String> {
    if !is_our_character_notebook(from_notebook) {
        return Err(format!(
            "{} is not a notebook folder made by this app, so it will not be moved.",
            from_notebook.display()
        ));
    }
    if !to_folder.is_dir() {
        return Err(format!("Folder not found: {}", to_folder.display()));
    }
    let to_notebook = to_folder.join("notebook");
    if overlaps(from_notebook, to_folder) {
        return Err("Choose a folder outside the current notebook folder.".into());
    }
    let existed = to_notebook.exists();
    if existed && fs::read_dir(&to_notebook).map_err(err)?.next().is_some() {
        return Err(format!(
            "{} already exists and is not empty. Choose another folder.",
            to_notebook.display()
        ));
    }

    let files = list_files(from_notebook)?;
    let copied = copy_tree(from_notebook, &to_notebook, &files)
        .and_then(|_| verify(from_notebook, &to_notebook, &files));
    if let Err(e) = copied {
        if existed {
            for entry in fs::read_dir(&to_notebook).into_iter().flatten().flatten() {
                let p = entry.path();
                let _ = if p.is_dir() { fs::remove_dir_all(&p) } else { fs::remove_file(&p) };
            }
        } else {
            let _ = fs::remove_dir_all(&to_notebook);
        }
        return Err(format!(
            "The notebook was not moved: {e} The original folder is untouched."
        ));
    }

    let old_left_behind = remove_old(from_notebook).err();
    Ok(MoveNotebookResult {
        notebook_path: to_notebook.to_string_lossy().to_string(),
        files: files.len(),
        old_left_behind,
    })
}

#[tauri::command]
pub fn move_notebook(
    watch: State<'_, WatchState>,
    from_notebook: String,
    to_folder: String,
) -> Result<MoveNotebookResult, String> {
    watch.stop(&from_notebook);
    move_notebook_with(Path::new(&from_notebook), Path::new(&to_folder), |old| {
        trash::delete(old).map_err(|e| e.to_string())
    })
}


#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::fs::prepare_character;
    use std::cell::RefCell;

    fn character(root: &Path, name: &str) -> PathBuf {
        let folder = root.join(name);
        fs::create_dir_all(&folder).unwrap();
        prepare_character(&folder, name, "#46562f", false).unwrap();
        let nb = folder.join("notebook");
        fs::write(nb.join("pages/sessions/0001-session-1.page.json"), "{\"a\":1}").unwrap();
        fs::write(nb.join("pages/sessions/0001-session-1.page.json.bak"), "{\"a\":0}").unwrap();
        fs::write(nb.join("assets").join("abc.png"), [0u8, 1, 2, 3, 255]).unwrap();
        nb
    }

    #[test]
    fn copies_verifies_then_removes_old() {
        let dir = tempfile::tempdir().unwrap();
        let from = character(dir.path(), "Old");
        let to = dir.path().join("New");
        fs::create_dir_all(&to).unwrap();
        let removed = RefCell::new(None);
        let r = move_notebook_with(&from, &to, |p| {
            *removed.borrow_mut() = Some(p.to_path_buf());
            Ok(())
        })
        .unwrap();
        assert_eq!(r.files, 4); // character.json, page, .bak, asset
        assert_eq!(r.old_left_behind, None);
        assert_eq!(removed.borrow().as_deref(), Some(from.as_path()));
        let nb = to.join("notebook");
        assert_eq!(fs::read(nb.join("assets/abc.png")).unwrap(), vec![0u8, 1, 2, 3, 255]);
        assert!(nb.join("pages/notes").is_dir(), "empty section folders come too");
        assert!(is_our_character_notebook(&nb));
    }

    #[test]
    fn reports_an_old_copy_it_could_not_remove() {
        let dir = tempfile::tempdir().unwrap();
        let from = character(dir.path(), "Old");
        let to = dir.path().join("New");
        fs::create_dir_all(&to).unwrap();
        let r = move_notebook_with(&from, &to, |_| Err("in use".into())).unwrap();
        assert_eq!(r.old_left_behind.as_deref(), Some("in use"));
        assert!(from.join("character.json").exists());
    }

    #[test]
    fn refuses_unsafe_moves_and_never_removes_the_original() {
        let dir = tempfile::tempdir().unwrap();
        let from = character(dir.path(), "Old");
        let never = |_: &Path| -> Result<(), String> { panic!("must not remove the original") };

        let busy = dir.path().join("Busy");
        fs::create_dir_all(busy.join("notebook")).unwrap();
        fs::write(busy.join("notebook").join("mine.txt"), "x").unwrap();
        assert!(move_notebook_with(&from, &busy, never).unwrap_err().contains("not empty"));
        assert_eq!(fs::read_to_string(busy.join("notebook/mine.txt")).unwrap(), "x");

        assert!(move_notebook_with(&from, &from.join("pages"), never)
            .unwrap_err()
            .contains("outside"));
        assert!(move_notebook_with(&from, &dir.path().join("Nope"), never).is_err());

        let foreign = dir.path().join("Foreign").join("notebook");
        fs::create_dir_all(&foreign).unwrap();
        let to = dir.path().join("New");
        fs::create_dir_all(&to).unwrap();
        assert!(move_notebook_with(&foreign, &to, never)
            .unwrap_err()
            .contains("not a notebook folder"));
        assert!(!to.join("notebook").exists());
        assert!(from.join("pages/sessions/0001-session-1.page.json").exists());
    }

    #[test]
    fn verify_catches_a_bad_copy() {
        let dir = tempfile::tempdir().unwrap();
        let from = character(dir.path(), "Old");
        let to = dir.path().join("copy");
        let files = list_files(&from).unwrap();
        copy_tree(&from, &to, &files).unwrap();
        assert!(verify(&from, &to, &files).is_ok());
        fs::write(to.join("assets/abc.png"), [9u8]).unwrap();
        assert!(verify(&from, &to, &files).unwrap_err().contains("abc.png"));
    }
}
