use std::fs;

use knowledge_os_desktop_lib::editor::{
    DocumentCommandState, EditorError, VaultEditor, inspect_markdown,
};
use tempfile::tempdir;

#[test]
fn reads_utf8_markdown_without_normalizing_bytes() {
    let vault = tempdir().unwrap();
    let content = "# Café\n\nConhecimento em português. 🧠\n";
    fs::write(vault.path().join("unicode.md"), content).unwrap();
    let editor = VaultEditor::new(vault.path()).unwrap();

    let note = editor.open("unicode.md").unwrap();

    assert_eq!(note.content, content);
    assert_eq!(note.path, "unicode.md");
}

#[test]
fn valid_frontmatter_and_wiki_links_round_trip_exactly() {
    let vault = tempdir().unwrap();
    let content = "---\ntitle: Alpha\ntags: [one, two]\n---\n# Alpha\nSee [[Beta Note|Beta]].\n";
    let editor = VaultEditor::new(vault.path()).unwrap();

    editor.save("alpha.md", content).unwrap();
    let reopened = editor.open("alpha.md").unwrap();

    assert_eq!(reopened.content, content);
    assert!(reopened.diagnostics.is_empty());
    assert_eq!(
        fs::read(vault.path().join("alpha.md")).unwrap(),
        content.as_bytes()
    );
}

#[test]
fn ordinary_markdown_has_no_metadata_diagnostics() {
    assert!(inspect_markdown("# Note\n\nPlain content.").is_empty());
}

#[test]
fn unterminated_frontmatter_returns_a_typed_diagnostic_and_all_content() {
    let content = "---\ntitle: Broken\n# Still user content\n";

    let diagnostics = inspect_markdown(content);

    assert_eq!(diagnostics[0].code, "malformed_frontmatter");
    assert_eq!(diagnostics[0].line, 1);
    assert_eq!(content, "---\ntitle: Broken\n# Still user content\n");
}

#[test]
fn unterminated_wiki_link_returns_a_typed_line_diagnostic() {
    let diagnostics = inspect_markdown("# Links\nSee [[unfinished link\n");

    assert_eq!(diagnostics[0].code, "malformed_wiki_link");
    assert_eq!(diagnostics[0].line, 2);
}

#[test]
fn malformed_metadata_can_be_saved_and_reopened_without_data_loss() {
    let vault = tempdir().unwrap();
    let editor = VaultEditor::new(vault.path()).unwrap();
    let content = "---\ntitle: Broken\n[[unfinished\n";

    let saved = editor.save("broken.md", content).unwrap();
    let reopened = editor.open("broken.md").unwrap();

    assert_eq!(saved.content, content);
    assert_eq!(reopened.content, content);
    assert_eq!(reopened.diagnostics.len(), 2);
}

#[test]
fn rejects_parent_directory_traversal_before_reading() {
    let vault = tempdir().unwrap();
    let editor = VaultEditor::new(vault.path()).unwrap();

    assert_eq!(editor.open("../outside.md"), Err(EditorError::UnsafePath));
}

#[test]
fn rejects_absolute_paths_before_reading() {
    let vault = tempdir().unwrap();
    let editor = VaultEditor::new(vault.path()).unwrap();

    assert_eq!(editor.open("/tmp/outside.md"), Err(EditorError::UnsafePath));
}

#[test]
fn rejects_non_markdown_files() {
    let vault = tempdir().unwrap();
    let editor = VaultEditor::new(vault.path()).unwrap();

    assert_eq!(
        editor.save("secret.txt", "text"),
        Err(EditorError::NotMarkdown)
    );
}

#[test]
fn creates_a_new_markdown_note_inside_an_existing_vault_folder() {
    let vault = tempdir().unwrap();
    fs::create_dir(vault.path().join("notes")).unwrap();
    let editor = VaultEditor::new(vault.path()).unwrap();

    editor.save("notes/new.md", "# New\n").unwrap();

    assert_eq!(
        fs::read_to_string(vault.path().join("notes/new.md")).unwrap(),
        "# New\n"
    );
}

#[test]
fn invalid_utf8_returns_a_typed_error_without_rewriting_the_file() {
    let vault = tempdir().unwrap();
    let bytes = [0xff, 0xfe, 0xfd];
    fs::write(vault.path().join("invalid.md"), bytes).unwrap();
    let editor = VaultEditor::new(vault.path()).unwrap();

    assert_eq!(editor.open("invalid.md"), Err(EditorError::InvalidUtf8));
    assert_eq!(fs::read(vault.path().join("invalid.md")).unwrap(), bytes);
}

#[test]
fn document_commands_fail_closed_before_a_workspace_is_opened() {
    let state = DocumentCommandState::default();

    assert_eq!(
        state.document_open("note.md"),
        Err(EditorError::WorkspaceNotOpen)
    );
}

#[test]
fn workspace_open_scopes_document_commands_to_that_vault() {
    let vault = tempdir().unwrap();
    fs::write(vault.path().join("note.md"), "# Scoped\n").unwrap();
    let state = DocumentCommandState::default();
    state.workspace_open(vault.path()).unwrap();

    assert_eq!(
        state.document_open("note.md").unwrap().content,
        "# Scoped\n"
    );
    assert_eq!(
        state.document_open("../outside.md"),
        Err(EditorError::UnsafePath)
    );
}

#[test]
fn document_save_command_returns_diagnostics_and_exact_saved_content() {
    let vault = tempdir().unwrap();
    let state = DocumentCommandState::default();
    state.workspace_open(vault.path()).unwrap();

    let saved = state.document_save("broken.md", "[[unfinished\n").unwrap();

    assert_eq!(saved.content, "[[unfinished\n");
    assert_eq!(saved.diagnostics[0].code, "malformed_wiki_link");
}
