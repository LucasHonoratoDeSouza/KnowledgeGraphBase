import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
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
  Sparkles,
  Video,
  X,
} from "lucide-react";

import { DesktopStyles, Pane, ProductMark } from "@knowledge-os/ui";

import {
  CommandPaletteHost,
  CommandRegistry,
  createDefaultCommands,
} from "../commands";
import { Select, type SelectOption } from "../controls";
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
  PANE_BOUNDS,
  resizePane,
  restoreLayout,
  serializeLayout,
  togglePane,
  type WorkspaceLayout,
} from "../workspace/layout";
import { useShortcuts } from "../shortcuts";
import { WindowControls, WindowResizeHandles } from "./WindowControls";
import {
  beginWindowDrag,
  detectWindowChrome,
  useWindowMaximized,
  type WindowChromeClient,
} from "./windowChrome";
import {
  AmbientGraph,
  KnowledgeGraph,
  ipcKnowledgeClient,
  type AssistantAnswer,
  type GraphView,
  type KnowledgeClient,
  type LibrarianOutcome,
  type LibraryEntry,
  type OrganizeMode,
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
  windowChrome?: WindowChromeClient | null;
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
  ambientGraph: GraphView | null;
  client: KnowledgeClient;
  folders: string[];
  onCaptured: () => void;
  vaultName: string;
}

function IngestSurface({
  ambientGraph,
  client,
  folders,
  onCaptured,
  vaultName,
}: IngestSurfaceProps) {
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "working"; message: string }
    | { kind: "success"; message: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [organize, setOrganize] = useState<OrganizeMode>("auto");
  const [organizeFolder, setOrganizeFolder] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  // Folders arrive as full paths. Showing only the leaf and indenting by depth
  // keeps deep paths readable in the menu; the trigger still names the whole
  // path so the chosen destination is never ambiguous (#31).
  const organizeOptions = useMemo<SelectOption[]>(() => {
    const folderOptions = folders.map((folder) => {
      const segments = folder.split("/");
      return {
        depth: segments.length - 1,
        label: segments[segments.length - 1] ?? folder,
        selectedLabel: `File in ${folder}`,
        title: folder,
        value: folder,
      };
    });
    return [
      { label: "Auto organize", value: "auto" },
      ...folderOptions,
      { label: "Don't organize", value: "none" },
    ];
  }, [folders]);

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
        organize,
        organizeFolder: organize === "folder" ? organizeFolder : "",
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
      <AmbientGraph graph={ambientGraph} />
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
              <Select
                aria-label="Organize this capture"
                className="composer-select"
                icon={<Sparkles aria-hidden="true" size={15} />}
                onChange={(value) => {
                  if (value === "auto" || value === "none") {
                    setOrganize(value);
                    setOrganizeFolder("");
                    return;
                  }
                  setOrganize("folder");
                  setOrganizeFolder(value);
                }}
                options={organizeOptions}
                value={organize === "folder" ? organizeFolder : organize}
              />
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
  searchFocusRequest: number;
  vaultName: string;
}

/**
 * A draggable splitter between two panes (#12). Pointer moves resize live and
 * every change flows through the same persisted layout path as the existing
 * step buttons, so a dragged width survives a restart too.
 */
function PaneDivider({
  collapsed,
  label,
  onDragEnd,
  onDragStart,
  onResize,
  pane,
  width,
}: {
  collapsed: boolean;
  label: string;
  onDragEnd?: () => void;
  onDragStart?: () => void;
  onResize: (delta: number) => void;
  pane: "explorer" | "assistant";
  width: number;
}) {
  const last = useRef<number | null>(null);
  if (collapsed) return null;
  return (
    <div
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemax={PANE_BOUNDS[pane].max}
      aria-valuemin={PANE_BOUNDS[pane].min}
      aria-valuenow={width}
      className="pane-divider"
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          onResize(-16);
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          onResize(16);
        }
      }}
      onPointerDown={(event) => {
        event.preventDefault();
        last.current = event.clientX;
        event.currentTarget.setPointerCapture(event.pointerId);
        onDragStart?.();
      }}
      onPointerMove={(event) => {
        if (last.current === null) return;
        const delta = event.clientX - last.current;
        if (delta === 0) return;
        last.current = event.clientX;
        onResize(delta);
      }}
      onPointerUp={(event) => {
        last.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
        onDragEnd?.();
      }}
      role="separator"
      tabIndex={0}
    />
  );
}

