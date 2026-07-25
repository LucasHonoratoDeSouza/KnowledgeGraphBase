use std::{
    fs,
    path::{Component, Path, PathBuf},
    sync::Mutex,
};

use serde::Serialize;
use thiserror::Error;

#[derive(Clone, Debug, Error, Eq, PartialEq)]
pub enum EditorError {
    #[error("note path must stay inside the granted vault")]
    UnsafePath,
    #[error("only Markdown notes can be opened or saved")]
    NotMarkdown,
    #[error("note is not valid UTF-8")]
    InvalidUtf8,
    #[error("vault path must be an existing directory")]
    InvalidVault,
    #[error("workspace is not open")]
    WorkspaceNotOpen,
    #[error("note I/O failed: {0}")]
    Io(String),
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownDiagnostic {
    pub code: &'static str,
    pub message: &'static str,
    pub line: usize,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteDocument {
    pub path: String,
    pub content: String,
    pub diagnostics: Vec<MarkdownDiagnostic>,
}

#[derive(Clone, Debug)]
pub struct VaultEditor {
    root: PathBuf,
}

#[derive(Debug, Default)]
pub struct DocumentCommandState {
    editor: Mutex<Option<VaultEditor>>,
}

impl DocumentCommandState {
    /// Grants document commands one canonical workspace root.
    ///
    /// # Errors
    ///
    /// Returns [`EditorError::InvalidVault`] for a missing/non-directory path.
    pub fn workspace_open(&self, root: impl AsRef<Path>) -> Result<(), EditorError> {
        let editor = VaultEditor::new(root)?;
        *self
            .editor
            .lock()
            .map_err(|error| EditorError::Io(error.to_string()))? = Some(editor);
        Ok(())
    }

    /// Opens one note through the currently granted workspace.
    ///
    /// # Errors
    ///
    /// Fails closed before a workspace is open and propagates editor validation/I/O errors.
    pub fn document_open(&self, relative: &str) -> Result<NoteDocument, EditorError> {
        self.editor
            .lock()
            .map_err(|error| EditorError::Io(error.to_string()))?
            .as_ref()
            .ok_or(EditorError::WorkspaceNotOpen)?
            .open(relative)
    }

    /// Saves one note through the currently granted workspace.
    ///
    /// # Errors
    ///
    /// Fails closed before a workspace is open and propagates editor validation/I/O errors.
    pub fn document_save(
        &self,
        relative: &str,
        content: &str,
    ) -> Result<NoteDocument, EditorError> {
        self.editor
            .lock()
            .map_err(|error| EditorError::Io(error.to_string()))?
            .as_ref()
            .ok_or(EditorError::WorkspaceNotOpen)?
            .save(relative, content)
    }
}

impl VaultEditor {
    /// Opens an editor restricted to one explicitly granted vault root.
    ///
    /// # Errors
    ///
    /// Returns [`EditorError::InvalidVault`] unless the root is an existing directory.
    pub fn new(root: impl AsRef<Path>) -> Result<Self, EditorError> {
        let root = root
            .as_ref()
            .canonicalize()
            .map_err(|_| EditorError::InvalidVault)?;
        if !root.is_dir() {
            return Err(EditorError::InvalidVault);
        }
        Ok(Self { root })
    }

    /// Reads an ordinary UTF-8 Markdown note without normalizing its contents.
    ///
    /// # Errors
    ///
    /// Rejects paths outside the vault, non-Markdown paths, invalid UTF-8, and I/O failures.
    pub fn open(&self, relative: &str) -> Result<NoteDocument, EditorError> {
        let path = self.resolve_existing(relative)?;
        let bytes = fs::read(path).map_err(|error| EditorError::Io(error.to_string()))?;
        let content = String::from_utf8(bytes).map_err(|_| EditorError::InvalidUtf8)?;
        Ok(NoteDocument {
            path: relative.to_owned(),
            diagnostics: inspect_markdown(&content),
            content,
        })
    }

    /// Writes exact UTF-8 Markdown bytes inside the granted vault.
    ///
    /// Malformed metadata is diagnosed but deliberately preserved.
    ///
    /// # Errors
    ///
    /// Rejects paths outside the vault, non-Markdown paths, and I/O failures.
    pub fn save(&self, relative: &str, content: &str) -> Result<NoteDocument, EditorError> {
        let path = self.resolve_for_save(relative)?;
        fs::write(path, content.as_bytes()).map_err(|error| EditorError::Io(error.to_string()))?;
        Ok(NoteDocument {
            path: relative.to_owned(),
            diagnostics: inspect_markdown(content),
            content: content.to_owned(),
        })
    }

    fn validate_relative(relative: &str) -> Result<PathBuf, EditorError> {
        let relative = PathBuf::from(relative);
        if relative.is_absolute()
            || relative
                .components()
                .any(|component| !matches!(component, Component::Normal(_)))
        {
            return Err(EditorError::UnsafePath);
        }
        if relative.extension().and_then(std::ffi::OsStr::to_str) != Some("md") {
            return Err(EditorError::NotMarkdown);
        }
        Ok(relative)
    }

    fn resolve_existing(&self, relative: &str) -> Result<PathBuf, EditorError> {
        let relative = Self::validate_relative(relative)?;
        let path = self
            .root
            .join(relative)
            .canonicalize()
            .map_err(|error| EditorError::Io(error.to_string()))?;
        if !path.starts_with(&self.root) {
            return Err(EditorError::UnsafePath);
        }
        Ok(path)
    }

    fn resolve_for_save(&self, relative: &str) -> Result<PathBuf, EditorError> {
        let relative = Self::validate_relative(relative)?;
        let path = self.root.join(relative);
        let parent = path.parent().ok_or(EditorError::UnsafePath)?;
        let canonical_parent = parent
            .canonicalize()
            .map_err(|error| EditorError::Io(error.to_string()))?;
        if !canonical_parent.starts_with(&self.root) {
            return Err(EditorError::UnsafePath);
        }
        if path.exists() {
            let canonical = path
                .canonicalize()
                .map_err(|error| EditorError::Io(error.to_string()))?;
            if !canonical.starts_with(&self.root) {
                return Err(EditorError::UnsafePath);
            }
        }
        Ok(path)
    }
}

#[must_use]
pub fn inspect_markdown(content: &str) -> Vec<MarkdownDiagnostic> {
    let lines: Vec<&str> = content.lines().collect();
    let mut diagnostics = Vec::new();

    if lines.first() == Some(&"---") && !lines.iter().skip(1).any(|line| *line == "---") {
        diagnostics.push(MarkdownDiagnostic {
            code: "malformed_frontmatter",
            message: "Frontmatter is not closed",
            line: 1,
        });
    }

    for (index, line) in lines.iter().enumerate() {
        let mut remaining = *line;
        while let Some(open) = remaining.find("[[") {
            let after_open = &remaining[open + 2..];
            if let Some(close) = after_open.find("]]") {
                if after_open[..close].trim().is_empty() {
                    diagnostics.push(MarkdownDiagnostic {
                        code: "malformed_wiki_link",
                        message: "Wiki link target is empty",
                        line: index + 1,
                    });
                }
                remaining = &after_open[close + 2..];
            } else {
                diagnostics.push(MarkdownDiagnostic {
                    code: "malformed_wiki_link",
                    message: "Wiki link is not closed",
                    line: index + 1,
                });
                break;
            }
        }
    }

    diagnostics
}
