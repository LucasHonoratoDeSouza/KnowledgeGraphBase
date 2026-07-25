use knowledge_domain::SourceKind;
use knowledge_storage::{
    FacetDraft, KnowledgeStore, OrganizationDecision, SourceDraft, StorageError,
};

fn seeded_extra_source(store: &KnowledgeStore, title: &str) -> String {
    store
        .create_source(&SourceDraft {
            kind: SourceKind::Note,
            original_uri: title.to_owned(),
            normalized_uri: title.to_owned(),
            content_hash: "hash-2".to_owned(),
            pipeline_version: "v1".to_owned(),
            title: title.to_owned(),
        })
        .unwrap()
        .id
}

fn seeded() -> (KnowledgeStore, String, String, String) {
    let store = KnowledgeStore::open_in_memory().unwrap();
    let source = store
        .create_source(&SourceDraft {
            kind: SourceKind::Note,
            original_uri: "meeting".to_owned(),
            normalized_uri: "meeting".to_owned(),
            content_hash: "hash".to_owned(),
            pipeline_version: "v1".to_owned(),
            title: "Meeting".to_owned(),
        })
        .unwrap();
    let project = store
        .upsert_facet(&FacetDraft::new("project", "Knowledge OS"))
        .unwrap();
    let area = store
        .upsert_facet(&FacetDraft::new("area", "AI Engineering"))
        .unwrap();
    (store, source.id, project.id, area.id)
}

#[test]
fn organization_applies_overlapping_memberships_in_one_audit() {
    let (store, source, project, area) = seeded();
    let audit = store
        .apply_organization(
            &source,
            &[
                OrganizationDecision {
                    facet_id: project.clone(),
                    confidence_basis_points: 9_200,
                    pinned: false,
                },
                OrganizationDecision {
                    facet_id: area.clone(),
                    confidence_basis_points: 8_100,
                    pinned: false,
                },
            ],
            "project title and concept overlap",
        )
        .unwrap();
    assert_eq!(store.memberships_for_source(&source).unwrap().len(), 2);
    assert_eq!(audit.reason, "project title and concept overlap");
    assert_eq!(store.organization_history(&source).unwrap(), [audit]);
}

#[test]
fn undo_restores_empty_prior_state_atomically() {
    let (store, source, project, _) = seeded();
    let audit = store
        .apply_organization(
            &source,
            &[OrganizationDecision {
                facet_id: project,
                confidence_basis_points: 9_000,
                pinned: false,
            }],
            "automatic",
        )
        .unwrap();
    store.undo_organization(&audit.id).unwrap();
    assert!(store.memberships_for_source(&source).unwrap().is_empty());
    assert!(store.organization_history(&source).unwrap()[0].undone);
}

#[test]
fn undo_restores_pinned_prior_membership() {
    let (store, source, project, area) = seeded();
    store.add_membership(&source, &project, true).unwrap();
    let audit = store
        .apply_organization(
            &source,
            &[OrganizationDecision {
                facet_id: area,
                confidence_basis_points: 9_000,
                pinned: false,
            }],
            "automatic",
        )
        .unwrap();
    store.undo_organization(&audit.id).unwrap();
    let memberships = store.memberships_for_source(&source).unwrap();
    assert_eq!(memberships.len(), 1);
    assert_eq!(memberships[0].facet_id, project);
    assert!(memberships[0].pinned);
}

#[test]
fn inferred_decision_cannot_override_a_pinned_correction() {
    let (store, source, project, _) = seeded();
    store.add_membership(&source, &project, true).unwrap();
    store
        .apply_organization(
            &source,
            &[OrganizationDecision {
                facet_id: project.clone(),
                confidence_basis_points: 1_000,
                pinned: false,
            }],
            "weak inference",
        )
        .unwrap();
    let membership = &store.memberships_for_source(&source).unwrap()[0];
    assert_eq!(membership.facet_id, project);
    assert!(membership.pinned);
}

#[test]
fn explicit_new_pinned_decision_can_replace_inferred_state() {
    let (store, source, project, _) = seeded();
    store.add_membership(&source, &project, false).unwrap();
    store
        .apply_organization(
            &source,
            &[OrganizationDecision {
                facet_id: project,
                confidence_basis_points: 10_000,
                pinned: true,
            }],
            "user correction",
        )
        .unwrap();
    assert!(store.memberships_for_source(&source).unwrap()[0].pinned);
}