const welcomeNote: NoteDocument = {
  path: "notes/Welcome.md",
  content:
    "# Knowledge OS\n\n## Current threads\n\n- Local-first knowledge systems\n- Retrieval and grounded agents\n- Notes from books and papers\n\nConnected to [[AI Research]] and [[Systems]].\n",
  diagnostics: [],
};

interface TreeState {
  activeFolder: string;
  collapsed: ReadonlySet<string>;
  dropTarget: string | null;
  onContextMenu: (
    event: ReactMouseEvent<HTMLElement>,
    entry: LibraryEntry,
  ) => void;
  onDropInto: (destination: string) => void;
  onDragEnterFolder: (path: string | null) => void;
  onDragStartEntry: (path: string) => void;
  onOpen: (path: string) => void;
  onSelectFolder: (path: string) => void;
  onToggleFolder: (path: string) => void;
  openNotePath: string;
}

/** Shared drag/menu wiring for one row, so every row kind behaves the same. */
function rowHandlers(entry: LibraryEntry, tree: TreeState) {
  return {
    draggable: true,
    onContextMenu: (event: ReactMouseEvent<HTMLElement>) => {
      tree.onContextMenu(event, entry);
    },
    onDragStart: (event: ReactDragEvent<HTMLElement>) => {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", entry.path);
      tree.onDragStartEntry(entry.path);
    },
    onDragEnd: () => {
      tree.onDragEnterFolder(null);
    },
  };
}

function LibraryRows({
  entries,
  tree,
}: {
  entries: LibraryEntry[];
  tree: TreeState;
}) {
  return (
    <>
      {entries.map((entry) => {
        const expanded = !tree.collapsed.has(entry.path);
        if (entry.kind === "markdown") {
          return (
            <li key={entry.path} role="treeitem">
              <button
                aria-current={
                  entry.path === tree.openNotePath ? "true" : undefined
                }
                className={`tree-row tree-file-button${
                  entry.path === tree.openNotePath ? " tree-row-active" : ""
                }`}
                onClick={() => {
                  tree.onOpen(entry.path);
                }}
                type="button"
                {...rowHandlers(entry, tree)}
              >
                <FileText
                  aria-hidden="true"
                  className="tree-icon tree-icon-note"
                  size={14}
                />
                <span>{entry.name.replace(/\.md$/i, "")}</span>
              </button>
            </li>
          );
        }
        if (entry.kind === "attachment") {
          return (
            <li key={entry.path} role="treeitem">
              <span className="tree-row" {...rowHandlers(entry, tree)}>
                <File
                  aria-hidden="true"
                  className="tree-icon tree-icon-attachment"
                  size={14}
                />
                <span>{entry.name}</span>
              </span>
            </li>
          );
        }
        return (
          <li aria-expanded={expanded} key={entry.path} role="treeitem">
            <button
              className={`tree-row tree-folder-button${
                entry.path === tree.activeFolder ? " tree-row-target" : ""
              }${entry.path === tree.dropTarget ? " tree-row-drop" : ""}`}
              onClick={() => {
                tree.onToggleFolder(entry.path);
                tree.onSelectFolder(entry.path);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                tree.onDragEnterFolder(entry.path);
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                tree.onDropInto(entry.path);
              }}
              type="button"
              {...rowHandlers(entry, tree)}
            >
              {expanded ? (
                <ChevronDown
                  aria-hidden="true"
                  className="tree-chevron"
                  size={13}
                />
              ) : (
                <ChevronRight
                  aria-hidden="true"
                  className="tree-chevron"
                  size={13}
                />
              )}
              {expanded ? (
                <FolderOpen
                  aria-hidden="true"
                  className="tree-icon tree-icon-folder"
                  size={15}
                />
              ) : (
                <Folder
                  aria-hidden="true"
                  className="tree-icon tree-icon-folder"
                  size={15}
                />
              )}
              <span>{entry.name}</span>
            </button>
            {expanded && entry.children.length > 0 ? (
              <ul role="group">
                <LibraryRows entries={entry.children} tree={tree} />
              </ul>
            ) : null}
          </li>
        );
      })}
    </>
  );
}

/**
 * One ranked row per document: FTS returns a hit per chunk, and repeating the
 * same note three times reads like a broken search.
 */
