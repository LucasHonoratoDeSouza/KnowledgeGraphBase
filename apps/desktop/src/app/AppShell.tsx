import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from "react";

import {
  ArrowUp,
  Bot,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Database,
  File,
  FileText,
  Folder,
  FolderOpen,
  Link2,
  MoreHorizontal,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Paperclip,
  Plus,
  Search,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Video,
} from "lucide-react";

import { DesktopStyles, Pane, ProductMark } from "@knowledge-os/ui";

import {
  CommandPaletteHost,
  CommandRegistry,
  createDefaultCommands,
} from "../commands";
import {
  MarkdownEditor,
  ipcEditorClient,
  type EditorClient,
  type NoteDocument,
} from "../editor";
import {
  AISettings,
  Onboarding,
  ipcSettingsClient,
  type FolderPicker,
  type ModelProfile,
  type SettingsClient,
  type SettingsSnapshot,
} from "../settings";
import {
  DEFAULT_LAYOUT,
  resizePane,
  restoreLayout,
  serializeLayout,
  togglePane,
  type WorkspaceLayout,
} from "../workspace/layout";
import {
  ipcKnowledgeClient,
  type AssistantAnswer,
  type GraphView,
  type KnowledgeClient,
  type LibraryEntry,
  type LibrarySnapshot,
  type RetrievalResult,
} from "../knowledge";

export type PrimaryMode = "Ingest" | "Retrieve";

interface AppShellProps {
  editorClient?: EditorClient;
  folderPicker?: FolderPicker;
  initialMode?: PrimaryMode;
  initialSettings?: SettingsSnapshot;
  knowledgeClient?: KnowledgeClient;
  online?: boolean;
  settingsClient?: SettingsClient;
  setupComplete?: boolean;
}

const modes: PrimaryMode[] = ["Ingest", "Retrieve"];

const emptySettings: SettingsSnapshot = {
  setupComplete: false,
  vaultName: null,
  activeMode: "Ingest",
  layoutJson: "{}",
  aiEnabled: false,
  providers: [],
  ai: {
    models: [],
    routing: {
      mainModelId: null,
      assistantDefaultModelId: null,
      explicitFallbackModelId: null,
    },
    budgets: { dailyCents: 0, monthlyCents: 0 },
    privacy: { allowSourceContent: false, storePrompts: false },
  },
};

interface IngestSurfaceProps {
  client: KnowledgeClient;
  onCaptured: () => void;
  vaultName: string;
}

