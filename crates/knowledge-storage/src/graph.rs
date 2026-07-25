use std::collections::{HashSet, VecDeque};

use knowledge_domain::RelationType;
use rusqlite::params;
use serde::{Deserialize, Serialize};

use super::{ConceptRecord, KnowledgeStore, StorageError, parse_relation_type};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphEdge {
    pub id: String,
    pub source_concept_id: String,
    pub target_concept_id: String,
    pub relation: RelationType,
    pub confidence_basis_points: u16,
    pub origin_document_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphView {
    pub concepts: Vec<ConceptRecord>,
    pub edges: Vec<GraphEdge>,
    pub truncated: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceBacklink {
    pub document_id: String,
    pub path: String,
    pub title: String,
}

impl KnowledgeStore {
    /// Returns a stable whole-vault graph bounded for desktop rendering.
    pub fn full_graph(&self, max_concepts: usize) -> Result<GraphView, StorageError> {
        if max_concepts == 0 {
            return Ok(GraphView {
                concepts: Vec::new(),
                edges: Vec::new(),
                truncated: true,
            });
        }
        let connection = self.lock()?;
        let mut concept_statement = connection.prepare(
            "SELECT id, normalized_name, display_name, note_path FROM concepts ORDER BY normalized_name LIMIT ?",
        )?;
        let concepts = concept_statement
            .query_map([i64::try_from(max_concepts).unwrap_or(i64::MAX)], |row| {
                Ok(ConceptRecord {
                    id: row.get(0)?,
                    normalized_name: row.get(1)?,
                    display_name: row.get(2)?,
                    note_path: row.get(3)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        let ids = concepts
            .iter()
            .map(|concept| concept.id.as_str())
            .collect::<HashSet<_>>();
        let mut edge_statement = connection.prepare(
            "SELECT id, source_concept_id, target_concept_id, relation_type, confidence_basis_points
             FROM knowledge_edges ORDER BY id",
        )?;
        let raw_edges = edge_statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, u16>(4)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        let mut edges = Vec::new();
        for (id, source, target, relation, confidence) in raw_edges {
            if !ids.contains(source.as_str()) || !ids.contains(target.as_str()) {
                continue;
            }
            let mut evidence = connection.prepare(
                "SELECT origin_document_id FROM edge_evidence WHERE edge_id = ? ORDER BY origin_document_id",
            )?;
            let origin_document_ids = evidence
                .query_map([&id], |row| row.get(0))?
                .collect::<Result<Vec<String>, _>>()?;
            edges.push(GraphEdge {
                id,
                source_concept_id: source,
                target_concept_id: target,
                relation: parse_relation_type(&relation)?,
                confidence_basis_points: confidence,
                origin_document_ids,
            });
        }
        let total: i64 =
            connection.query_row("SELECT COUNT(*) FROM concepts", [], |row| row.get(0))?;
        Ok(GraphView {
            truncated: usize::try_from(total).unwrap_or(usize::MAX) > concepts.len(),
            concepts,
            edges,
        })
    }

    /// Returns a stable, cycle-safe neighborhood limited by depth and concept count.
    pub fn graph_view(
        &self,
        root_concept_id: &str,
        max_depth: usize,
        max_concepts: usize,
    ) -> Result<GraphView, StorageError> {
        if max_concepts == 0 {
            return Ok(GraphView {
                concepts: Vec::new(),
                edges: Vec::new(),
                truncated: true,
            });
        }
        let connection = self.lock()?;
        let root_exists: bool = connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM concepts WHERE id = ?)",
            [root_concept_id],
            |row| row.get(0),
        )?;
        if !root_exists {
            return Err(StorageError::NotFound("concept"));
        }

        let mut queue = VecDeque::from([(root_concept_id.to_owned(), 0_usize)]);
        let mut visited = HashSet::new();
        let mut edge_ids = HashSet::new();
        let mut edges = Vec::new();
        let mut truncated = false;
        while let Some((concept_id, depth)) = queue.pop_front() {
            if visited.contains(&concept_id) {
                continue;
            }
            if visited.len() >= max_concepts {
                truncated = true;
                break;
            }
            visited.insert(concept_id.clone());
            if depth >= max_depth {
                continue;
            }
            for edge in edges_for_concept(&connection, &concept_id)? {
                let neighbor = if edge.source_concept_id == concept_id {
                    edge.target_concept_id.clone()
                } else {
                    edge.source_concept_id.clone()
                };
                if edge_ids.insert(edge.id.clone()) {
                    edges.push(edge);
                }
                if !visited.contains(&neighbor) {
                    queue.push_back((neighbor, depth + 1));
                }
            }
        }

        let mut concepts = Vec::with_capacity(visited.len());
        for id in &visited {
            concepts.push(connection.query_row(
                "SELECT id, normalized_name, display_name, note_path FROM concepts WHERE id = ?",
                [id],
                |row| {
                    Ok(ConceptRecord {
                        id: row.get(0)?,
                        normalized_name: row.get(1)?,
                        display_name: row.get(2)?,
                        note_path: row.get(3)?,
                    })
                },
            )?);
        }
        concepts.sort_by(|left, right| left.normalized_name.cmp(&right.normalized_name));
        edges.retain(|edge| {
            visited.contains(&edge.source_concept_id) && visited.contains(&edge.target_concept_id)
        });
        edges.sort_by(|left, right| left.id.cmp(&right.id));
        Ok(GraphView {
            concepts,
            edges,
            truncated,
        })
    }

    /// Returns the exact source documents that support any edge touching a concept.
    pub fn backlinks_for_concept(
        &self,
        concept_id: &str,
    ) -> Result<Vec<SourceBacklink>, StorageError> {
        let connection = self.lock()?;
        let mut statement = connection.prepare(
            "SELECT DISTINCT d.id, d.path, d.title
             FROM knowledge_edges e
             JOIN edge_evidence x ON x.edge_id = e.id
             JOIN documents d ON d.id = x.origin_document_id
             WHERE e.source_concept_id = ? OR e.target_concept_id = ?
             ORDER BY d.path",
        )?;
        let rows = statement.query_map(params![concept_id, concept_id], |row| {
            Ok(SourceBacklink {
                document_id: row.get(0)?,
                path: row.get(1)?,
                title: row.get(2)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }
}

fn edges_for_concept(
    connection: &rusqlite::Connection,
    concept_id: &str,
) -> Result<Vec<GraphEdge>, StorageError> {
    let mut statement = connection.prepare(
        "SELECT id, source_concept_id, target_concept_id, relation_type, confidence_basis_points
         FROM knowledge_edges
         WHERE source_concept_id = ? OR target_concept_id = ?
         ORDER BY id",
    )?;
    let raw = statement
        .query_map(params![concept_id, concept_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, u16>(4)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    raw.into_iter()
        .map(|(id, source_concept_id, target_concept_id, relation, confidence_basis_points)| {
            let mut evidence = connection.prepare(
                "SELECT origin_document_id FROM edge_evidence WHERE edge_id = ? ORDER BY origin_document_id",
            )?;
            let origin_document_ids = evidence
                .query_map([&id], |row| row.get(0))?
                .collect::<Result<Vec<String>, _>>()?;
            Ok(GraphEdge {
                id,
                source_concept_id,
                target_concept_id,
                relation: parse_relation_type(&relation)?,
                confidence_basis_points,
                origin_document_ids,
            })
        })
        .collect()
}