function documentHits(result: RetrievalResult) {
  const best = new Map<string, RetrievalResult["hits"][number]>();
  for (const hit of result.hits) {
    if (!best.has(hit.path)) best.set(hit.path, hit);
  }
  return [...best.values()];
}

/** Resolves a `[[Wiki Link]]` target to a note path in the vault, if any. */
function findNoteByName(
  entries: LibraryEntry[],
  target: string,
): string | undefined {
  const wanted = target.trim().toLowerCase();
  for (const entry of entries) {
    if (
      entry.kind === "markdown" &&
      entry.name.replace(/\.md$/i, "").toLowerCase() === wanted
    ) {
      return entry.path;
    }
    const nested = findNoteByName(entry.children, target);
    if (nested) return nested;
  }
  return undefined;
}

/** Every folder in the tree, deepest paths included, for placement pickers. */
function folderPaths(entries: LibraryEntry[]): string[] {
  return entries.flatMap((entry) =>
    entry.kind === "folder" ? [entry.path, ...folderPaths(entry.children)] : [],
  );
}

function collapsedStorageKey(vaultName: string) {
  return `knowledge-os:explorer:collapsed:${vaultName}`;
}

function restoreCollapsed(vaultName: string): Set<string> {
  try {
    const saved = localStorage.getItem(collapsedStorageKey(vaultName));
    return new Set(saved ? (JSON.parse(saved) as string[]) : []);
  } catch {
    return new Set();
  }
}

/**
 * Right-click menu for one tree row. Keyboard reachable through the row's own
 * context-menu key, dismissed with Escape or any outside click.
 */