function IngestSurface({ client, onCaptured, vaultName }: IngestSurfaceProps) {
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "working"; message: string }
    | { kind: "success"; message: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const fileInput = useRef<HTMLInputElement>(null);

  async function submit() {
    if (!content.trim() && !file) return;
    setStatus({ kind: "working", message: "Extracting and indexing locally…" });
    try {
      const isPdf = file?.name.toLowerCase().endsWith(".pdf") ?? false;
      const isMarkdown = file?.name.toLowerCase().endsWith(".md") ?? false;
      const bytes =
        isPdf && file ? [...new Uint8Array(await file.arrayBuffer())] : [];
      const sourceContent = isMarkdown && file ? await file.text() : content;
      const result = await client.capture({
        kind: isPdf ? "pdf" : isMarkdown ? "markdown" : "auto",
        title: file?.name.replace(/\.(pdf|md)$/i, "") ?? "Quick capture",
        content: sourceContent,
        fileName: file?.name ?? "",
        bytes,
      });
      setStatus({
        kind: "success",
        message: result.reused
          ? `Already indexed · ${result.document.title}`
          : `Saved · ${result.document.path}`,
      });
      setContent("");
      setFile(null);
      onCaptured();
    } catch (error) {
      setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function acceptDrop(event: DragEvent<HTMLFormElement>) {
    event.preventDefault();
    const dropped = event.dataTransfer.files.item(0);
    if (dropped) setFile(dropped);
  }

  return (
    <section aria-labelledby="ingest-heading" className="ingest-surface">
      <div className="ingest-content">
        <div className="ingest-kicker">
          <span>NEW SOURCE</span>
        </div>
        <h2 id="ingest-heading">Capture a source</h2>
        <p className="ingest-lead">
          Paste a link, write a note, or attach a file to your local library.
        </p>
        <form
          className="ingest-composer-shell"
          onDragOver={(event) => {
            event.preventDefault();
          }}
          onDrop={acceptDrop}
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label className="ingest-composer">
            <span className="visually-hidden">Add knowledge</span>
            <textarea
              aria-label="Add knowledge"
              onChange={(event) => {
                setContent(event.currentTarget.value);
              }}
              placeholder="Paste a YouTube link, article, meeting note, or write something…"
              rows={4}
              value={content}
            />
          </label>
          {file ? (
            <div className="ingest-file-chip">
              <FileText aria-hidden="true" size={14} />
              <span>{file.name}</span>
              <button
                aria-label={`Remove ${file.name}`}
                onClick={() => {
                  setFile(null);
                }}
                type="button"
              >
                ×
              </button>
            </div>
          ) : null}
          <div className="composer-toolbar">
            <div className="composer-actions">
              <button
                aria-label="Attach files"
                className="icon-text-button"
                onClick={() => {
                  fileInput.current?.click();
                }}
                type="button"
              >
                <Paperclip aria-hidden="true" size={16} />
                <span>Attach files</span>
              </button>
              <input
                accept=".pdf,.md,text/markdown,application/pdf"
                aria-label="Attach knowledge file"
                className="visually-hidden"
                onChange={(event) => {
                  setFile(event.currentTarget.files?.item(0) ?? null);
                }}
                ref={fileInput}
                type="file"
              />
              <button className="composer-select" type="button">
                <Sparkles aria-hidden="true" size={15} />
                <span>Auto organize</span>
                <ChevronDown aria-hidden="true" size={13} />
              </button>
            </div>
            <button
              aria-label="Process source"
              className="composer-submit"
              disabled={status.kind === "working" || (!content.trim() && !file)}
              type="submit"
            >
              <ArrowUp aria-hidden="true" size={17} strokeWidth={2.2} />
            </button>
          </div>
        </form>
        {status.kind !== "idle" ? (
          <p
            className={`ingest-status ingest-status-${status.kind}`}
            role="status"
          >
            {status.message}
          </p>
        ) : null}
        <div aria-label="Supported sources" className="source-types">
          <span>
            <Video aria-hidden="true" size={14} />
            YouTube
          </span>
          <span>
            <FileText aria-hidden="true" size={14} />
            PDF
          </span>
          <span>
            <Link2 aria-hidden="true" size={14} />
            Web
          </span>
          <span>
            <File aria-hidden="true" size={14} />
            Markdown
          </span>
          <span>
            <Bot aria-hidden="true" size={14} />
            Meeting notes
          </span>
        </div>
        <p className="ingest-privacy">
          <Database aria-hidden="true" size={13} /> Stored locally in
          <strong>{vaultName}</strong>
        </p>
      </div>
    </section>
  );
}

interface RetrieveSurfaceProps {
  editorClient: EditorClient;
  knowledgeClient: KnowledgeClient;
  layout: WorkspaceLayout;
  models: ModelProfile[];
  onLayoutChange: (layout: WorkspaceLayout) => void;
  vaultName: string;
}

const welcomeNote: NoteDocument = {
  path: "notes/Welcome.md",
  content:
    "# Knowledge OS\n\n## Current threads\n\n- Local-first knowledge systems\n- Retrieval and grounded agents\n- Notes from books and papers\n\nConnected to [[AI Research]] and [[Systems]].\n",
  diagnostics: [],
};

function KnowledgeGraph({ graph }: { graph: GraphView | null }) {
  const concepts = graph?.concepts ?? [];
  const graphEdges = graph?.edges ?? [];
  const degree = new Map<string, number>();
  for (const edge of graphEdges) {
    degree.set(
      edge.sourceConceptId,
      (degree.get(edge.sourceConceptId) ?? 0) + 1,
    );
    degree.set(
      edge.targetConceptId,
      (degree.get(edge.targetConceptId) ?? 0) + 1,
    );
  }
  const ordered = [...concepts].sort(
    (left, right) =>
      (degree.get(right.id) ?? 0) - (degree.get(left.id) ?? 0) ||
      left.displayName.localeCompare(right.displayName),
  );
  const graphNodes = ordered.map((concept, index) => {
    if (index === 0) {
      return {
        id: concept.id,
        x: 400,
        y: 260,
        r: 18,
        label: concept.displayName,
        tone: "accent",
      };
    }
    const angle =
      ((index - 1) / Math.max(ordered.length - 1, 1)) * Math.PI * 2 -
      Math.PI / 2;
    const radius = 145 + ((index - 1) % 3) * 34;
    return {
      id: concept.id,
      x: 400 + Math.cos(angle) * radius,
      y: 260 + Math.sin(angle) * Math.min(radius, 190),
      r: Math.min(13, 7 + (degree.get(concept.id) ?? 0)),
      label: concept.displayName,
      tone: (degree.get(concept.id) ?? 0) > 1 ? "bright" : "muted",
    };
  });
  const byId = new Map(graphNodes.map((node) => [node.id, node]));
  return (
    <div className="graph-view">
      <div className="graph-heading">
        <div>
          <span className="eyebrow">LOCAL GRAPH</span>
          <h2>Your knowledge, connected</h2>
          <p>
            {concepts.length} concepts · {graphEdges.length} relationships ·
            local index
          </p>
        </div>
        <div className="graph-actions">
          <button
            aria-label="Search graph"
            className="icon-button"
            type="button"
          >
            <Search aria-hidden="true" size={15} />
          </button>
          <button
            aria-label="Filter graph"
            className="icon-button"
            type="button"
          >
            <SlidersHorizontal aria-hidden="true" size={15} />
          </button>
          <button
            aria-label="More graph actions"
            className="icon-button"
            type="button"
          >
            <MoreHorizontal aria-hidden="true" size={16} />
          </button>
        </div>
      </div>
      <div className="graph-stage">
        <svg aria-label="Knowledge graph" role="img" viewBox="0 0 800 520">
          <g className="graph-edge-layer">
            {graphEdges.map((edge) => {
              const source = byId.get(edge.sourceConceptId);
              const target = byId.get(edge.targetConceptId);
              if (!source || !target) return null;
              return (
                <line
                  key={edge.id}
                  x1={source.x}
                  x2={target.x}
                  y1={source.y}
                  y2={target.y}
                />
              );
            })}
          </g>
          <g className="graph-node-layer">
            {graphNodes.map((node) => (
              <g className={`graph-node graph-node-${node.tone}`} key={node.id}>
                <circle cx={node.x} cy={node.y} r={node.r} />
                <text textAnchor="middle" x={node.x} y={node.y + node.r + 21}>
                  {node.label}
                </text>
              </g>
            ))}
          </g>
        </svg>
        {concepts.length === 0 ? (
          <div className="graph-empty">
            Capture a source to grow your local graph.
          </div>
        ) : null}
        <div className="graph-legend">
          <span>
            <i className="legend-dot legend-dot-focus" />
            Current focus
          </span>
          <span>
            <i className="legend-dot" />
            Concept
          </span>
        </div>
      </div>
    </div>
  );
}

function LibraryRows({
  entries,
  onOpen,
}: {
  entries: LibraryEntry[];
  onOpen: (path: string) => void;
}) {
  return (
    <>
      {entries.map((entry) => (
        <li
          aria-expanded={entry.kind === "folder" ? true : undefined}
          key={entry.path}
          role="treeitem"
        >
          {entry.kind === "markdown" ? (
            <button
              className="tree-row tree-file-button"
              onClick={() => {
                onOpen(entry.path);
              }}
              type="button"
            >
              <FileText aria-hidden="true" size={14} />
              <span>{entry.name.replace(/\.md$/i, "")}</span>
            </button>
          ) : (
            <span className="tree-row">
              {entry.kind === "folder" ? (
                <>
                  <ChevronDown aria-hidden="true" size={13} />
                  <FolderOpen aria-hidden="true" size={15} />
                </>
              ) : (
                <File aria-hidden="true" size={14} />
              )}
              <span>{entry.name}</span>
            </span>
          )}
          {entry.children.length > 0 ? (
            <ul role="group">
              <LibraryRows entries={entry.children} onOpen={onOpen} />
            </ul>
          ) : null}
        </li>
      ))}
    </>
  );
}

function ExplorerPane({
  library,
  onOpen,
  onSearch,
  searchResult,
  vaultName,
}: {
  library: LibrarySnapshot | null;
  onOpen: (path: string) => void;
  onSearch: (query: string) => void;
  searchResult: RetrievalResult | null;
  vaultName: string;
}) {
  const [query, setQuery] = useState("");
  const defaultEntries: LibraryEntry[] = ["Inbox", "Projects", "Research"].map(
    (name) => ({
      name,
      path: name,
      kind: "folder",
      children: [],
    }),
  );
  return (
    <div className="explorer-pane">
      <header className="pane-header">
        <span>EXPLORER</span>
        <div>
          <button
            aria-label="New note"
            className="bare-icon-button"
            type="button"
          >
            <FileText aria-hidden="true" size={15} />
          </button>
          <button
            aria-label="New folder"
            className="bare-icon-button"
            type="button"
          >
            <Folder aria-hidden="true" size={15} />
          </button>
          <button
            aria-label="More explorer actions"
            className="bare-icon-button"
            type="button"
          >
            <MoreHorizontal aria-hidden="true" size={15} />
          </button>
        </div>
      </header>
      <label className="explorer-search">
        <Search aria-hidden="true" size={14} />
        <span className="visually-hidden">Filter knowledge</span>
        <input
          aria-label="Filter knowledge"
          onChange={(event) => {
            setQuery(event.currentTarget.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && query.trim()) {
              onSearch(query);
            }
          }}
          placeholder="Search knowledge"
          value={query}
        />
        <kbd>⌘F</kbd>
      </label>
      <nav aria-label="Knowledge library" className="knowledge-tree">
        <div className="tree-root">
          <ChevronDown aria-hidden="true" size={14} />
          <span>{vaultName.toUpperCase()}</span>
        </div>
        <ul role="tree">
          <LibraryRows
            entries={library?.entries ?? defaultEntries}
            onOpen={onOpen}
          />
        </ul>
        {searchResult ? (
          <div className="explorer-results" aria-label="Search results">
            <span className="eyebrow">SEARCH RESULTS</span>
            {searchResult.hits.map((hit) => (
              <button
                key={hit.chunkId}
                onClick={() => {
                  onOpen(hit.path);
                }}
                type="button"
              >
                <strong>{hit.title}</strong>
                <span>{hit.snippet.replace(/<\/?mark>/g, "")}</span>
              </button>
            ))}
            {searchResult.hits.length === 0 ? <p>No local matches.</p> : null}
          </div>
        ) : null}
      </nav>
      <footer className="explorer-footer">
        <span>
          <CircleDot aria-hidden="true" size={13} /> Local vault
        </span>
        <span>{library?.noteCount ?? 0} notes</span>
      </footer>
    </div>
  );
}

function AssistantPane({
  client,
  models,
}: {
  client: KnowledgeClient;
  models: ModelProfile[];
}) {
  const [question, setQuestion] = useState("");
  const [modelId, setModelId] = useState(models[0]?.id ?? "");
  const [answer, setAnswer] = useState<AssistantAnswer | null>(null);
  const [assistantError, setAssistantError] = useState("");
  const [working, setWorking] = useState(false);
  const selectedModelId = models.some((model) => model.id === modelId)
    ? modelId
    : (models[0]?.id ?? "");

  async function ask() {
    if (!question.trim() || !selectedModelId) return;
    setWorking(true);
    setAssistantError("");
    try {
      setAnswer(await client.ask(question, selectedModelId));
      setQuestion("");
    } catch (error) {
      setAssistantError(error instanceof Error ? error.message : String(error));
    } finally {
      setWorking(false);
    }
  }
  return (
    <div className="assistant-pane">
      <header className="assistant-header">
        <div className="assistant-title">
          <Bot aria-hidden="true" size={16} />
          <span>Knowledge Assistant</span>
        </div>
        <button
          aria-label="Assistant options"
          className="bare-icon-button"
          type="button"
        >
          <MoreHorizontal aria-hidden="true" size={16} />
        </button>
      </header>
      <div className="assistant-context-bar">
        <span>
          <Network aria-hidden="true" size={13} /> Whole vault
        </span>
        <span className="read-only-badge">Read-only</span>
      </div>
      {answer ? (
        <div className="assistant-answer" aria-live="polite">
          <span className="eyebrow">GROUNDED ANSWER</span>
          <p>{answer.answer}</p>
          {answer.citations.map((citation) => (
            <div className="assistant-citation" key={citation.number}>
              <b>
                [{citation.number}] {citation.title}
              </b>
              <span>{citation.path}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="assistant-empty-state">
          <div className="assistant-orb">
            <Sparkles aria-hidden="true" size={22} />
          </div>
          <h2>Ask across everything you know.</h2>
          <p>
            Answers will be grounded in your notes and linked back to the exact
            source.
          </p>
          <div className="prompt-examples">
            {[
              "Connect my recent research",
              "What did I learn about agents?",
              "Summarize this project",
            ].map((example) => (
              <button
                key={example}
                onClick={() => {
                  setQuestion(example);
                }}
                type="button"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      )}
      {assistantError ? (
        <p className="assistant-error" role="alert">
          {assistantError}
        </p>
      ) : null}
      <div className="assistant-composer">
        <textarea
          aria-label="Ask your knowledge base"
          onChange={(event) => {
            setQuestion(event.currentTarget.value);
          }}
          placeholder="Ask your knowledge base…"
          rows={3}
          value={question}
        />
        <div className="assistant-composer-footer">
          <select
            aria-label="Assistant model"
            onChange={(event) => {
              setModelId(event.currentTarget.value);
            }}
            value={selectedModelId}
          >
            {models.length === 0 ? (
              <option value="">No model configured</option>
            ) : null}
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.displayName}
              </option>
            ))}
          </select>
          <button
            aria-label="Send question"
            disabled={working || !selectedModelId || !question.trim()}
            onClick={() => void ask()}
            type="button"
          >
            <ArrowUp aria-hidden="true" size={15} />
          </button>
        </div>
      </div>
      <footer className="assistant-disclaimer">
        AI can make mistakes. Sources stay visible.
      </footer>
    </div>
  );
}

function RetrieveSurface({
  editorClient,
  knowledgeClient,
  layout,
  models,
  onLayoutChange,
  vaultName,
}: RetrieveSurfaceProps) {
  const explorer = layout.panes.explorer;
  const assistant = layout.panes.assistant;
  const explorerColumn = `${String(explorer.collapsed ? 0 : explorer.width)}px`;
  const assistantColumn = `${String(assistant.collapsed ? 0 : assistant.width)}px`;
  const [document, setDocument] = useState(welcomeNote);
  const [canvasView, setCanvasView] = useState<"graph" | "note">("graph");
  const [library, setLibrary] = useState<LibrarySnapshot | null>(null);
  const [graph, setGraph] = useState<GraphView | null>(null);
  const [searchResult, setSearchResult] = useState<RetrievalResult | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    void editorClient
      .openNote(welcomeNote.path)
      .then((opened) => {
        if (!cancelled) setDocument(opened);
      })
      .catch(() => {
        // A newly created vault starts with an unsaved welcome note.
      });
    return () => {
      cancelled = true;
    };
  }, [editorClient]);

  useEffect(() => {
    let cancelled = false;
    void knowledgeClient
      .getLibrary()
      .then(async (nextLibrary) => {
        const nextGraph = await knowledgeClient.getGraph();
        if (cancelled) return;
        setLibrary(nextLibrary);
        setGraph(nextGraph);
      })
      .catch(() => {
        // The native vault can still be opened manually when indexing is unavailable.
      });
    return () => {
      cancelled = true;
    };
  }, [knowledgeClient]);

  async function openDocument(path: string) {
    try {
      setDocument(await editorClient.openNote(path));
      setCanvasView("note");
    } catch {
      // Attachments remain visible but only Markdown opens in the editor.
    }
  }

  return (
    <section aria-label="Retrieve workspace" className="retrieve-shell">
      <div aria-label="Pane controls" className="pane-controls">
        <div className="pane-control-group">
          <button
            aria-label={explorer.collapsed ? "Show Explorer" : "Hide Explorer"}
            className="icon-button"
            onClick={() => {
              onLayoutChange(togglePane(layout, "explorer"));
            }}
            type="button"
          >
            {explorer.collapsed ? (
              <PanelLeftOpen aria-hidden="true" size={15} />
            ) : (
              <PanelLeftClose aria-hidden="true" size={15} />
            )}
          </button>
          <button
            aria-label="Widen Explorer"
            className="icon-button"
            disabled={explorer.collapsed}
            onClick={() => {
              onLayoutChange(
                resizePane(layout, "explorer", explorer.width + 40),
              );
            }}
            type="button"
          >
            <ChevronRight aria-hidden="true" size={15} />
          </button>
        </div>
        <div className="pane-toolbar-label">
          <Network aria-hidden="true" size={14} />
          <span>Knowledge workspace</span>
        </div>
        <div className="pane-control-group">
          <button
            aria-label="Widen Assistant"
            className="icon-button"
            disabled={assistant.collapsed}
            onClick={() => {
              onLayoutChange(
                resizePane(layout, "assistant", assistant.width + 40),
              );
            }}
            type="button"
          >
            <ChevronRight aria-hidden="true" size={15} />
          </button>
          <button
            aria-label={
              assistant.collapsed ? "Show Assistant" : "Hide Assistant"
            }
            className="icon-button"
            onClick={() => {
              onLayoutChange(togglePane(layout, "assistant"));
            }}
            type="button"
          >
            {assistant.collapsed ? (
              <PanelRightOpen aria-hidden="true" size={15} />
            ) : (
              <PanelRightClose aria-hidden="true" size={15} />
            )}
          </button>
        </div>
      </div>
      <div
        className="retrieve-workspace"
        style={{
          gridTemplateColumns: `${explorerColumn} minmax(320px, 1fr) ${assistantColumn}`,
        }}
      >
        <Pane
          aria-label="Explorer"
          className="explorer-region"
          collapsed={explorer.collapsed}
        >
          <ExplorerPane
            library={library}
            onOpen={(path) => void openDocument(path)}
            onSearch={(query) => {
              void knowledgeClient
                .search(query)
                .then(setSearchResult)
                .catch(() => {
                  setSearchResult(null);
                });
            }}
            searchResult={searchResult}
            vaultName={vaultName}
          />
        </Pane>
        <Pane aria-label="Knowledge canvas" className="canvas-region">
          <div className="canvas-tabbar">
            <div
              aria-label="Canvas tabs"
              className="canvas-tabs"
              role="tablist"
            >
              <button
                aria-controls="graph-panel"
                aria-selected={canvasView === "graph"}
                onClick={() => {
                  setCanvasView("graph");
                }}
                role="tab"
                type="button"
              >
                <Network aria-hidden="true" size={14} />
                Graph view
              </button>
              <button
                aria-controls="welcome-note-panel"
                aria-selected={canvasView === "note"}
                id="welcome-note-tab"
                onClick={() => {
                  setCanvasView("note");
                }}
                role="tab"
                type="button"
              >
                <FileText aria-hidden="true" size={14} />
                {document.path.split("/").at(-1) ?? "Note.md"}
                <span className="tab-close" aria-hidden="true">
                  ×
                </span>
              </button>
            </div>
            <button
              aria-label="Open new view"
              className="new-tab-button"
              type="button"
            >
              <Plus aria-hidden="true" size={15} />
            </button>
          </div>
          {canvasView === "graph" ? (
            <div aria-label="Graph view" id="graph-panel" role="tabpanel">
              <KnowledgeGraph graph={graph} />
            </div>
          ) : (
            <div
              aria-labelledby="welcome-note-tab"
              id="welcome-note-panel"
              role="tabpanel"
            >
              <MarkdownEditor
                document={document}
                onSave={async (content) => {
                  const saved = await editorClient.saveNote(
                    document.path,
                    content,
                  );
                  setDocument(saved);
                  return saved;
                }}
              />
            </div>
          )}
        </Pane>
        <Pane
          aria-label="Assistant"
          className="assistant-region"
          collapsed={assistant.collapsed}
        >
          <AssistantPane client={knowledgeClient} models={models} />
        </Pane>
      </div>
    </section>
  );
}

export function AppShell({
  editorClient = ipcEditorClient,
  folderPicker,
  initialMode = "Ingest",
  initialSettings,
  knowledgeClient = ipcKnowledgeClient,
  online = true,
  settingsClient = ipcSettingsClient,
  setupComplete,
}: AppShellProps) {
  const [mode, setMode] = useState<PrimaryMode>(
    initialSettings?.activeMode ?? initialMode,
  );
  const [setupDone, setSetupDone] = useState(
    setupComplete ?? initialSettings?.setupComplete ?? false,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState(initialSettings ?? emptySettings);
  const [knowledgeRevision, setKnowledgeRevision] = useState(0);
  const [layout, setLayout] = useState(() =>
    restoreLayout(
      initialSettings?.layoutJson ?? serializeLayout(DEFAULT_LAYOUT),
    ),
  );
  const tabRefs = useRef<Record<PrimaryMode, HTMLButtonElement | null>>({
    Ingest: null,
    Retrieve: null,
  });
  const commands = useMemo(
    () =>
      new CommandRegistry(
        createDefaultCommands((id) => {
          setSettingsOpen(false);
          setMode(id === "add-source" ? "Ingest" : "Retrieve");
        }),
      ),
    [],
  );

  useEffect(() => {
    if (setupComplete !== undefined || initialSettings !== undefined)
      return undefined;
    let cancelled = false;
    void settingsClient
      .getSettings()
      .then((restored) => {
        if (cancelled) return;
        setSettings(restored);
        setMode(restored.activeMode);
        setLayout(restoreLayout(restored.layoutJson));
        setSetupDone(restored.setupComplete);
      })
      .catch(() => {
        // The onboarding gate remains usable when native settings are unavailable.
      });
    return () => {
      cancelled = true;
    };
  }, [initialSettings, settingsClient, setupComplete]);

  function persistWorkspace(
    nextMode: PrimaryMode,
    nextLayout: WorkspaceLayout,
  ) {
    void settingsClient
      .saveWorkspaceState(nextMode, serializeLayout(nextLayout))
      .then(setSettings)
      .catch(() => {
        // Local interaction remains available; a later action can retry persistence.
      });
  }

  function selectMode(nextMode: PrimaryMode, focus = false) {
    setSettingsOpen(false);
    setMode(nextMode);
    if (setupDone) persistWorkspace(nextMode, layout);
    if (focus) tabRefs.current[nextMode]?.focus();
  }

  function updateLayout(nextLayout: WorkspaceLayout) {
    setLayout(nextLayout);
    persistWorkspace(mode, nextLayout);
  }

  function onModeKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const currentIndex = modes.indexOf(mode);
    let nextIndex: number | undefined;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      nextIndex = (currentIndex + 1) % modes.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      nextIndex = (currentIndex - 1 + modes.length) % modes.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = modes.length - 1;
    if (nextIndex !== undefined) {
      event.preventDefault();
      const nextMode = modes[nextIndex];
      if (nextMode) selectMode(nextMode, true);
    }
  }

  if (!setupDone) {
    return (
      <>
        <DesktopStyles />
        <Onboarding
          client={settingsClient}
          {...(folderPicker ? { folderPicker } : {})}
          onComplete={(completed) => {
            setSettings(completed);
            setMode(completed.activeMode);
            setLayout(restoreLayout(completed.layoutJson));
            setSetupDone(true);
          }}
        />
      </>
    );
  }

  const vaultName = settings.vaultName ?? "Local workspace";
  return (
    <CommandPaletteHost registry={commands}>
      <DesktopStyles />
      <main aria-label="Knowledge workspace" className="app-shell">
        <header className="app-header" data-ui="desktop-chrome">
          <div className="app-identity">
            <ProductMark />
            <span className="vault-breadcrumb">/</span>
            <span>{vaultName}</span>
          </div>
          <div aria-label="Primary mode" className="mode-switch" role="tablist">
            {modes.map((candidate) => (
              <button
                aria-controls={`${candidate.toLowerCase()}-surface`}
                aria-selected={candidate === mode}
                className="ko-focus-ring"
                id={`${candidate.toLowerCase()}-tab`}
                key={candidate}
                onClick={() => {
                  selectMode(candidate);
                }}
                onKeyDown={onModeKeyDown}
                ref={(node) => {
                  tabRefs.current[candidate] = node;
                }}
                role="tab"
                tabIndex={candidate === mode ? 0 : -1}
                type="button"
              >
                {candidate}
              </button>
            ))}
          </div>
          <div
            aria-label="Workspace status"
            className="workspace-status"
            role="status"
          >
            <span data-status="ready">
              <Database aria-hidden="true" size={12} />
              Local
            </span>
            <span data-status={online ? "ready" : "offline"}>
              <i />
              {online ? "Online" : "Offline"}
            </span>
            <span data-status="ready">Index ready</span>
            <button
              aria-label={settingsOpen ? "Close settings" : "Settings"}
              className="settings-button"
              onClick={() => {
                setSettingsOpen((current) => !current);
              }}
              type="button"
            >
              <Settings2 aria-hidden="true" size={16} />
            </button>
          </div>
        </header>
        {settingsOpen ? (
          <AISettings
            client={settingsClient}
            initial={settings}
            onChange={setSettings}
          />
        ) : (
          <div
            aria-labelledby={`${mode.toLowerCase()}-tab`}
            className="primary-surface"
            id={`${mode.toLowerCase()}-surface`}
            role="tabpanel"
          >
            {mode === "Ingest" ? (
              <IngestSurface
                client={knowledgeClient}
                onCaptured={() => {
                  setKnowledgeRevision((current) => current + 1);
                }}
                vaultName={settings.vaultName ?? "Local workspace"}
              />
            ) : (
              <RetrieveSurface
                editorClient={editorClient}
                key={knowledgeRevision}
                knowledgeClient={knowledgeClient}
                layout={layout}
                models={settings.ai.models.filter(
                  (model) =>
                    model.enabled &&
                    settings.providers.some(
                      (provider) =>
                        provider.provider === model.provider &&
                        provider.health === "healthy",
                    ),
                )}
                onLayoutChange={updateLayout}
                vaultName={vaultName}
              />
            )}
          </div>
        )}
      </main>
    </CommandPaletteHost>
  );
}
