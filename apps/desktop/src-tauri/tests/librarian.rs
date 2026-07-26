use std::{fs, path::Path, sync::Mutex};

use knowledge_ai::{AiError, AiPort, AiRequest, AiResponse, TokenUsage};
use knowledge_os_desktop_lib::librarian::{
    MINIMUM_NOTES, SUGGESTION_THRESHOLD, crowded_folders, reorganize_folder,
    undo_last_reorganization,
};
use tempfile::{TempDir, tempdir};

/// Records what the Librarian actually sent, so the "mini-summaries only,
/// never full bodies" requirement is asserted on the request, not assumed.
struct FakePlanner {
    plan: String,
    seen: Mutex<Vec<String>>,
}

impl FakePlanner {
    fn new(plan: &str) -> Self {
        Self {
            plan: plan.to_owned(),
            seen: Mutex::new(Vec::new()),
        }
    }
}

impl AiPort for FakePlanner {
    fn complete(&self, request: &AiRequest) -> Result<AiResponse, AiError> {
        self.seen.lock().unwrap().push(request.input.clone());
        Ok(AiResponse {
            content: self.plan.clone(),
            usage: TokenUsage::default(),
        })
    }
}

fn note(vault: &Path, path: &str, context: &str, body: &str) {
    let full = vault.join(path);
    fs::create_dir_all(full.parent().unwrap()).unwrap();
    fs::write(
        full,
        format!("---\ntitle: \"{path}\"\ncontext: \"{context}\"\n---\n\n# {path}\n\n{body}\n"),
    )
    .unwrap();
}

fn crowded_vault(count: usize) -> TempDir {
    let vault = tempdir().unwrap();
    for index in 0..count {
        note(
            vault.path(),
            &format!("Projects/ML/note-{index}.md"),
            &format!("Mini summary number {index}."),
            "A much longer body that the Librarian must never send to the model.",
        );
    }
    vault
}

const PLAN: &str = r#"{"folders":[
  {"name":"Optimization","files":["note-0.md","note-1.md"],"reason":"training dynamics"},
  {"name":"Evaluation","files":["note-2.md"],"reason":"measuring quality"},
  {"name":"Ghost","files":["missing.md"],"reason":"file is gone"}
]}"#;

#[test]
fn reorganizing_moves_files_into_the_proposed_subfolders_of_that_folder_only() {
    let vault = crowded_vault(10);
    fs::create_dir_all(vault.path().join("Areas/Health")).unwrap();
    let planner = FakePlanner::new(PLAN);

    let outcome = reorganize_folder(vault.path(), "Projects/ML", &planner, "model-x").unwrap();

    assert_eq!(outcome.folder, "Projects/ML");
    assert_eq!(outcome.moves.len(), 3);
    assert!(
        vault
            .path()
            .join("Projects/ML/Optimization/note-0.md")
            .is_file()
    );
    assert!(
        vault
            .path()
            .join("Projects/ML/Evaluation/note-2.md")
            .is_file()
    );
    assert!(!vault.path().join("Projects/ML/note-0.md").exists());
    // Untouched notes stay exactly where they were, and no folder outside the
    // target is created or changed.
    assert!(vault.path().join("Projects/ML/note-9.md").is_file());
    assert!(vault.path().join("Areas/Health").is_dir());
    assert!(!vault.path().join("Projects/Optimization").exists());
    assert_eq!(outcome.skipped, ["missing.md"]);
}

#[test]
fn the_model_only_ever_sees_mini_summaries_and_file_names() {
    let vault = crowded_vault(9);
    let planner = FakePlanner::new(r#"{"folders":[]}"#);

    reorganize_folder(vault.path(), "Projects/ML", &planner, "model-x").unwrap();

    let sent = planner.seen.lock().unwrap().first().cloned().unwrap();
    assert!(sent.contains("note-0.md — Mini summary number 0."));
    assert!(
        !sent.contains("A much longer body"),
        "note bodies must never reach the model: {sent}"
    );
}

#[test]
fn undo_restores_every_moved_file_in_one_action() {
    let vault = crowded_vault(10);
    let planner = FakePlanner::new(PLAN);
    reorganize_folder(vault.path(), "Projects/ML", &planner, "model-x").unwrap();

    let undone = undo_last_reorganization(vault.path()).unwrap();

    assert_eq!(undone.moves.len(), 3);
    assert!(vault.path().join("Projects/ML/note-0.md").is_file());
    assert!(vault.path().join("Projects/ML/note-2.md").is_file());
    assert!(!vault.path().join("Projects/ML/Optimization").exists());
    assert!(undo_last_reorganization(vault.path()).is_err());
}

#[test]
fn a_small_folder_declines_without_calling_the_model() {
    let vault = crowded_vault(MINIMUM_NOTES - 1);
    let planner = FakePlanner::new(PLAN);

    let refused = reorganize_folder(vault.path(), "Projects/ML", &planner, "model-x");

    assert!(refused.is_err());
    assert!(
        refused.unwrap_err().contains(&MINIMUM_NOTES.to_string()),
        "the refusal states the threshold"
    );
    assert!(
        planner.seen.lock().unwrap().is_empty(),
        "no model call was made"
    );
}

#[test]
fn unsafe_or_unknown_folders_are_refused() {
    let vault = crowded_vault(10);
    let planner = FakePlanner::new(PLAN);

    for folder in ["../escape", ".knowledge-os", "Projects/Missing", ""] {
        assert!(
            reorganize_folder(vault.path(), folder, &planner, "model-x").is_err(),
            "{folder} must be refused"
        );
    }
    assert!(planner.seen.lock().unwrap().is_empty());
}

#[test]
fn crowded_folders_are_suggested_only_past_the_threshold() {
    let vault = crowded_vault(SUGGESTION_THRESHOLD);
    for index in 0..3 {
        note(
            vault.path(),
            &format!("Areas/Quiet/note-{index}.md"),
            "A quiet note.",
            "Body",
        );
    }

    let suggestions = crowded_folders(vault.path(), SUGGESTION_THRESHOLD);

    assert_eq!(suggestions, ["Projects/ML"]);
}