function ExplorerContextMenu({
  entry,
  onClose,
  onDelete,
  onNewFolder,
  onNewNote,
  onOpen,
  onRename,
  onReorganize,
  x,
  y,
}: {
  entry: LibraryEntry;
  onClose: () => void;
  onDelete: (entry: LibraryEntry) => void;
  onNewFolder: (entry: LibraryEntry) => void;
  onNewNote: (entry: LibraryEntry) => void;
  onOpen: (path: string) => void;
  onRename: (entry: LibraryEntry) => void;
  onReorganize: (entry: LibraryEntry) => void;
  x: number;
  y: number;
}) {
  useEffect(() => {
    function dismiss(event: globalThis.KeyboardEvent | globalThis.MouseEvent) {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      onClose();
    }
    document.addEventListener("keydown", dismiss);
    document.addEventListener("mousedown", dismiss);
    return () => {
      document.removeEventListener("keydown", dismiss);
      document.removeEventListener("mousedown", dismiss);
    };
  }, [onClose]);

  const actions: { id: string; label: string; run: () => void }[] = [];
  if (entry.kind === "markdown") {
    actions.push({
      id: "open",
      label: "Open",
      run: () => {
        onOpen(entry.path);
      },
    });
  }
  if (entry.kind === "folder") {
    actions.push(
      {
        id: "new-note",
        label: "New note here",
        run: () => {
          onNewNote(entry);
        },
      },
      {
        id: "new-folder",
        label: "New folder here",
        run: () => {
          onNewFolder(entry);
        },
      },
      {
        id: "reorganize",
        label: "Reorganize this folder",
        run: () => {
          onReorganize(entry);
        },
      },
    );
  }
  if (entry.kind !== "attachment") {
    actions.push({
      id: "rename",
      label: "Rename",
      run: () => {
        onRename(entry);
      },
    });
  }
  actions.push({
    id: "delete",
    label: "Delete",
    run: () => {
      onDelete(entry);
    },
  });

  return (
    <div
      aria-label={`Actions for ${entry.name}`}
      className="explorer-menu"
      onMouseDown={(event) => {
        event.stopPropagation();
      }}
      role="menu"
      style={{ left: x, top: y }}
    >
      {actions.map((action) => (
        <button
          className={action.id === "delete" ? "is-danger" : undefined}
          key={action.id}
          onClick={() => {
            action.run();
            onClose();
          }}
          role="menuitem"
          type="button"
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

interface ExplorerPaneProps {
  crowdedFolders: string[];
  library: LibrarySnapshot | null;
  onCreateFolder: (path: string) => Promise<void>;
  onCreateNote: (path: string) => Promise<void>;
  onDelete: (path: string) => Promise<void>;
  onMove: (path: string, destination: string) => Promise<void>;
  onOpen: (path: string) => void;
  onRename: (path: string, name: string) => Promise<void>;
  onReorganize: (folder: string) => Promise<void>;
  onSearch: (query: string) => void;
  openNotePath: string;
  searchFocusRequest: number;
  searchResult: RetrievalResult | null;
  vaultName: string;
}

interface ContextMenuState {
  entry: LibraryEntry;
  x: number;
  y: number;
}

function ExplorerPane({
  crowdedFolders,
  library,
  onCreateFolder,
  onCreateNote,
  onDelete,
  onMove,
  onOpen,
  onRename,
  onReorganize,
  onSearch,
  openNotePath,
  searchFocusRequest,
  searchResult,
  vaultName,
}: ExplorerPaneProps) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState(() => restoreCollapsed(vaultName));
  const [activeFolder, setActiveFolder] = useState("");
  const [draft, setDraft] = useState<{
    kind: "note" | "folder" | "rename";
    name: string;
    target?: string;
  } | null>(null);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [confirming, setConfirming] = useState<LibraryEntry | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [error, setError] = useState("");
  const searchInput = useRef<HTMLInputElement | null>(null);
  // Where focus came from, so Escape in the field can hand it back (#34).
  const focusOrigin = useRef<HTMLElement | null>(null);
  const defaultEntries: LibraryEntry[] = ["Inbox", "Projects", "Research"].map(
    (name) => ({
      name,
      path: name,
      kind: "folder",
      children: [],
    }),
  );
  const searching = query.trim().length > 0;
  const runSearch = useRef(onSearch);
  useEffect(() => {
    runSearch.current = onSearch;
  }, [onSearch]);

  // Searching as the query settles is what makes the box feel like search
  // instead of a filter that silently does nothing until Enter.
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      runSearch.current("");
      return undefined;
    }
    const timer = setTimeout(() => {
      runSearch.current(trimmed);
    }, 220);
    return () => {
      clearTimeout(timer);
    };
  }, [query]);

  // Cmd/Ctrl+F asks for this field; selecting the existing query means the
  // next keystroke replaces a stale search instead of appending to it.
  useEffect(() => {
    if (searchFocusRequest === 0) return;
    focusOrigin.current =
      document.activeElement instanceof HTMLElement &&
      document.activeElement !== searchInput.current
        ? document.activeElement
        : null;
    searchInput.current?.focus();
    searchInput.current?.select();
  }, [searchFocusRequest]);

  function toggleFolder(path: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(path)) next.add(path);
      try {
        localStorage.setItem(
          collapsedStorageKey(vaultName),
          JSON.stringify([...next]),
        );
      } catch {
        // Collapse state is a convenience; a blocked store must not break the tree.
      }
      return next;
    });
  }

  async function commitDraft() {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) {
      setDraft(null);
      return;
    }
    try {
      setError("");
      if (draft.kind === "rename" && draft.target) {
        await onRename(draft.target, name);
      } else {
        const path = activeFolder ? `${activeFolder}/${name}` : name;
        if (draft.kind === "note") await onCreateNote(path);
        else await onCreateFolder(path);
      }
      setDraft(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }

  async function runAction(action: Promise<void>) {
    try {
      setError("");
      await action;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }

  function dropInto(destination: string) {
    const moving = dragged;
    setDropTarget(null);
    setDragged(null);
    if (!moving || moving === destination) return;
    void runAction(onMove(moving, destination));
  }

  const hits = searchResult ? documentHits(searchResult) : [];
  return (
    <div className="explorer-pane">
      <header className="pane-header">
        <span>EXPLORER</span>
        <div>
          <button
            aria-label="New note"
            className="bare-icon-button"
            onClick={() => {
              setError("");
              setDraft({ kind: "note", name: "" });
            }}
            type="button"
          >
            <FileText aria-hidden="true" size={15} />
          </button>
          <button
            aria-label="New folder"
            className="bare-icon-button"
            onClick={() => {
              setError("");
              setDraft({ kind: "folder", name: "" });
            }}
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
            if (event.key === "Enter" && query.trim()) onSearch(query.trim());
            if (event.key === "Escape") {
              setQuery("");
              focusOrigin.current?.focus();
              focusOrigin.current = null;
            }
          }}
          placeholder="Search knowledge"
          ref={searchInput}
          value={query}
        />
        {searching ? (
          <button
            aria-label="Clear search"
            className="bare-icon-button"
            onClick={() => {
              setQuery("");
            }}
            type="button"
          >
            <X aria-hidden="true" size={13} />
          </button>
        ) : (
          <kbd>⌘F</kbd>
        )}
      </label>
      <nav aria-label="Knowledge library" className="knowledge-tree">
        {searching ? (
          <div className="explorer-results" aria-label="Search results">
            <span className="eyebrow">
              {searchResult
                ? `${String(hits.length)} ${hits.length === 1 ? "MATCH" : "MATCHES"}`
                : "SEARCHING…"}
            </span>
            {hits.map((hit) => (
              <button
                key={hit.chunkId}
                onClick={() => {
                  onOpen(hit.path);
                }}
                type="button"
              >
                <strong>{hit.title}</strong>
                <span>{hit.snippet.replace(/<\/?mark>/g, "")}</span>
                <p>{hit.path}</p>
              </button>
            ))}
            {searchResult && hits.length === 0 ? (
              <p>No local matches.</p>
            ) : null}
          </div>
        ) : (
          <>
            <button
              className={`tree-root${activeFolder === "" ? " tree-row-target" : ""}${
                dropTarget === "" ? " tree-row-drop" : ""
              }`}
              onClick={() => {
                setActiveFolder("");
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDropTarget("");
              }}
              onDrop={(event) => {
                event.preventDefault();
                dropInto("");
              }}
              type="button"
            >
              <ChevronDown aria-hidden="true" size={14} />
              <span>{vaultName.toUpperCase()}</span>
            </button>
            {draft ? (
              <div className="tree-draft">
                {draft.kind !== "folder" ? (
                  <FileText
                    aria-hidden="true"
                    className="tree-icon tree-icon-note"
                    size={14}
                  />
                ) : (
                  <Folder
                    aria-hidden="true"
                    className="tree-icon tree-icon-folder"
                    size={14}
                  />
                )}
                <input
                  aria-label={
                    draft.kind === "rename"
                      ? "New name"
                      : draft.kind === "note"
                        ? "New note name"
                        : "New folder name"
                  }
                  autoFocus
                  onChange={(event) => {
                    setDraft({ ...draft, name: event.currentTarget.value });
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void commitDraft();
                    if (event.key === "Escape") {
                      setDraft(null);
                      setError("");
                    }
                  }}
                  placeholder={
                    draft.kind === "rename"
                      ? "New name"
                      : draft.kind === "note"
                        ? `Note name in ${activeFolder || vaultName}`
                        : `Folder name in ${activeFolder || vaultName}`
                  }
                  value={draft.name}
                />
              </div>
            ) : null}
            {error ? (
              <p className="explorer-error" role="alert">
                {error}
              </p>
            ) : null}
            <ul role="tree">
              <LibraryRows
                entries={library?.entries ?? defaultEntries}
                tree={{
                  activeFolder,
                  collapsed,
                  dropTarget,
                  onContextMenu: (event, entry) => {
                    event.preventDefault();
                    setError("");
                    setMenu({ entry, x: event.clientX, y: event.clientY });
                  },
                  onDragEnterFolder: setDropTarget,
                  onDragStartEntry: setDragged,
                  onDropInto: dropInto,
                  onOpen,
                  onSelectFolder: setActiveFolder,
                  onToggleFolder: toggleFolder,
                  openNotePath,
                }}
              />
            </ul>
          </>
        )}
      </nav>
      {confirming ? (
        <div
          className="explorer-confirm"
          role="alertdialog"
          aria-label="Confirm delete"
        >
          <p>
            Delete <strong>{confirming.name}</strong>
            {confirming.kind === "folder" ? " and everything inside it" : ""}?
          </p>
          <div>
            <button
              className="secondary-button"
              onClick={() => {
                setConfirming(null);
              }}
              type="button"
            >
              Cancel
            </button>
            <button
              className="danger-button"
              onClick={() => {
                const target = confirming;
                setConfirming(null);
                void runAction(onDelete(target.path));
              }}
              type="button"
            >
              Delete
            </button>
          </div>
        </div>
      ) : null}
      {crowdedFolders.length > 0 && !searching ? (
        <p className="explorer-suggestion" role="status">
          <Sparkles aria-hidden="true" size={12} />
          <span>{crowdedFolders[0]} is getting crowded.</span>
          <button
            className="text-button"
            onClick={() => {
              const folder = crowdedFolders[0];
              if (folder) void runAction(onReorganize(folder));
            }}
            type="button"
          >
            Reorganize
          </button>
        </p>
      ) : null}
      <footer className="explorer-footer">
        <span>
          <CircleDot aria-hidden="true" size={13} /> Local vault
        </span>
        <span>{library?.noteCount ?? 0} notes</span>
      </footer>
      {menu ? (
        <ExplorerContextMenu
          entry={menu.entry}
          onClose={() => {
            setMenu(null);
          }}
          onDelete={(entry) => {
            setConfirming(entry);
          }}
          onNewFolder={(entry) => {
            setActiveFolder(entry.path);
            setDraft({ kind: "folder", name: "" });
          }}
          onNewNote={(entry) => {
            setActiveFolder(entry.path);
            setDraft({ kind: "note", name: "" });
          }}
          onOpen={onOpen}
          onRename={(entry) => {
            setDraft({
              kind: "rename",
              name: entry.name.replace(/\.md$/i, ""),
              target: entry.path,
            });
          }}
          onReorganize={(entry) => {
            void runAction(onReorganize(entry.path));
          }}
          x={menu.x}
          y={menu.y}
        />
      ) : null}
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
  searchFocusRequest,
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
  const [noteDirty, setNoteDirty] = useState(false);
  const [searchResult, setSearchResult] = useState<RetrievalResult | null>(
    null,
  );
  const [crowded, setCrowded] = useState<string[]>([]);
  const [librarian, setLibrarian] = useState<LibrarianOutcome | null>(null);
  // The workspace grid animates column-width changes for collapse/expand
  // (#35), but that same transition makes an active divider drag lag a
  // frame behind the pointer and race the value a test reads right after
  // pointerup (#43) — suppress it only while a drag is in progress.
  const [resizingPane, setResizingPane] = useState(false);

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
        const nextCrowded = await knowledgeClient
          .crowdedFolders()
          .catch(() => []);
        if (cancelled) return;
        setLibrary(nextLibrary);
        setGraph(nextGraph);
        setCrowded(nextCrowded);
      })
      .catch(() => {
        // The native vault can still be opened manually when indexing is unavailable.
      });
    return () => {
      cancelled = true;
    };
  }, [knowledgeClient]);

  useEffect(() => {
    if (searchFocusRequest === 0 || !explorer.collapsed) return;
    onLayoutChange(togglePane(layout, "explorer"));
    // The layout is read once per request; re-running on every layout change
    // would fight a deliberate collapse right after the shortcut.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchFocusRequest]);

  async function openDocument(path: string) {
    try {
      setDocument(await editorClient.openNote(path));
      setCanvasView("note");
    } catch {
      // Attachments remain visible but only Markdown opens in the editor.
    }
  }

  async function refreshLibrary() {
    setLibrary(await knowledgeClient.getLibrary());
  }

  async function createNote(path: string) {
    const notePath = /\.md$/i.test(path) ? path : `${path}.md`;
    const title = (notePath.split("/").at(-1) ?? notePath).replace(
      /\.md$/i,
      "",
    );
    setDocument(await editorClient.saveNote(notePath, `# ${title}\n\n`));
    setCanvasView("note");
    await refreshLibrary();
  }

  async function createFolder(path: string) {
    setLibrary(await knowledgeClient.createFolder(path));
  }

  async function renameEntry(path: string, name: string) {
    setLibrary(await knowledgeClient.renameEntry(path, name));
    if (document.path === path) {
      const parent = path.includes("/")
        ? path.slice(0, path.lastIndexOf("/"))
        : "";
      const file = /\.md$/i.test(name) ? name : `${name}.md`;
      await openDocument(parent ? `${parent}/${file}` : file);
    }
  }

  async function deleteEntry(path: string) {
    setLibrary(await knowledgeClient.deleteEntry(path));
  }

  async function moveEntry(path: string, destination: string) {
    setLibrary(await knowledgeClient.moveEntry(path, destination));
  }

  async function reorganizeFolder(folder: string) {
    const outcome = await knowledgeClient.reorganizeFolder(folder);
    setLibrary(outcome.library);
    setLibrarian(outcome);
    setCrowded(await knowledgeClient.crowdedFolders());
  }

  async function undoReorganization() {
    const outcome = await knowledgeClient.undoReorganization();
    setLibrary(outcome.library);
    setLibrarian(null);
    setCrowded(await knowledgeClient.crowdedFolders());
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
        className={
          resizingPane ? "retrieve-workspace resizing" : "retrieve-workspace"
        }
        style={{
          gridTemplateColumns: `${explorerColumn} ${
            explorer.collapsed ? "0px" : "3px"
          } minmax(320px, 1fr) ${assistant.collapsed ? "0px" : "3px"} ${assistantColumn}`,
        }}
      >
        <Pane
          aria-label="Explorer"
          className="explorer-region"
          collapsed={explorer.collapsed}
        >
          <ExplorerPane
            crowdedFolders={crowded}
            library={library}
            onCreateFolder={createFolder}
            onCreateNote={createNote}
            onDelete={deleteEntry}
            onMove={moveEntry}
            onRename={renameEntry}
            onReorganize={reorganizeFolder}
            onOpen={(path) => void openDocument(path)}
            onSearch={(query) => {
              if (!query) {
                setSearchResult(null);
                return;
              }
              void knowledgeClient
                .search(query)
                .then(setSearchResult)
                .catch(() => {
                  setSearchResult({
                    plan: {
                      lexicalQuery: query,
                      filters: {},
                      expandGraph: false,
                    },
                    hits: [],
                    lexicalFallback: true,
                  });
                });
            }}
            openNotePath={canvasView === "note" ? document.path : ""}
            searchFocusRequest={searchFocusRequest}
            searchResult={searchResult}
            vaultName={vaultName}
          />
        </Pane>
        <PaneDivider
          collapsed={explorer.collapsed}
          label="Resize Explorer"
          pane="explorer"
          width={explorer.width}
          onDragEnd={() => {
            setResizingPane(false);
          }}
          onDragStart={() => {
            setResizingPane(true);
          }}
          onResize={(delta) => {
            onLayoutChange(
              resizePane(layout, "explorer", explorer.width + delta),
            );
          }}
        />
        <Pane aria-label="Knowledge canvas" className="canvas-region">
          {librarian ? (
            <div className="librarian-report" role="status">
              <span>
                Reorganized {librarian.folder} — {librarian.moves.length}{" "}
                {librarian.moves.length === 1 ? "note" : "notes"} moved
                {librarian.skipped.length > 0
                  ? `, ${String(librarian.skipped.length)} skipped`
                  : ""}
                .
              </span>
              <button
                className="secondary-button"
                onClick={() => void undoReorganization()}
                type="button"
              >
                Undo
              </button>
              <button
                aria-label="Dismiss reorganization report"
                className="bare-icon-button"
                onClick={() => {
                  setLibrarian(null);
                }}
                type="button"
              >
                <X aria-hidden="true" size={13} />
              </button>
            </div>
          ) : null}
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
                {noteDirty ? (
                  // Kept out of the accessible name so the tab stays
                  // addressable as the note; the editor's live status region
                  // is what announces unsaved changes.
                  <span
                    aria-hidden="true"
                    className="tab-dirty"
                    title="Unsaved changes"
                  />
                ) : (
                  <span className="tab-close" aria-hidden="true">
                    ×
                  </span>
                )}
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
              <KnowledgeGraph
                graph={graph}
                onOpenNote={(path) => {
                  void openDocument(path);
                }}
              />
            </div>
          ) : (
            <div
              aria-labelledby="welcome-note-tab"
              id="welcome-note-panel"
              role="tabpanel"
            >
              <MarkdownEditor
                document={document}
                onDirtyChange={setNoteDirty}
                onOpenNote={(target) => {
                  const match = findNoteByName(library?.entries ?? [], target);
                  if (match) void openDocument(match);
                }}
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
        <PaneDivider
          collapsed={assistant.collapsed}
          label="Resize Assistant"
          pane="assistant"
          width={assistant.width}
          onDragEnd={() => {
            setResizingPane(false);
          }}
          onDragStart={() => {
            setResizingPane(true);
          }}
          onResize={(delta) => {
            onLayoutChange(
              resizePane(layout, "assistant", assistant.width - delta),
            );
          }}
        />
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
  windowChrome = detectWindowChrome(),
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
  const [captureFolders, setCaptureFolders] = useState<string[]>([]);
  const [ambientGraph, setAmbientGraph] = useState<GraphView | null>(null);
  const [layout, setLayout] = useState(() =>
    restoreLayout(
      initialSettings?.layoutJson ?? serializeLayout(DEFAULT_LAYOUT),
    ),
  );
  const tabRefs = useRef<Record<PrimaryMode, HTMLButtonElement | null>>({
    Ingest: null,
    Retrieve: null,
  });
  const maximized = useWindowMaximized(windowChrome);
  // Cmd/Ctrl+F runs the Search Knowledge command, which lands in Retrieve and
  // asks the Explorer for focus; the surface itself opens a collapsed pane.
  const [searchFocusRequest, setSearchFocusRequest] = useState(0);
  const commands = useMemo(
    () =>
      new CommandRegistry(
        createDefaultCommands((id) => {
          setSettingsOpen(false);
          if (id === "search-knowledge") {
            setMode("Retrieve");
            setSearchFocusRequest((current) => current + 1);
            return;
          }
          setMode(id === "add-source" ? "Ingest" : "Retrieve");
        }),
      ),
    [],
  );
  // Every chord a command declares becomes a live binding (#34), so adding
  // one later is a single entry in the registry.
  const commandBindings = useMemo(
    () =>
      Object.fromEntries(
        commands.all().flatMap((command) =>
          command.shortcut
            ? [
                [
                  command.shortcut,
                  () => {
                    commands.execute(command.id);
                  },
                ] as const,
              ]
            : [],
        ),
      ),
    [commands],
  );
  useShortcuts(commandBindings);

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

  // The composer offers the vault's real folders, so "file it here" is a
  // choice between places that exist rather than free text.
  useEffect(() => {
    if (!setupDone) return undefined;
    let cancelled = false;
    void knowledgeClient
      .getLibrary()
      .then((library) => {
        if (cancelled) return;
        setCaptureFolders(folderPaths(library.entries));
      })
      .catch(() => {
        // The composer still works with automatic placement only.
      });
    return () => {
      cancelled = true;
    };
  }, [knowledgeClient, knowledgeRevision, setupDone]);

  // The ambient layer only loads for the surface that shows it (#35), so
  // opening straight into Retrieve costs nothing extra.
  useEffect(() => {
    if (!setupDone || mode !== "Ingest") return undefined;
    let cancelled = false;
    void knowledgeClient
      .getGraph()
      .then((graph) => {
        if (!cancelled) setAmbientGraph(graph);
      })
      .catch(() => {
        // A still-building index simply leaves the surface as it was.
      });
    return () => {
      cancelled = true;
    };
  }, [knowledgeClient, knowledgeRevision, mode, setupDone]);

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
        {/* Onboarding fills a frameless window too, so it needs its own drag
            strip and resize handles or the window becomes immovable. */}
        <WindowResizeHandles chrome={windowChrome} maximized={maximized} />
        {windowChrome ? (
          <div
            className="onboarding-window-chrome"
            data-window-drag-region="true"
            onMouseDown={(event) => {
              beginWindowDrag(windowChrome, event);
            }}
          >
            <WindowControls chrome={windowChrome} maximized={maximized} />
          </div>
        ) : null}
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
      <main
        aria-label="Knowledge workspace"
        className="app-shell"
        data-window-maximized={windowChrome ? String(maximized) : undefined}
      >
        <WindowResizeHandles chrome={windowChrome} maximized={maximized} />
        <header
          className="app-header"
          data-ui="desktop-chrome"
          data-window-drag-region={windowChrome ? "true" : undefined}
          onMouseDown={(event) => {
            beginWindowDrag(windowChrome, event);
          }}
        >
          <div className="app-identity" data-window-no-drag="true">
            <ProductMark />
            <span className="vault-breadcrumb">/</span>
            <span>{vaultName}</span>
          </div>
          <div
            aria-label="Primary mode"
            className="mode-switch"
            data-window-no-drag="true"
            role="tablist"
          >
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
            data-window-no-drag="true"
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
          <WindowControls chrome={windowChrome} maximized={maximized} />
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
                ambientGraph={ambientGraph}
                client={knowledgeClient}
                folders={captureFolders}
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
                searchFocusRequest={searchFocusRequest}
                vaultName={vaultName}
              />
            )}
          </div>
        )}
      </main>
    </CommandPaletteHost>
  );
}
