#![allow(
    clippy::missing_errors_doc,
    reason = "native command services return renderer-safe String errors through narrow IPC"
)]
//! The occasional, folder-scoped reorganization pass (#18).
//!
//! Deliberately *not* the incremental filer: this never runs as a side effect
//! of a capture, only ever touches the one folder it was invoked on, reads
//! each note's `context:` mini-summary instead of its body, and records every
//! move so the whole pass can be undone in one action.

use std::{fs, path::Path};

use knowledge_ai::{AiPort, AiRequest};
use serde::{Deserialize, Serialize};

use crate::knowledge::{LibrarySnapshot, library_in_vault};

/// Below this a folder is not crowded enough to be worth a model call, and
/// splitting it would invent structure the vault does not need yet.
pub const MINIMUM_NOTES: usize = 8;
/// Where the non-blocking "this folder is getting crowded" hint starts.
pub const SUGGESTION_THRESHOLD: usize = 12;

const UNDO_FILE: &str = ".knowledge-os/librarian-undo.json";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarianMove {
    pub from: String,
    pub to: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarianOutcome {
    pub folder: String,
    pub moves: Vec<LibrarianMove>,
    pub skipped: Vec<String>,
    /// The refreshed library, carried back with the outcome so the renderer
    /// repaints the tree without a second round trip.
    pub library: LibrarySnapshot,
}

#[derive(Debug, Deserialize)]
struct ProposedGroup {
    name: String,
    #[serde(default)]
    files: Vec<String>,
    #[serde(default)]
    reason: String,
}

#[derive(Debug, Deserialize)]
struct ProposedPlan {
    #[serde(default)]
    folders: Vec<ProposedGroup>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct NoteSummary {
    name: String,
    context: String,
}

/// Folders holding enough notes that a reorganization is worth suggesting.
/// Only ever a hint — nothing here reorganizes on its own.
#[must_use]
pub fn crowded_folders(vault_root: &Path, threshold: usize) -> Vec<String> {
    let mut crowded = Vec::new();
    collect_crowded(vault_root, vault_root, threshold, &mut crowded);
    crowded.sort();
    crowded
}

fn collect_crowded(vault_root: &Path, directory: &Path, threshold: usize, found: &mut Vec<String>) {
    let Ok(entries) = fs::read_dir(directory) else {
        return;
    };
    let mut notes = 0;
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        if path.is_dir() {
            collect_crowded(vault_root, &path, threshold, found);
        } else if is_markdown(&path) {
            notes += 1;
        }
    }
    if notes >= threshold && directory != vault_root {
        found.push(relative_of(vault_root, directory));
    }
}

/// Runs one scoped pass: reads the folder's mini-summaries, asks the model for
/// a sub-folder split, applies it, and records the moves for undo.
pub fn reorganize_folder(
    vault_root: &Path,
    folder: &str,
    ai: &dyn AiPort,
    model_id: &str,
) -> Result<LibrarianOutcome, String> {
    let target = resolve_folder(vault_root, folder)?;
    let notes = folder_summaries(&target)?;
    if notes.len() < MINIMUM_NOTES {
        return Err(format!(
            "this folder holds {} notes — reorganizing is only worth it from {MINIMUM_NOTES}",
            notes.len()
        ));
    }
    let response = ai
        .complete(&AiRequest {
            model_id: model_id.to_owned(),
            system: r#"You reorganize one folder of a personal knowledge base into coherent sub-folders. Return only JSON of this exact shape, with no prose around it:
{"folders": [{"name": string, "files": string[], "reason": string}]}
Rules: propose between 2 and 6 sub-folders; "files" holds exact file names taken from the input list; every file appears at most once; leave a file out entirely when it does not belong in any group; sub-folder names are short, specific and in English; never propose a name that only restates the parent folder."#.to_owned(),
            input: format!(
                "Folder: {folder}\nExisting top-level categories: {}\n\nNotes in this folder (file name — what it is about):\n{}",
                existing_categories(vault_root).join(", "),
                notes
                    .iter()
                    .map(|note| format!("- {} — {}", note.name, note.context))
                    .collect::<Vec<_>>()
                    .join("\n")
            ),
            max_output_tokens: 2_000,
            temperature_milli: 0,
            schema_version: "librarian-plan-v1".to_owned(),
        })
        .map_err(|error| error.to_string())?;
    let plan: ProposedPlan =
        serde_json::from_str(&response.content).map_err(|error| error.to_string())?;
    apply_plan(vault_root, folder, &target, &plan, &notes)
}

fn apply_plan(
    vault_root: &Path,
    folder: &str,
    target: &Path,
    plan: &ProposedPlan,
    notes: &[NoteSummary],
) -> Result<LibrarianOutcome, String> {
    let mut moves = Vec::new();
    let mut skipped = Vec::new();
    for group in &plan.folders {
        let group_name = sanitize_segment(&group.name);
        if group_name.is_empty() {
            continue;
        }
        let destination = target.join(&group_name);
        for file in &group.files {
            let Some(note) = notes.iter().find(|note| note.name == *file) else {
                skipped.push(file.clone());
                continue;
            };
            let source = target.join(&note.name);
            if !source.is_file() {
                skipped.push(note.name.clone());
                continue;
            }
            if fs::create_dir_all(&destination).is_err() {
                skipped.push(note.name.clone());
                continue;
            }
            let moved_to = destination.join(&note.name);
            if moved_to.exists() || fs::rename(&source, &moved_to).is_err() {
                skipped.push(note.name.clone());
                continue;
            }
            moves.push(LibrarianMove {
                from: format!("{folder}/{}", note.name),
                to: format!("{folder}/{group_name}/{}", note.name),
                reason: group.reason.clone(),
            });
        }
    }
    write_undo(vault_root, &moves)?;
    Ok(LibrarianOutcome {
        folder: folder.to_owned(),
        moves,
        skipped,
        library: library_in_vault(vault_root)?,
    })
}

/// Restores every file the last applied pass moved. One action, like the pass
/// itself — the counterpart of `apply_organization`'s single-audit undo.
pub fn undo_last_reorganization(vault_root: &Path) -> Result<LibrarianOutcome, String> {
    let journal = vault_root.join(UNDO_FILE);
    let raw = fs::read_to_string(&journal)
        .map_err(|_| "there is no reorganization to undo".to_owned())?;
    let moves: Vec<LibrarianMove> =
        serde_json::from_str(&raw).map_err(|error| error.to_string())?;
    if moves.is_empty() {
        return Err("there is no reorganization to undo".to_owned());
    }
    let mut restored = Vec::new();
    let mut skipped = Vec::new();
    for entry in &moves {
        let current = vault_root.join(&entry.to);
        let previous = vault_root.join(&entry.from);
        if !current.is_file() || previous.exists() {
            skipped.push(entry.to.clone());
            continue;
        }
        if let Some(parent) = previous.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if fs::rename(&current, &previous).is_err() {
            skipped.push(entry.to.clone());
            continue;
        }
        if let Some(parent) = current.parent()
            && fs::read_dir(parent).is_ok_and(|mut entries| entries.next().is_none())
        {
            let _ = fs::remove_dir(parent);
        }
        restored.push(LibrarianMove {
            from: entry.to.clone(),
            to: entry.from.clone(),
            reason: "undo".to_owned(),
        });
    }
    let _ = fs::remove_file(&journal);
    Ok(LibrarianOutcome {
        folder: String::new(),
        moves: restored,
        skipped,
        library: library_in_vault(vault_root)?,
    })
}

fn write_undo(vault_root: &Path, moves: &[LibrarianMove]) -> Result<(), String> {
    let journal = vault_root.join(UNDO_FILE);
    if let Some(parent) = journal.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(
        &journal,
        serde_json::to_string(moves).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())
}

fn folder_summaries(target: &Path) -> Result<Vec<NoteSummary>, String> {
    let mut notes = Vec::new();
    for entry in fs::read_dir(target)
        .map_err(|_| "that folder is not in the vault".to_owned())?
        .flatten()
    {
        let path = entry.path();
        if !path.is_file() || !is_markdown(&path) {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        let content = fs::read_to_string(&path).unwrap_or_default();
        notes.push(NoteSummary {
            context: note_context(&content, &name),
            name,
        });
    }
    notes.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(notes)
}

/// Reads only the `context:` frontmatter line (#17) — never the body — which
/// is what keeps this pass affordable over a large folder.
fn note_context(content: &str, fallback: &str) -> String {
    content
        .lines()
        .take_while(|line| *line != "---" || content.starts_with("---"))
        .find_map(|line| line.trim().strip_prefix("context:"))
        .map(|value| value.trim().trim_matches('"').to_owned())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| fallback.trim_end_matches(".md").replace('-', " "))
}

fn existing_categories(vault_root: &Path) -> Vec<String> {
    let mut names = Vec::new();
    for parent in ["Projects", "Areas"] {
        let Ok(entries) = fs::read_dir(vault_root.join(parent)) else {
            continue;
        };
        for entry in entries.flatten() {
            if entry.path().is_dir() {
                names.push(format!("{parent}/{}", entry.file_name().to_string_lossy()));
            }
        }
    }
    names.sort();
    names
}

fn resolve_folder(vault_root: &Path, folder: &str) -> Result<std::path::PathBuf, String> {
    if folder.trim().is_empty() {
        return Err("pick a folder to reorganize".to_owned());
    }
    let candidate = Path::new(folder);
    for component in candidate.components() {
        let std::path::Component::Normal(name) = component else {
            return Err("that folder is not in the vault".to_owned());
        };
        if name.to_string_lossy().starts_with('.') {
            return Err("that folder is not in the vault".to_owned());
        }
    }
    let target = vault_root.join(candidate);
    if !target.is_dir() {
        return Err("that folder is not in the vault".to_owned());
    }
    Ok(target)
}

fn sanitize_segment(value: &str) -> String {
    value
        .chars()
        .map(|character| {
            if character == '/' || character == '\\' || character.is_control() {
                ' '
            } else {
                character
            }
        })
        .collect::<String>()
        .trim()
        .trim_matches('.')
        .to_owned()
}

fn relative_of(vault_root: &Path, path: &Path) -> String {
    path.strip_prefix(vault_root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn is_markdown(path: &Path) -> bool {
    path.extension()
        .is_some_and(|value| value.eq_ignore_ascii_case("md"))
}
