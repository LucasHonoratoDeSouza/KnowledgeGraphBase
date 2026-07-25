use std::{
    collections::HashSet,
    fs::{self, OpenOptions},
    io::Write as _,
    path::{Component, Path, PathBuf},
};

use rusqlite::params;

use super::{KnowledgeStore, StorageError, new_id};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum JournalFault {
    None,
    AfterPrepared,
    AfterPublished,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RecoveryReport {
    pub completed: usize,
    pub cleaned_orphans: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TrashRecord {
    pub original_path: String,
    pub trash_path: PathBuf,
}

impl KnowledgeStore {
    /// Publishes a Markdown file through the recoverable vault journal.
    ///
    /// # Errors
    ///
    /// Rejects absolute/traversing/non-Markdown paths and reports filesystem, journal, or injected
    /// crash-boundary failures without deleting the staged bytes.
    pub fn publish_markdown(
        &self,
        vault_root: &Path,
        relative_path: &str,
        content: &[u8],
        fault: JournalFault,
    ) -> Result<(), StorageError> {
        let relative = validate_relative_markdown(relative_path)?;
        let metadata = vault_root.join(".knowledge-os");
        let staging_directory = metadata.join("staging");
        fs::create_dir_all(&staging_directory).map_err(io_error)?;
        let operation_id = new_id();
        let staging = staging_directory.join(format!("{operation_id}.stage"));
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        let mut file = options.open(&staging).map_err(io_error)?;
        file.write_all(content).map_err(io_error)?;
        file.sync_all().map_err(io_error)?;

        self.lock()?.execute(
            "INSERT INTO write_journal(operation_id, relative_path, staging_path, state) VALUES (?, ?, ?, 'PREPARED')",
            params![operation_id, relative_path, staging.to_string_lossy()],
        )?;
        if fault == JournalFault::AfterPrepared {
            return Err(StorageError::Database(
                "injected fault after journal preparation".to_owned(),
            ));
        }

        let destination = vault_root.join(relative);
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent).map_err(io_error)?;
        }
        fs::rename(&staging, &destination).map_err(io_error)?;
        self.lock()?.execute(
            "UPDATE write_journal SET state = 'PUBLISHED' WHERE operation_id = ?",
            [&operation_id],
        )?;
        if fault == JournalFault::AfterPublished {
            return Err(StorageError::Database(
                "injected fault after file publication".to_owned(),
            ));
        }
        self.lock()?.execute(
            "DELETE FROM write_journal WHERE operation_id = ?",
            [&operation_id],
        )?;
        Ok(())
    }

    /// Completes or cleans all interrupted vault file publications.
    ///
    /// # Errors
    ///
    /// Returns a typed error when a journal row is unsafe or recovery cannot publish/remove bytes.
    pub fn recover_writes(&self, vault_root: &Path) -> Result<RecoveryReport, StorageError> {
        let rows = {
            let connection = self.lock()?;
            let mut statement = connection.prepare(
                "SELECT operation_id, relative_path, staging_path, state FROM write_journal ORDER BY operation_id",
            )?;
            let rows = statement.query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            })?;
            rows.collect::<Result<Vec<_>, _>>()?
        };
        let mut referenced = HashSet::new();
        let mut completed = 0;
        for (operation_id, relative_path, staging_path, state) in rows {
            let relative = validate_relative_markdown(&relative_path)?;
            let staging = PathBuf::from(staging_path);
            referenced.insert(staging.clone());
            let destination = vault_root.join(relative);
            match state.as_str() {
                "PREPARED" if staging.exists() && !destination.exists() => {
                    if let Some(parent) = destination.parent() {
                        fs::create_dir_all(parent).map_err(io_error)?;
                    }
                    fs::rename(&staging, &destination).map_err(io_error)?;
                    completed += 1;
                }
                "PREPARED" if destination.exists() => {
                    if staging.exists() {
                        fs::remove_file(&staging).map_err(io_error)?;
                    }
                    completed += 1;
                }
                "PUBLISHED" => {
                    if staging.exists() {
                        fs::remove_file(&staging).map_err(io_error)?;
                    }
                    completed += 1;
                }
                "PREPARED" => {}
                _ => {
                    return Err(StorageError::Database(format!(
                        "invalid write journal state: {state}"
                    )));
                }
            }
            self.lock()?.execute(
                "DELETE FROM write_journal WHERE operation_id = ?",
                [operation_id],
            )?;
        }

        let staging_directory = vault_root.join(".knowledge-os/staging");
        let mut cleaned_orphans = 0;
        if staging_directory.exists() {
            for entry in fs::read_dir(staging_directory).map_err(io_error)? {
                let path = entry.map_err(io_error)?.path();
                if path
                    .extension()
                    .is_some_and(|extension| extension == "stage")
                    && !referenced.contains(&path)
                {
                    fs::remove_file(path).map_err(io_error)?;
                    cleaned_orphans += 1;
                }
            }
        }
        Ok(RecoveryReport {
            completed,
            cleaned_orphans,
        })
    }

    /// Moves one user-owned vault file to recoverable local trash.
    ///
    /// # Errors
    ///
    /// Rejects unsafe paths and returns not-found or filesystem errors without touching indexes.
    pub fn move_to_trash(
        &self,
        vault_root: &Path,
        relative_path: &str,
    ) -> Result<TrashRecord, StorageError> {
        let relative = validate_relative_markdown(relative_path)?;
        let source = vault_root.join(relative);
        if !source.is_file() {
            return Err(StorageError::NotFound("vault file"));
        }
        let trash_directory = vault_root.join(".knowledge-os/trash");
        fs::create_dir_all(&trash_directory).map_err(io_error)?;
        let file_name = source
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| StorageError::Database("vault filename is not UTF-8".to_owned()))?;
        let trash_path = trash_directory.join(format!("{}-{file_name}", new_id()));
        fs::rename(&source, &trash_path).map_err(io_error)?;
        Ok(TrashRecord {
            original_path: relative_path.to_owned(),
            trash_path,
        })
    }
}

fn validate_relative_markdown(path: &str) -> Result<&Path, StorageError> {
    let path = Path::new(path);
    if path.is_absolute()
        || path.extension().and_then(|extension| extension.to_str()) != Some("md")
        || path.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(StorageError::Constraint(
            "vault path must be a relative Markdown path".to_owned(),
        ));
    }
    Ok(path)
}

#[allow(
    clippy::needless_pass_by_value,
    reason = "map_err adapters receive owned std::io::Error values"
)]
fn io_error(error: std::io::Error) -> StorageError {
    StorageError::Database(error.to_string())
}
