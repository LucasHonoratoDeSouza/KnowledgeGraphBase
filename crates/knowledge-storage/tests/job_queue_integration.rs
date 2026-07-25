use knowledge_domain::SourceKind;
use knowledge_storage::{JobState, KnowledgeStore, SourceDraft, StorageError};

fn store_with_sources(count: usize) -> (KnowledgeStore, Vec<String>) {
    let store = KnowledgeStore::open_in_memory().unwrap();
    let sources = (0..count)
        .map(|index| {
            store
                .create_source(&SourceDraft {
                    kind: SourceKind::Text,
                    original_uri: format!("text:{index}"),
                    normalized_uri: format!("text:{index}"),
                    content_hash: format!("hash-{index}"),
                    pipeline_version: "v1".to_owned(),
                    title: format!("Text {index}"),
                })
                .unwrap()
                .id
        })
        .collect();
    (store, sources)
}

#[test]
fn enqueue_is_idempotent_for_same_operation_key() {
    let (store, sources) = store_with_sources(1);
    let first = store.enqueue_job(&sources[0], "same-key").unwrap();
    let second = store.enqueue_job(&sources[0], "same-key").unwrap();
    assert_eq!(first.id, second.id);
    assert_eq!(store.count("ingestion_jobs").unwrap(), 1);
}

#[test]
fn enqueue_requires_existing_source() {
    let (store, _) = store_with_sources(0);
    assert!(matches!(
        store.enqueue_job("missing", "key"),
        Err(StorageError::Constraint(_))
    ));
}

#[test]
fn lease_selects_oldest_queued_job_and_increments_attempt() {
    let (store, sources) = store_with_sources(2);
    let first = store.enqueue_job(&sources[0], "a-key").unwrap();
    store.enqueue_job(&sources[1], "b-key").unwrap();
    let leased = store.lease_next_job("worker-a", 100, 30).unwrap().unwrap();
    assert_eq!(leased.id, first.id);
    assert_eq!(leased.state, JobState::Running);
    assert_eq!(leased.attempt, 1);
    assert_eq!(leased.lease_expires_at, Some(130));
}

#[test]
fn targeted_lease_selects_requested_job_without_reordering_queue() {
    let (store, sources) = store_with_sources(2);
    let first = store.enqueue_job(&sources[0], "first-key").unwrap();
    let second = store.enqueue_job(&sources[1], "second-key").unwrap();
    let leased = store
        .lease_job(&second.id, "worker-b", 100, 30)
        .unwrap()
        .unwrap();
    assert_eq!(leased.id, second.id);
    assert_eq!(leased.attempt, 1);
    assert_eq!(
        store.job(&first.id).unwrap().unwrap().state,
        JobState::Queued
    );
}

#[test]
fn targeted_lease_respects_two_job_vault_limit() {
    let (store, sources) = store_with_sources(3);
    let jobs = sources
        .iter()
        .enumerate()
        .map(|(index, source)| store.enqueue_job(source, &format!("key-{index}")).unwrap())
        .collect::<Vec<_>>();
    assert!(
        store
            .lease_job(&jobs[0].id, "a", 100, 30)
            .unwrap()
            .is_some()
    );
    assert!(
        store
            .lease_job(&jobs[1].id, "b", 100, 30)
            .unwrap()
            .is_some()
    );
    assert!(
        store
            .lease_job(&jobs[2].id, "c", 100, 30)
            .unwrap()
            .is_none()
    );
}

#[test]
fn at_most_two_unexpired_jobs_are_leased() {
    let (store, sources) = store_with_sources(3);
    for (index, source) in sources.iter().enumerate() {
        store.enqueue_job(source, &format!("key-{index}")).unwrap();
    }
    assert!(store.lease_next_job("a", 100, 30).unwrap().is_some());
    assert!(store.lease_next_job("b", 100, 30).unwrap().is_some());
    assert!(store.lease_next_job("c", 100, 30).unwrap().is_none());
}

