import {
  useEffect,
  useMemo,
  useRef,
  useState,
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

export type PrimaryMode = "Ingest" | "Retrieve";

interface AppShellProps {
  editorClient?: EditorClient;
  folderPicker?: FolderPicker;
  initialMode?: PrimaryMode;
  initialSettings?: SettingsSnapshot;
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

function IngestSurface({ vaultName }: { vaultName: string }) {
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
        <div className="ingest-composer-shell">
          <label className="ingest-composer">
            <span className="visually-hidden">Add knowledge</span>
            <textarea
              aria-label="Add knowledge"
              placeholder="Paste a YouTube link, article, meeting note, or write something…"
              rows={4}
            />
          </label>
          <div className="composer-toolbar">
            <div className="composer-actions">
              <button
                aria-label="Attach files"
                className="icon-text-button"
                type="button"
              >
                <Paperclip aria-hidden="true" size={16} />
                <span>Attach files</span>
              </button>
              <button className="composer-select" type="button">
                <Sparkles aria-hidden="true" size={15} />
                <span>Auto organize</span>
                <ChevronDown aria-hidden="true" size={13} />
              </button>
            </div>
            <button
              aria-label="Process source"
              className="composer-submit"
              type="button"
            >
              <ArrowUp aria-hidden="true" size={17} strokeWidth={2.2} />
            </button>
          </div>
        </div>
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

const graphNodes = [
  {
    id: "knowledge",
    x: 410,
    y: 260,
    r: 18,
    label: "Knowledge OS",
    tone: "accent",
  },
  { id: "agents", x: 295, y: 155, r: 11, label: "AI Agents", tone: "bright" },
  { id: "rag", x: 515, y: 148, r: 10, label: "RAG", tone: "bright" },
  { id: "research", x: 235, y: 305, r: 12, label: "Research", tone: "bright" },
  { id: "systems", x: 565, y: 330, r: 11, label: "Systems", tone: "bright" },
  { id: "books", x: 345, y: 390, r: 8, label: "Books", tone: "muted" },
  { id: "meetings", x: 470, y: 410, r: 8, label: "Meetings", tone: "muted" },
  {
    id: "embeddings",
    x: 625,
    y: 205,
    r: 7,
    label: "Embeddings",
    tone: "muted",
  },
  { id: "python", x: 170, y: 190, r: 7, label: "Python", tone: "muted" },
] as const;

const graphEdges = [
  ["knowledge", "agents"],
  ["knowledge", "rag"],
  ["knowledge", "research"],
  ["knowledge", "systems"],
  ["knowledge", "books"],
  ["knowledge", "meetings"],
  ["agents", "python"],
  ["rag", "embeddings"],
  ["research", "books"],
  ["systems", "meetings"],
  ["agents", "research"],
  ["rag", "systems"],
] as const;

function KnowledgeGraph() {
  const byId = new Map(graphNodes.map((node) => [node.id, node]));
  return (
    <div className="graph-view">
      <div className="graph-heading">
        <div>
          <span className="eyebrow">LOCAL GRAPH</span>
          <h2>Your knowledge, connected</h2>
          <p>9 concepts · 12 relationships · updated just now</p>
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
            {graphEdges.map(([from, to]) => {
              const source = byId.get(from);
              const target = byId.get(to);
              if (!source || !target) return null;
              return (
                <line
                  key={`${from}-${to}`}
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

function ExplorerPane({ vaultName }: { vaultName: string }) {
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
        <input aria-label="Filter knowledge" placeholder="Filter knowledge" />
        <kbd>⌘F</kbd>
      </label>
      <nav aria-label="Knowledge library" className="knowledge-tree">
        <div className="tree-root">
          <ChevronDown aria-hidden="true" size={14} />
          <span>{vaultName.toUpperCase()}</span>
        </div>
        <ul role="tree">
          <li role="treeitem">
            <span className="tree-row tree-row-active">
              <ChevronRight aria-hidden="true" size={13} />
              <FolderOpen aria-hidden="true" size={15} />
              <span>Inbox</span>
              <b>3</b>
            </span>
          </li>
          <li role="treeitem">
            <span className="tree-row">
              <ChevronRight aria-hidden="true" size={13} />
              <Folder aria-hidden="true" size={15} />
              <span>Daily notes</span>
            </span>
          </li>
          <li aria-expanded="true" role="treeitem">
            <span className="tree-row">
              <ChevronDown aria-hidden="true" size={13} />
              <FolderOpen aria-hidden="true" size={15} />
              <span>Projects</span>
            </span>
            <ul role="group">
              <li role="treeitem">
                <span className="tree-row tree-child">
                  <FileText aria-hidden="true" size={14} />
                  <span>Knowledge OS</span>
                  <i className="tree-status" />
                </span>
              </li>
              <li role="treeitem">
                <span className="tree-row tree-child">
                  <FileText aria-hidden="true" size={14} />
                  <span>AI Research</span>
                </span>
              </li>
            </ul>
          </li>
          <li aria-expanded="true" role="treeitem">
            <span className="tree-row">
              <ChevronDown aria-hidden="true" size={13} />
              <FolderOpen aria-hidden="true" size={15} />
              <span>Areas</span>
            </span>
            <ul role="group">
              <li role="treeitem">
                <span className="tree-row tree-child">
                  <FileText aria-hidden="true" size={14} />
                  <span>Work</span>
                </span>
              </li>
              <li role="treeitem">
                <span className="tree-row tree-child">
                  <FileText aria-hidden="true" size={14} />
                  <span>Study</span>
                </span>
              </li>
            </ul>
          </li>
          <li role="treeitem">
            <span className="tree-row">
              <ChevronRight aria-hidden="true" size={13} />
              <Folder aria-hidden="true" size={15} />
              <span>Research</span>
            </span>
          </li>
          <li role="treeitem">
            <span className="tree-row">
              <ChevronRight aria-hidden="true" size={13} />
              <Folder aria-hidden="true" size={15} />
              <span>Books</span>
            </span>
          </li>
          <li role="treeitem">
            <span className="tree-row">
              <ChevronRight aria-hidden="true" size={13} />
              <Folder aria-hidden="true" size={15} />
              <span>Papers</span>
            </span>
          </li>
          <li role="treeitem">
            <span className="tree-row">
              <ChevronRight aria-hidden="true" size={13} />
              <Folder aria-hidden="true" size={15} />
              <span>Sources</span>
            </span>
          </li>
        </ul>
      </nav>
      <footer className="explorer-footer">
        <span>
          <CircleDot aria-hidden="true" size={13} /> Local vault
        </span>
        <span>42 notes</span>
      </footer>
    </div>
  );
}

function AssistantPane({ models }: { models: ModelProfile[] }) {
  const [question, setQuestion] = useState("");
  const [modelId, setModelId] = useState(models[0]?.id ?? "");
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
          <span>Connect my recent research</span>
          <span>What did I learn about agents?</span>
          <span>Summarize this project</span>
        </div>
      </div>
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
            value={modelId}
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
            disabled={!modelId || !question.trim()}
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
          <ExplorerPane vaultName={vaultName} />
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
                Welcome.md
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
              <KnowledgeGraph />
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
          <AssistantPane models={models} />
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
                vaultName={settings.vaultName ?? "Local workspace"}
              />
            ) : (
              <RetrieveSurface
                editorClient={editorClient}
                layout={layout}
                models={settings.ai.models}
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
