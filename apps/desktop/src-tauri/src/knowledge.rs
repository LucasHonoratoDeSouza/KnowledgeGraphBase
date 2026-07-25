#![allow(
    clippy::missing_errors_doc,
    reason = "native command services return renderer-safe String errors through narrow IPC"
)]

use std::{fs, path::Path};

use knowledge_ai::AiPort;
use knowledge_domain::{ProcessingState, RelationType, SourceKind};
use knowledge_ingestion::{
    CaptureRequest, CaptureService, DeterministicPipeline, ExtractedContent, KnowledgeEnrichment,
    NativeContentAdapter, PIPELINE_VERSION, PipelineResult, SourceLocator,
    YouTubeTranscriptionFallback, chunk_text, content_hash,
};
use knowledge_retrieval::{AssistantAnswer, GroundedAssistant, RetrievalEngine, RetrievalResult};
use knowledge_storage::{
    ConceptDraft, DocumentDraft, DocumentRecord, EdgeDraft, FacetDraft, FacetMembershipRecord,
    FacetRecord, GraphView, KnowledgeStore, OrganizationDecision, SourceDraft, SourceRecord,
};
use serde::{Deserialize, Serialize};

const MAX_LIBRARY_ENTRIES: usize = 10_000;

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CaptureKind {
    Auto,
    Url,
    Text,
    MeetingNote,
    Markdown,
    Pdf,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureCommandRequest {
    pub kind: CaptureKind,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub content: String,
    #[serde(default)]
    pub file_name: String,
    #[serde(default)]
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureCommandResponse {
    pub source: SourceRecord,
    pub document: DocumentRecord,
    pub reused: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryEntry {
    pub name: String,
    pub path: String,
    pub kind: LibraryEntryKind,
    pub children: Vec<LibraryEntry>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum LibraryEntryKind {
    Folder,
    Markdown,
    Attachment,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySnapshot {
    pub entries: Vec<LibraryEntry>,
    pub documents: Vec<DocumentRecord>,
    pub sources: Vec<SourceRecord>,
    pub note_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrganizationSnapshot {
    pub facets: Vec<FacetRecord>,
    pub memberships: Vec<FacetMembershipRecord>,
}

pub trait KnowledgeEnrichmentPort {
    fn enrich(
        &self,
        source: &SourceRecord,
        content: &ExtractedContent,
    ) -> Result<KnowledgeEnrichment, String>;
}

pub fn capture_in_vault(
    vault_root: &Path,
    request: &CaptureCommandRequest,
) -> Result<CaptureCommandResponse, String> {
    capture_in_vault_with_services(vault_root, request, None, None)
}

pub fn capture_in_vault_with_transcription(
    vault_root: &Path,
    request: &CaptureCommandRequest,
    transcription: Option<&dyn YouTubeTranscriptionFallback>,
) -> Result<CaptureCommandResponse, String> {
    capture_in_vault_with_services(vault_root, request, transcription, None)
}

pub fn capture_in_vault_with_services(
    vault_root: &Path,
    request: &CaptureCommandRequest,
    transcription: Option<&dyn YouTubeTranscriptionFallback>,
    enricher: Option<&dyn KnowledgeEnrichmentPort>,
) -> Result<CaptureCommandResponse, String> {
    let store = open_store(vault_root)?;
    store.recover_writes(vault_root).map_err(command_error)?;
    let kind = infer_kind(request);
    let receipt = {
        let capture = CaptureService::new(&store);
        match kind {
            CaptureKind::Url => capture.capture(CaptureRequest::Url(&request.content)),
            CaptureKind::Text => capture.capture(CaptureRequest::Text {
                title: non_blank(&request.title, "Quick capture"),
                content: &request.content,
            }),
            CaptureKind::MeetingNote => capture.capture(CaptureRequest::MeetingNote {
                title: non_blank(&request.title, "Meeting note"),
                content: &request.content,
            }),
            CaptureKind::Markdown => capture.capture(CaptureRequest::Markdown {
                file_name: non_blank(&request.file_name, "Imported note.md"),
                content: &request.content,
            }),
            CaptureKind::Pdf => capture.capture(CaptureRequest::Pdf {
                file_name: non_blank(&request.file_name, "Document.pdf"),
                bytes: &request.bytes,
            }),
            CaptureKind::Auto => unreachable!("auto capture kind is resolved before persistence"),
        }
    }
    .map_err(command_error)?;

    if receipt.duplicate && receipt.source.state == ProcessingState::Completed {
        let document = store
            .document_for_source(&receipt.source.id)
            .map_err(command_error)?
            .ok_or_else(|| "completed source has no document".to_owned())?;
        return Ok(CaptureCommandResponse {
            source: receipt.source,
            document,
            reused: true,
        });
    }

    let extracted = match kind {
        CaptureKind::Url if receipt.source.kind == knowledge_domain::SourceKind::YouTube => {
            let adapter = NativeContentAdapter::new().map_err(command_error)?;
            transcription
                .map_or_else(
                    || adapter.extract_youtube(&receipt.source.normalized_uri),
                    |fallback| {
                        adapter
                            .extract_youtube_with_fallback(&receipt.source.normalized_uri, fallback)
                    },
                )
                .map_err(command_error)?
        }
        CaptureKind::Url => NativeContentAdapter::new()
            .and_then(|adapter| adapter.extract_web(&receipt.source.normalized_uri))
            .map_err(command_error)?,
        CaptureKind::Pdf => NativeContentAdapter::new()
            .and_then(|adapter| adapter.extract_pdf(&request.bytes))
            .map_err(command_error)?,
        CaptureKind::Text | CaptureKind::MeetingNote | CaptureKind::Markdown => ExtractedContent {
            title: non_blank(
                if matches!(kind, CaptureKind::Markdown) {
                    &request.file_name
                } else {
                    &request.title
                },
                &receipt.source.title,
            )
            .trim_end_matches(".md")
            .to_owned(),
            body: request.content.clone(),
            locators: vec![SourceLocator::Note {
                heading: receipt.source.title.clone(),
            }],
            used_fallback: false,
        },
        CaptureKind::Auto => unreachable!("auto capture kind is resolved before extraction"),
    };
    let enrichment = enricher
        .map(|enricher| enricher.enrich(&receipt.source, &extracted))
        .transpose()?;
    let PipelineResult { document, reused } = DeterministicPipeline::new(&store, vault_root)
        .process_enriched(&receipt, extracted, enrichment.as_ref())
        .map_err(command_error)?;
    let source = store
        .source(&receipt.source.id)
        .map_err(command_error)?
        .ok_or_else(|| "captured source disappeared".to_owned())?;
    Ok(CaptureCommandResponse {
        source,
        document,
        reused,
    })
}

pub fn library_in_vault(vault_root: &Path) -> Result<LibrarySnapshot, String> {
    let store = open_store(vault_root)?;
    prune_missing_documents(vault_root, &store)?;
    sync_existing_markdown(vault_root, &store)?;
    let mut count = 0;
    let entries = scan_directory(vault_root, vault_root, &mut count)?;
    let note_count = count;
    Ok(LibrarySnapshot {
        entries,
        documents: store.list_documents().map_err(command_error)?,
        sources: store.list_sources().map_err(command_error)?,
        note_count,
    })
}

/// Creates one empty folder inside the granted vault and returns the refreshed library.
///
/// Folder names stay ordinary filesystem names so the vault keeps working like
/// a plain Obsidian-style directory; only traversal and hidden/metadata names
/// are rejected.
pub fn create_folder_in_vault(
    vault_root: &Path,
    relative: &str,
) -> Result<LibrarySnapshot, String> {
    let target = resolve_vault_child(vault_root, relative)?;
    if target.exists() {
        return Err("a folder with that name already exists".to_owned());
    }
    fs::create_dir_all(&target).map_err(command_error)?;
    library_in_vault(vault_root)
}

/// Renames one note or folder in place. The new name is a single path
/// component — moving between folders is [`move_entry_in_vault`]'s job.
pub fn rename_entry_in_vault(
    vault_root: &Path,
    relative: &str,
    new_name: &str,
) -> Result<LibrarySnapshot, String> {
    let source = resolve_vault_child(vault_root, relative)?;
    if !source.exists() {
        return Err("the item no longer exists".to_owned());
    }
    let name = new_name.trim();
    if name.is_empty() || name.contains('/') || name.contains('\\') {
        return Err("a name must be a single item name".to_owned());
    }
    let name =
        if source.is_file() && is_markdown(Path::new(relative)) && !is_markdown(Path::new(name)) {
            format!("{name}.md")
        } else {
            name.to_owned()
        };
    let parent = Path::new(relative)
        .parent()
        .map_or_else(String::new, |value| {
            value.to_string_lossy().replace('\\', "/")
        });
    let target_relative = if parent.is_empty() {
        name
    } else {
        format!("{parent}/{name}")
    };
    let target = resolve_vault_child(vault_root, &target_relative)?;
    if target == source {
        return library_in_vault(vault_root);
    }
    if target.exists() {
        return Err("an item with that name already exists here".to_owned());
    }
    fs::rename(&source, &target).map_err(command_error)?;
    library_in_vault(vault_root)
}

/// Deletes one note or folder (folders recursively) from the vault.
pub fn delete_entry_in_vault(vault_root: &Path, relative: &str) -> Result<LibrarySnapshot, String> {
    let target = resolve_vault_child(vault_root, relative)?;
    if !target.exists() {
        return Err("the item no longer exists".to_owned());
    }
    if target.is_dir() {
        fs::remove_dir_all(&target).map_err(command_error)?;
    } else {
        fs::remove_file(&target).map_err(command_error)?;
    }
    library_in_vault(vault_root)
}

/// Moves one note or folder into `destination` (empty string = vault root),
/// recording the move as a pinned organization correction so later captures
/// can follow the user's own filing (KOS-051).
pub fn move_entry_in_vault(
    vault_root: &Path,
    relative: &str,
    destination: &str,
) -> Result<LibrarySnapshot, String> {
    let source = resolve_vault_child(vault_root, relative)?;
    if !source.exists() {
        return Err("the item no longer exists".to_owned());
    }
    let destination = destination.trim().trim_matches('/');
    let destination_path = if destination.is_empty() {
        vault_root.to_path_buf()
    } else {
        let path = resolve_vault_child(vault_root, destination)?;
        if !path.is_dir() {
            return Err("the destination folder does not exist".to_owned());
        }
        path
    };
    if destination_path == source || destination_path.starts_with(&source) {
        return Err("a folder cannot be moved inside itself".to_owned());
    }
    let name = source
        .file_name()
        .ok_or_else(|| "the item has no name".to_owned())?;
    let target = destination_path.join(name);
    if target == source {
        return library_in_vault(vault_root);
    }
    if target.exists() {
        return Err("an item with that name already exists there".to_owned());
    }
    fs::rename(&source, &target).map_err(command_error)?;
    let name = name.to_string_lossy();
    let moved_relative = if destination.is_empty() {
        name.into_owned()
    } else {
        format!("{destination}/{name}")
    };
    // The refresh re-indexes the note at its new path (and prunes the old row),
    // so the correction is pinned against the surviving source afterwards —
    // pinning first would be cascaded away by that prune.
    let snapshot = library_in_vault(vault_root)?;
    if let Some(document) = open_store(vault_root)?
        .document_by_path(&moved_relative)
        .map_err(command_error)?
    {
        record_manual_placement(vault_root, &document.source_id, destination)?;
    }
    Ok(snapshot)
}

/// Pins the destination folder as the user's own placement decision, so the
/// deterministic resolver and the enrichment prompt both outrank the model's
/// earlier inference with it.
fn record_manual_placement(
    vault_root: &Path,
    source_id: &str,
    destination: &str,
) -> Result<(), String> {
    let (kind, name) = match destination.split_once('/') {
        Some(("Projects", rest)) => ("project", rest),
        Some(("Areas", rest)) => ("area", rest),
        _ if destination.is_empty() => return Ok(()),
        _ => ("tag", destination),
    };
    let leaf = name.rsplit('/').next().unwrap_or(name);
    if leaf.is_empty() {
        return Ok(());
    }
    let store = open_store(vault_root)?;
    let facet = store
        .upsert_facet(&FacetDraft::new(kind, leaf))
        .map_err(command_error)?;
    store
        .apply_organization(
            source_id,
            &[OrganizationDecision {
                facet_id: facet.id,
                confidence_basis_points: 10_000,
                pinned: true,
            }],
            "manual move in the Explorer",
        )
        .map_err(command_error)?;
    Ok(())
}

/// The user's most recent manual filing decisions, newest first.
pub fn recent_corrections(vault_root: &Path, limit: u32) -> Result<Vec<String>, String> {
    open_store(vault_root)?
        .recent_pinned_facets(limit)
        .map_err(command_error)
}

fn is_markdown(path: &Path) -> bool {
    path.extension()
        .is_some_and(|value| value.eq_ignore_ascii_case("md"))
}

fn resolve_vault_child(vault_root: &Path, relative: &str) -> Result<std::path::PathBuf, String> {
    if !vault_root.is_absolute() || !vault_root.is_dir() {
        return Err("local vault is unavailable".to_owned());
    }
    let candidate = Path::new(relative);
    if relative.trim().is_empty() || candidate.is_absolute() {
        return Err("folder name must stay inside the vault".to_owned());
    }
    for component in candidate.components() {
        let std::path::Component::Normal(name) = component else {
            return Err("folder name must stay inside the vault".to_owned());
        };
        let name = name.to_string_lossy();
        if name.starts_with('.') {
            return Err("folder name must not start with a dot".to_owned());
        }
    }
    Ok(vault_root.join(candidate))
}

/// Drops index rows whose Markdown file is gone. Markdown on disk is the
/// canonical record (AD-002), so a note that was renamed, moved or deleted —
/// inside the app or with any other tool — must not keep answering searches
/// from its old path.
fn prune_missing_documents(vault_root: &Path, store: &KnowledgeStore) -> Result<(), String> {
    for document in store.list_documents().map_err(command_error)? {
        if !vault_root.join(&document.path).is_file() {
            store
                .delete_source(&document.source_id)
                .map_err(command_error)?;
        }
    }
    Ok(())
}

fn sync_existing_markdown(vault_root: &Path, store: &KnowledgeStore) -> Result<(), String> {
    let mut files = Vec::new();
    collect_markdown_files(vault_root, vault_root, &mut files)?;
    for path in files {
        let relative = path
            .strip_prefix(vault_root)
            .map_err(command_error)?
            .to_string_lossy()
            .replace('\\', "/");
        let bytes = fs::read(&path).map_err(command_error)?;
        if bytes.len() > knowledge_ingestion::MAX_TEXT_BYTES {
            continue;
        }
        let content = String::from_utf8(bytes).map_err(command_error)?;
        if content.trim().is_empty() {
            continue;
        }
        let title = markdown_title(&content).unwrap_or_else(|| {
            path.file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or("Untitled")
                .to_owned()
        });
        let hash = content_hash(content.as_bytes());
        let existing = store.document_by_path(&relative).map_err(command_error)?;
        if existing
            .as_ref()
            .is_some_and(|document| document.content_hash == hash)
        {
            continue;
        }
        if let Some(existing) = existing {
            let mut chunks = chunk_text(&content, 3_200);
            for chunk in &mut chunks {
                chunk.locator = format!("section:{}", chunk.locator.trim_start_matches("section:"));
            }
            let document = store
                .replace_document(
                    &existing.id,
                    &DocumentDraft {
                        source_id: existing.source_id,
                        path: relative,
                        title: title.clone(),
                        summary: detailed_excerpt(&content),
                        content_hash: hash,
                    },
                    &chunks,
                )
                .map_err(command_error)?;
            persist_markdown_graph(store, &document, &title, &content)?;
            continue;
        }
        let source = store
            .create_source(&SourceDraft {
                kind: SourceKind::Markdown,
                original_uri: relative.clone(),
                normalized_uri: format!("file:{relative}"),
                content_hash: hash.clone(),
                pipeline_version: format!("{PIPELINE_VERSION}-local-file"),
                title: title.clone(),
            })
            .map_err(command_error)?;
        if source.state != ProcessingState::Pending {
            continue;
        }
        for state in [
            ProcessingState::Fetching,
            ProcessingState::Extracting,
            ProcessingState::Processing,
            ProcessingState::Indexing,
        ] {
            store
                .transition_source(&source.id, state)
                .map_err(command_error)?;
        }
        let mut chunks = chunk_text(&content, 3_200);
        for chunk in &mut chunks {
            chunk.locator = format!("section:{}", chunk.locator.trim_start_matches("section:"));
        }
        let summary = detailed_excerpt(&content);
        let document = store
            .save_document(
                &DocumentDraft {
                    source_id: source.id.clone(),
                    path: relative,
                    title: title.clone(),
                    summary,
                    content_hash: hash,
                },
                &chunks,
            )
            .map_err(command_error)?;
        persist_markdown_graph(store, &document, &title, &content)?;
        store
            .transition_source(&source.id, ProcessingState::Completed)
            .map_err(command_error)?;
    }
    Ok(())
}

fn persist_markdown_graph(
    store: &KnowledgeStore,
    document: &DocumentRecord,
    title: &str,
    content: &str,
) -> Result<(), String> {
    let concepts = markdown_concepts(title, content);
    let records = concepts
        .iter()
        .map(|concept| store.upsert_concept(&ConceptDraft::new(concept)))
        .collect::<Result<Vec<_>, _>>()
        .map_err(command_error)?;
    if let Some(root) = records.first() {
        for related in records.iter().skip(1) {
            store
                .add_edge(&EdgeDraft::new(
                    &root.id,
                    &related.id,
                    RelationType::RelatedTo,
                    7_000,
                    &document.id,
                ))
                .map_err(command_error)?;
        }
    }
    Ok(())
}

fn collect_markdown_files(
    vault_root: &Path,
    directory: &Path,
    files: &mut Vec<std::path::PathBuf>,
) -> Result<(), String> {
    if files.len() >= MAX_LIBRARY_ENTRIES {
        return Ok(());
    }
    for raw in fs::read_dir(directory).map_err(command_error)? {
        let entry = raw.map_err(command_error)?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') || matches!(name.as_str(), "node_modules" | "target") {
            continue;
        }
        if path.is_dir() {
            collect_markdown_files(vault_root, &path, files)?;
        } else if path.extension().and_then(|value| value.to_str()) == Some("md")
            && path.starts_with(vault_root)
        {
            files.push(path);
        }
    }
    files.sort();
    Ok(())
}

fn markdown_title(content: &str) -> Option<String> {
    content.lines().find_map(|line| {
        line.trim()
            .strip_prefix("# ")
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
    })
}

fn markdown_concepts(title: &str, content: &str) -> Vec<String> {
    let mut concepts = vec![title.to_owned()];
    concepts.extend(content.lines().filter_map(|line| {
        line.trim()
            .strip_prefix('#')
            .map(|value| value.trim_start_matches('#').trim())
            .filter(|value| !value.is_empty() && *value != title)
            .map(ToOwned::to_owned)
    }));
    let mut rest = content;
    while let Some(start) = rest.find("[[") {
        let after = &rest[start + 2..];
        let Some(end) = after.find("]]") else {
            break;
        };
        let concept = after[..end].trim();
        if !concept.is_empty() {
            concepts.push(concept.to_owned());
        }
        rest = &after[end + 2..];
    }
    concepts.truncate(24);
    concepts.dedup_by(|left, right| left.eq_ignore_ascii_case(right));
    concepts
}

fn detailed_excerpt(content: &str) -> String {
    let normalized = content.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut end = normalized.len().min(2_000);
    while end > 0 && !normalized.is_char_boundary(end) {
        end -= 1;
    }
    if end < normalized.len() {
        format!("{}…", normalized[..end].trim())
    } else {
        normalized
    }
}

pub fn organization_in_vault(vault_root: &Path) -> Result<OrganizationSnapshot, String> {
    let store = open_store(vault_root)?;
    Ok(OrganizationSnapshot {
        facets: store.list_facets().map_err(command_error)?,
        memberships: store.list_facet_memberships().map_err(command_error)?,
    })
}

pub fn graph_in_vault(vault_root: &Path) -> Result<GraphView, String> {
    open_store(vault_root)?
        .full_graph(500)
        .map_err(command_error)
}

pub fn search_in_vault(vault_root: &Path, query: &str) -> Result<RetrievalResult, String> {
    let store = open_store(vault_root)?;
    RetrievalEngine::new(&store)
        .search(query, 30)
        .map_err(command_error)
}

pub fn ask_in_vault(
    vault_root: &Path,
    question: &str,
    model_id: &str,
    ai: &dyn AiPort,
) -> Result<AssistantAnswer, String> {
    let store = open_store(vault_root)?;
    GroundedAssistant::new(&store, ai)
        .ask(question, model_id)
        .map_err(command_error)
}

fn open_store(vault_root: &Path) -> Result<KnowledgeStore, String> {
    if !vault_root.is_absolute() || !vault_root.is_dir() {
        return Err("local vault is unavailable".to_owned());
    }
    let metadata = vault_root.join(".knowledge-os");
    fs::create_dir_all(&metadata).map_err(command_error)?;
    KnowledgeStore::open(metadata.join("knowledge.sqlite3")).map_err(command_error)
}

fn infer_kind(request: &CaptureCommandRequest) -> CaptureKind {
    match request.kind {
        CaptureKind::Auto => {
            if !request.bytes.is_empty() {
                CaptureKind::Pdf
            } else if request.content.starts_with("https://")
                || request.content.starts_with("http://")
            {
                CaptureKind::Url
            } else {
                CaptureKind::Text
            }
        }
        kind => kind,
    }
}

fn non_blank<'a>(value: &'a str, fallback: &'a str) -> &'a str {
    if value.trim().is_empty() {
        fallback
    } else {
        value
    }
}

fn scan_directory(
    vault_root: &Path,
    directory: &Path,
    note_count: &mut usize,
) -> Result<Vec<LibraryEntry>, String> {
    if *note_count >= MAX_LIBRARY_ENTRIES {
        return Ok(Vec::new());
    }
    let mut entries = Vec::new();
    for raw in fs::read_dir(directory).map_err(command_error)? {
        let entry = raw.map_err(command_error)?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') || matches!(name.as_str(), "node_modules" | "target") {
            continue;
        }
        let relative = path
            .strip_prefix(vault_root)
            .map_err(command_error)?
            .to_string_lossy()
            .replace('\\', "/");
        if path.is_dir() {
            let children = scan_directory(vault_root, &path, note_count)?;
            entries.push(LibraryEntry {
                name,
                path: relative,
                kind: LibraryEntryKind::Folder,
                children,
            });
        } else {
            let markdown = path.extension().and_then(|value| value.to_str()) == Some("md");
            if markdown {
                *note_count += 1;
            }
            entries.push(LibraryEntry {
                name,
                path: relative,
                kind: if markdown {
                    LibraryEntryKind::Markdown
                } else {
                    LibraryEntryKind::Attachment
                },
                children: Vec::new(),
            });
        }
        if *note_count >= MAX_LIBRARY_ENTRIES {
            break;
        }
    }
    entries.sort_by(|left, right| {
        let left_file = left.kind != LibraryEntryKind::Folder;
        let right_file = right.kind != LibraryEntryKind::Folder;
        left_file
            .cmp(&right_file)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });
    Ok(entries)
}

fn command_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}
