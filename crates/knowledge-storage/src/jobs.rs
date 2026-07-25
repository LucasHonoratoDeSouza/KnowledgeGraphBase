use rusqlite::{OptionalExtension, params};
use serde::{Deserialize, Serialize};

use super::{KnowledgeStore, StorageError, new_id};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum JobState {
    Queued,
    Running,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IngestionJob {
    pub id: String,
    pub source_id: String,
    pub idempotency_key: String,
    pub state: JobState,
    pub attempt: u8,
    pub lease_owner: Option<String>,
    pub lease_expires_at: Option<i64>,
    pub error: Option<String>,
}

impl KnowledgeStore {
    /// Enqueues one source operation or returns the existing job for its idempotency key.
    pub fn enqueue_job(
        &self,
        source_id: &str,
        idempotency_key: &str,
    ) -> Result<IngestionJob, StorageError> {
        let connection = self.lock()?;
        connection.execute(
            "INSERT OR IGNORE INTO ingestion_jobs(id, source_id, idempotency_key, state) VALUES (?, ?, ?, 'QUEUED')",
            params![new_id(), source_id, idempotency_key],
        )?;
        job_by_key(&connection, idempotency_key)?.ok_or(StorageError::NotFound("ingestion job"))
    }

    /// Leases the oldest eligible job while enforcing two active jobs per vault.
    pub fn lease_next_job(
        &self,
        worker: &str,
        now_epoch_seconds: i64,
        lease_seconds: i64,
    ) -> Result<Option<IngestionJob>, StorageError> {
        if worker.trim().is_empty() || lease_seconds <= 0 {
            return Err(StorageError::Constraint(
                "worker and positive lease duration are required".to_owned(),
            ));
        }
        let mut connection = self.lock()?;
        let transaction = connection.transaction()?;
        let active: i64 = transaction.query_row(
            "SELECT COUNT(*) FROM ingestion_jobs WHERE state = 'RUNNING' AND lease_expires_at > ?",
            [now_epoch_seconds],
            |row| row.get(0),
        )?;
        if active >= 2 {
            transaction.commit()?;
            return Ok(None);
        }
        let id = transaction
            .query_row(
                "SELECT id FROM ingestion_jobs
                 WHERE state = 'QUEUED' OR (state = 'RUNNING' AND lease_expires_at <= ?)
                 ORDER BY created_at, id LIMIT 1",
                [now_epoch_seconds],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        let Some(id) = id else {
            transaction.commit()?;
            return Ok(None);
        };
        transaction.execute(
            "UPDATE ingestion_jobs SET state = 'RUNNING', attempt = attempt + 1,
             lease_owner = ?, lease_expires_at = ?, error = NULL, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?",
            params![worker, now_epoch_seconds + lease_seconds, id],
        )?;
        let job = job_by_id(&transaction, &id)?.ok_or(StorageError::NotFound("ingestion job"))?;
        transaction.commit()?;
        Ok(Some(job))
    }

    /// Marks a leased job completed only for its current owner.
    pub fn complete_job(&self, id: &str, worker: &str) -> Result<(), StorageError> {
        let affected = self.lock()?.execute(
            "UPDATE ingestion_jobs SET state = 'COMPLETED', lease_owner = NULL, lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND state = 'RUNNING' AND lease_owner = ?",
            params![id, worker],
        )?;
        if affected == 1 {
            Ok(())
        } else {
            Err(StorageError::Constraint(
                "job is not leased by this worker".to_owned(),
            ))
        }
    }

    /// Records a retryable failure and queues it again until the third attempt.
    pub fn fail_job(&self, id: &str, worker: &str, error: &str) -> Result<JobState, StorageError> {
        let mut connection = self.lock()?;
        let transaction = connection.transaction()?;
        let job = job_by_id(&transaction, id)?.ok_or(StorageError::NotFound("ingestion job"))?;
        if job.state != JobState::Running || job.lease_owner.as_deref() != Some(worker) {
            return Err(StorageError::Constraint(
                "job is not leased by this worker".to_owned(),
            ));
        }
        let next = if job.attempt >= 3 {
            JobState::Failed
        } else {
            JobState::Queued
        };
        transaction.execute(
            "UPDATE ingestion_jobs SET state = ?, lease_owner = NULL, lease_expires_at = NULL, error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            params![job_state(next), error, id],
        )?;
        transaction.commit()?;
        Ok(next)
    }

    /// Cancels queued or running work without allowing terminal jobs to re-enter processing.
    pub fn cancel_job(&self, id: &str) -> Result<(), StorageError> {
        let affected = self.lock()?.execute(
            "UPDATE ingestion_jobs SET state = 'CANCELLED', lease_owner = NULL, lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND state IN ('QUEUED', 'RUNNING')",
            [id],
        )?;
        if affected == 1 {
            Ok(())
        } else {
            Err(StorageError::Constraint(
                "only queued or running jobs can be cancelled".to_owned(),
            ))
        }
    }

    pub fn job(&self, id: &str) -> Result<Option<IngestionJob>, StorageError> {
        let connection = self.lock()?;
        job_by_id(&connection, id)
    }
}

fn job_state(state: JobState) -> &'static str {
    match state {
        JobState::Queued => "QUEUED",
        JobState::Running => "RUNNING",
        JobState::Completed => "COMPLETED",
        JobState::Failed => "FAILED",
        JobState::Cancelled => "CANCELLED",
    }
}

fn parse_job_state(value: &str) -> Result<JobState, StorageError> {
    match value {
        "QUEUED" => Ok(JobState::Queued),
        "RUNNING" => Ok(JobState::Running),
        "COMPLETED" => Ok(JobState::Completed),
        "FAILED" => Ok(JobState::Failed),
        "CANCELLED" => Ok(JobState::Cancelled),
        _ => Err(StorageError::InvalidEnum(value.to_owned())),
    }
}

fn job_by_key(
    connection: &rusqlite::Connection,
    key: &str,
) -> Result<Option<IngestionJob>, StorageError> {
    let id = connection
        .query_row(
            "SELECT id FROM ingestion_jobs WHERE idempotency_key = ?",
            [key],
            |row| row.get::<_, String>(0),
        )
        .optional()?;
    id.map(|id| job_by_id(connection, &id).map(Option::unwrap))
        .transpose()
}

fn job_by_id(
    connection: &rusqlite::Connection,
    id: &str,
) -> Result<Option<IngestionJob>, StorageError> {
    let raw = connection
        .query_row(
            "SELECT id, source_id, idempotency_key, state, attempt, lease_owner, lease_expires_at, error FROM ingestion_jobs WHERE id = ?",
            [id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, u8>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, Option<i64>>(6)?,
                    row.get::<_, Option<String>>(7)?,
                ))
            },
        )
        .optional()?;
    raw.map(
        |(id, source_id, idempotency_key, state, attempt, lease_owner, lease_expires_at, error)| {
            Ok(IngestionJob {
                id,
                source_id,
                idempotency_key,
                state: parse_job_state(&state)?,
                attempt,
                lease_owner,
                lease_expires_at,
                error,
            })
        },
    )
    .transpose()
}
