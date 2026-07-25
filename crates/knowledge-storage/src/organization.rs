use rusqlite::{OptionalExtension, params};
use serde::{Deserialize, Serialize};

use super::{KnowledgeStore, StorageError, new_id};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrganizationDecision {
    pub facet_id: String,
    pub confidence_basis_points: u16,
    pub pinned: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrganizationAudit {
    pub id: String,
    pub source_id: String,
    pub action: String,
    pub reason: String,
    pub undone: bool,
}

impl KnowledgeStore {
    /// Applies one organization decision set and records enough prior state for atomic undo.
    pub fn apply_organization(
        &self,
        source_id: &str,
        decisions: &[OrganizationDecision],
        reason: &str,
    ) -> Result<OrganizationAudit, StorageError> {
        let mut connection = self.lock()?;
        let transaction = connection.transaction()?;
        let source_exists: bool = transaction.query_row(
            "SELECT EXISTS(SELECT 1 FROM sources WHERE id = ?)",
            [source_id],
            |row| row.get(0),
        )?;
        if !source_exists {
            return Err(StorageError::NotFound("source"));
        }
        let prior = membership_snapshot(&transaction, source_id)?;
        for decision in decisions {
            if decision.confidence_basis_points > 10_000 {
                return Err(StorageError::Constraint(
                    "organization confidence exceeds 10000 basis points".to_owned(),
                ));
            }
            let existing_pinned = transaction
                .query_row(
                    "SELECT pinned FROM facet_memberships WHERE source_id = ? AND facet_id = ?",
                    params![source_id, decision.facet_id],
                    |row| row.get::<_, bool>(0),
                )
                .optional()?
                .unwrap_or(false);
            if !existing_pinned || decision.pinned {
                transaction.execute(
                    "INSERT INTO facet_memberships(source_id, facet_id, pinned, confidence_basis_points)
                     VALUES (?, ?, ?, ?)
                     ON CONFLICT(source_id, facet_id) DO UPDATE SET
                       pinned = excluded.pinned,
                       confidence_basis_points = excluded.confidence_basis_points",
                    params![
                        source_id,
                        decision.facet_id,
                        decision.pinned,
                        decision.confidence_basis_points
                    ],
                )?;
            }
        }
        let next = membership_snapshot(&transaction, source_id)?;
        let id = new_id();
        transaction.execute(
            "INSERT INTO organization_audit(id, source_id, action, prior_state_json, next_state_json, reason_json) VALUES (?, ?, 'APPLY', ?, ?, ?)",
            params![
                id,
                source_id,
                serde_json::to_string(&prior).map_err(serialization_error)?,
                serde_json::to_string(&next).map_err(serialization_error)?,
                serde_json::to_string(reason).map_err(serialization_error)?
            ],
        )?;
        transaction.commit()?;
        Ok(OrganizationAudit {
            id,
            source_id: source_id.to_owned(),
            action: "APPLY".to_owned(),
            reason: reason.to_owned(),
            undone: false,
        })
    }

    /// Restores the exact membership snapshot from before an organization audit entry.
    pub fn undo_organization(&self, audit_id: &str) -> Result<(), StorageError> {
        let mut connection = self.lock()?;
        let transaction = connection.transaction()?;
        let row = transaction
            .query_row(
                "SELECT source_id, prior_state_json, undone_at IS NOT NULL FROM organization_audit WHERE id = ?",
                [audit_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, bool>(2)?,
                    ))
                },
            )
            .optional()?
            .ok_or(StorageError::NotFound("organization audit"))?;
        if row.2 {
            return Err(StorageError::Constraint(
                "organization audit is already undone".to_owned(),
            ));
        }
        let prior: Vec<OrganizationDecision> =
            serde_json::from_str(&row.1).map_err(serialization_error)?;
        transaction.execute(
            "DELETE FROM facet_memberships WHERE source_id = ?",
            [&row.0],
        )?;
        for decision in prior {
            transaction.execute(
                "INSERT INTO facet_memberships(source_id, facet_id, pinned, confidence_basis_points) VALUES (?, ?, ?, ?)",
                params![
                    row.0,
                    decision.facet_id,
                    decision.pinned,
                    decision.confidence_basis_points
                ],
            )?;
        }
        transaction.execute(
            "UPDATE organization_audit SET undone_at = CURRENT_TIMESTAMP WHERE id = ?",
            [audit_id],
        )?;
        transaction.commit()?;
        Ok(())
    }

    /// Returns organization audit entries in creation order without raw source content.
    pub fn organization_history(
        &self,
        source_id: &str,
    ) -> Result<Vec<OrganizationAudit>, StorageError> {
        let connection = self.lock()?;
        let mut statement = connection.prepare(
            "SELECT id, source_id, action, reason_json, undone_at IS NOT NULL
             FROM organization_audit WHERE source_id = ? ORDER BY created_at, id",
        )?;
        let rows = statement.query_map([source_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, bool>(4)?,
            ))
        })?;
        rows.map(|row| {
            let (id, source_id, action, reason_json, undone) = row?;
            Ok(OrganizationAudit {
                id,
                source_id,
                action,
                reason: serde_json::from_str(&reason_json).map_err(serialization_error)?,
                undone,
            })
        })
        .collect()
    }
}

fn membership_snapshot(
    connection: &rusqlite::Connection,
    source_id: &str,
) -> Result<Vec<OrganizationDecision>, StorageError> {
    let mut statement = connection.prepare(
        "SELECT facet_id, confidence_basis_points, pinned FROM facet_memberships WHERE source_id = ? ORDER BY facet_id",
    )?;
    let rows = statement.query_map([source_id], |row| {
        Ok(OrganizationDecision {
            facet_id: row.get(0)?,
            confidence_basis_points: row.get(1)?,
            pinned: row.get(2)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

#[allow(
    clippy::needless_pass_by_value,
    reason = "map_err adapters receive owned serde_json::Error values"
)]
fn serialization_error(error: serde_json::Error) -> StorageError {
    StorageError::Database(error.to_string())
}