#[test]
fn expired_lease_is_reclaimed_with_same_job_identity() {
    let (store, sources) = store_with_sources(1);
    let job = store.enqueue_job(&sources[0], "key").unwrap();
    store.lease_next_job("old", 100, 10).unwrap();
    let reclaimed = store.lease_next_job("new", 111, 10).unwrap().unwrap();
    assert_eq!(reclaimed.id, job.id);
    assert_eq!(reclaimed.attempt, 2);
    assert_eq!(reclaimed.lease_owner.as_deref(), Some("new"));
}

#[test]
fn wrong_worker_cannot_complete_job() {
    let (store, sources) = store_with_sources(1);
    let job = store.enqueue_job(&sources[0], "key").unwrap();
    store.lease_next_job("owner", 100, 30).unwrap();
    assert!(matches!(
        store.complete_job(&job.id, "other"),
        Err(StorageError::Constraint(_))
    ));
    assert_eq!(
        store.job(&job.id).unwrap().unwrap().state,
        JobState::Running
    );
}

#[test]
fn completion_is_terminal_and_clears_lease() {
    let (store, sources) = store_with_sources(1);
    let job = store.enqueue_job(&sources[0], "key").unwrap();
    store.lease_next_job("owner", 100, 30).unwrap();
    store.complete_job(&job.id, "owner").unwrap();
    let completed = store.job(&job.id).unwrap().unwrap();
    assert_eq!(completed.state, JobState::Completed);
    assert_eq!(completed.lease_owner, None);
    assert!(store.lease_next_job("next", 200, 30).unwrap().is_none());
}

#[test]
fn retryable_failure_requeues_same_job_and_preserves_error() {
    let (store, sources) = store_with_sources(1);
    let job = store.enqueue_job(&sources[0], "key").unwrap();
    store.lease_next_job("owner", 100, 30).unwrap();
    assert_eq!(
        store.fail_job(&job.id, "owner", "timeout").unwrap(),
        JobState::Queued
    );
    let failed = store.job(&job.id).unwrap().unwrap();
    assert_eq!(failed.error.as_deref(), Some("timeout"));
    assert_eq!(failed.idempotency_key, "key");
}

#[test]
fn third_failure_becomes_terminal_failed() {
    let (store, sources) = store_with_sources(1);
    let job = store.enqueue_job(&sources[0], "key").unwrap();
    for attempt in 1..=3 {
        store
            .lease_next_job("owner", i64::from(attempt) * 100, 30)
            .unwrap();
        let state = store.fail_job(&job.id, "owner", "timeout").unwrap();
        assert_eq!(
            state,
            if attempt == 3 {
                JobState::Failed
            } else {
                JobState::Queued
            }
        );
    }
    assert!(store.lease_next_job("owner", 1_000, 30).unwrap().is_none());
}

#[test]
fn queued_job_can_be_cancelled_and_never_leased() {
    let (store, sources) = store_with_sources(1);
    let job = store.enqueue_job(&sources[0], "key").unwrap();
    store.cancel_job(&job.id).unwrap();
    assert_eq!(
        store.job(&job.id).unwrap().unwrap().state,
        JobState::Cancelled
    );
    assert!(store.lease_next_job("worker", 100, 30).unwrap().is_none());
}

#[test]
fn completed_job_cannot_be_cancelled() {
    let (store, sources) = store_with_sources(1);
    let job = store.enqueue_job(&sources[0], "key").unwrap();
    store.lease_next_job("worker", 100, 30).unwrap();
    store.complete_job(&job.id, "worker").unwrap();
    assert!(matches!(
        store.cancel_job(&job.id),
        Err(StorageError::Constraint(_))
    ));
}

#[test]
fn invalid_lease_request_mutates_nothing() {
    let (store, sources) = store_with_sources(1);
    let job = store.enqueue_job(&sources[0], "key").unwrap();
    assert!(store.lease_next_job("", 100, 30).is_err());
    assert_eq!(store.job(&job.id).unwrap().unwrap().state, JobState::Queued);
    assert_eq!(store.job(&job.id).unwrap().unwrap().attempt, 0);
}