#[test]
fn confidence_above_one_is_rejected_without_audit_or_membership() {
    let (store, source, project, _) = seeded();
    let result = store.apply_organization(
        &source,
        &[OrganizationDecision {
            facet_id: project,
            confidence_basis_points: 10_001,
            pinned: false,
        }],
        "invalid",
    );
    assert!(matches!(result, Err(StorageError::Constraint(_))));
    assert!(store.memberships_for_source(&source).unwrap().is_empty());
    assert!(store.organization_history(&source).unwrap().is_empty());
}

#[test]
fn unknown_source_is_rejected_without_audit() {
    let (store, _, project, _) = seeded();
    assert_eq!(
        store
            .apply_organization(
                "missing",
                &[OrganizationDecision {
                    facet_id: project,
                    confidence_basis_points: 9_000,
                    pinned: false,
                }],
                "automatic",
            )
            .unwrap_err(),
        StorageError::NotFound("source")
    );
}

#[test]
fn unknown_audit_cannot_be_undone() {
    let (store, _, _, _) = seeded();
    assert_eq!(
        store.undo_organization("missing").unwrap_err(),
        StorageError::NotFound("organization audit")
    );
}

#[test]
fn same_audit_cannot_be_undone_twice() {
    let (store, source, project, _) = seeded();
    let audit = store
        .apply_organization(
            &source,
            &[OrganizationDecision {
                facet_id: project,
                confidence_basis_points: 9_000,
                pinned: false,
            }],
            "automatic",
        )
        .unwrap();
    store.undo_organization(&audit.id).unwrap();
    assert!(matches!(
        store.undo_organization(&audit.id),
        Err(StorageError::Constraint(_))
    ));
}

#[test]
fn list_facets_returns_every_created_facet() {
    let (store, _, project, area) = seeded();
    let facets = store.list_facets().unwrap();
    let ids: Vec<_> = facets.iter().map(|facet| facet.id.clone()).collect();
    assert!(ids.contains(&project));
    assert!(ids.contains(&area));
}

#[test]
fn list_facet_memberships_reflects_applied_organization_across_facets() {
    let (store, source, project, area) = seeded();
    store
        .apply_organization(
            &source,
            &[
                OrganizationDecision {
                    facet_id: project.clone(),
                    confidence_basis_points: 9_200,
                    pinned: false,
                },
                OrganizationDecision {
                    facet_id: area.clone(),
                    confidence_basis_points: 8_100,
                    pinned: false,
                },
            ],
            "test",
        )
        .unwrap();
    let memberships = store.list_facet_memberships().unwrap();
    assert_eq!(memberships.len(), 2);
    assert!(
        memberships
            .iter()
            .any(|membership| membership.facet_id == project && membership.source_id == source)
    );
    assert!(
        memberships
            .iter()
            .any(|membership| membership.facet_id == area && membership.source_id == source)
    );
}

#[test]
fn list_facet_memberships_supports_one_facet_shared_by_multiple_sources() {
    let (store, first_source, project, _) = seeded();
    let second_source = seeded_extra_source(&store, "Second Meeting");
    for source in [&first_source, &second_source] {
        store
            .apply_organization(
                source,
                &[OrganizationDecision {
                    facet_id: project.clone(),
                    confidence_basis_points: 9_000,
                    pinned: false,
                }],
                "shared project",
            )
            .unwrap();
    }
    let memberships = store.list_facet_memberships().unwrap();
    let sources_under_project: Vec<_> = memberships
        .iter()
        .filter(|membership| membership.facet_id == project)
        .map(|membership| membership.source_id.clone())
        .collect();
    assert!(sources_under_project.contains(&first_source));
    assert!(sources_under_project.contains(&second_source));
    assert_eq!(sources_under_project.len(), 2);
}

#[test]
fn audit_history_contains_no_raw_source_body() {
    let (store, source, project, _) = seeded();
    store
        .apply_organization(
            &source,
            &[OrganizationDecision {
                facet_id: project,
                confidence_basis_points: 9_000,
                pinned: false,
            }],
            "deterministic title match",
        )
        .unwrap();
    let serialized = serde_json::to_string(&store.organization_history(&source).unwrap()).unwrap();
    assert!(serialized.contains("deterministic title match"));
    assert!(!serialized.contains("sourceBody"));
}
