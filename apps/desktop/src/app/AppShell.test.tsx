import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import axe from "axe-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../App";
import type {
  AssistantAnswer,
  CaptureRequest,
  CaptureResponse,
  GraphView,
  KnowledgeClient,
  LibrarySnapshot,
  OrganizationSnapshot,
  RetrievalResult,
} from "../knowledge";
import type { SettingsClient, SettingsSnapshot } from "../settings";
import type { WindowEdge } from "./windowChrome";

function createKnowledgeClient() {
  const capture = vi.fn((request: CaptureRequest): Promise<CaptureResponse> =>
    Promise.resolve({
      source: {
        id: "source-1",
        kind: "text",
        originalUri: request.title,
        normalizedUri: "local:source-1",
        contentHash: "content-hash",
        pipelineVersion: "ingestion-v1",
        state: "COMPLETED",
        title: request.title,
      },
      document: {
        id: "document-1",
        sourceId: "source-1",
        path: "Inbox/quick-capture.md",
        title: request.title,
        summary: request.content,
        revision: 1,
        contentHash: "document-hash",
      },
      reused: false,
    }),
  );
  const getLibrary = vi.fn((): Promise<LibrarySnapshot> =>
    Promise.resolve({
      entries: [
        {
          name: "Research",
          path: "Research",
          kind: "folder",
          children: [
            {
              name: "Transformers.md",
              path: "Research/Transformers.md",
              kind: "markdown",
              children: [],
            },
          ],
        },
      ],
      documents: [],
      sources: [],
      noteCount: 1,
    }),
  );
  const getGraph = vi.fn((): Promise<GraphView> =>
    Promise.resolve({
      concepts: [
        {
          id: "concept-1",
          normalizedName: "transformers",
          displayName: "Transformers",
          notePath: "Research/Transformers.md",
        },
      ],
      edges: [],
      truncated: false,
    }),
  );
  const getOrganization = vi.fn((): Promise<OrganizationSnapshot> =>
    Promise.resolve({
      facets: [],
      memberships: [],
    }),
  );
  const search = vi.fn((query: string): Promise<RetrievalResult> =>
    Promise.resolve({
      plan: { lexicalQuery: query, filters: {}, expandGraph: false },
      hits: [
        {
          sourceId: "source-1",
          documentId: "document-1",
          chunkId: "chunk-1",
          title: "Transformer research",
          snippet: "Grounded <mark>evidence</mark> from the local note.",
          locator: "section:Evidence",
          path: "Research/Transformers.md",
          score: 1,
        },
      ],
      lexicalFallback: true,
    }),
  );
  const ask = vi.fn(
    (_question: string, modelId: string): Promise<AssistantAnswer> =>
      Promise.resolve({
        answer: "The evidence links transformers to retrieval.",
        citations: [
          {
            number: 1,
            title: "Transformer research",
            path: "Research/Transformers.md",
            locator: "section:Evidence",
            snippet: "Grounded evidence from the local note.",
          },
        ],
        modelId,
        usage: { inputTokens: 100, outputTokens: 30 },
        supported: true,
      }),
  );
  const createFolder = vi.fn((path: string): Promise<LibrarySnapshot> =>
    getLibrary().then((library) => ({
      ...library,
      entries: [
        ...library.entries,
        { name: path, path, kind: "folder" as const, children: [] },
      ],
    })),
  );
  const deleteEntry = vi.fn((path: string) =>
    getLibrary().then((library) => ({
      ...library,
      entries: library.entries.filter((entry) => entry.path !== path),
    })),
  );
  const moveEntry = vi.fn((path: string, destination: string) =>
    getLibrary().then((library) => ({
      ...library,
      entries: [
        ...library.entries,
        {
          name: path.split("/").at(-1) ?? path,
          path: `${destination}/${path.split("/").at(-1) ?? path}`,
          kind: "markdown" as const,
          children: [],
        },
      ],
    })),
  );
  const renameEntry = vi.fn((path: string, name: string) =>
    getLibrary().then((library) => ({
      ...library,
      entries: [
        ...library.entries,
        {
          name,
          path: `${path.split("/").slice(0, -1).join("/")}/${name}`,
          kind: "folder" as const,
          children: [],
        },
      ],
    })),
  );
  const reorganizeFolder = vi.fn((folder: string) =>
    getLibrary().then((library) => ({
      folder,
      moves: [
        {
          from: `${folder}/one.md`,
          to: `${folder}/Optimization/one.md`,
          reason: "training dynamics",
        },
      ],
      skipped: [],
      library,
    })),
  );
  const undoReorganization = vi.fn(() =>
    getLibrary().then((library) => ({
      folder: "",
      moves: [],
      skipped: [],
      library,
    })),
  );
  const crowdedFolders = vi.fn(() => Promise.resolve<string[]>([]));
  const client: KnowledgeClient = {
    capture,
    createFolder,
    deleteEntry,
    moveEntry,
    renameEntry,
    reorganizeFolder,
    undoReorganization,
    crowdedFolders,
    getLibrary,
    getOrganization,
    getGraph,
    search,
    ask,
  };
  return {
    ask,
    capture,
    client,
    createFolder,
    crowdedFolders,
    deleteEntry,
    moveEntry,
    renameEntry,
    reorganizeFolder,
    undoReorganization,
    getGraph,
    getLibrary,
    getOrganization,
    search,
  };
}

const configuredSettings: SettingsSnapshot = {
  setupComplete: true,
  vaultName: "teste n1",
  activeMode: "Retrieve",
  layoutJson: "{}",
  aiEnabled: true,
  providers: [
    {
      provider: "openai",
      endpoint: "https://api.openai.com/v1",
      credentialStatus: "configured_masked",
      health: "healthy",
    },
  ],
  ai: {
    models: [
      {
        id: "gpt-4.1-mini",
        provider: "openai",
        displayName: "GPT 4.1 mini",
        enabled: true,
      },
    ],
    routing: {
      mainModelId: "gpt-4.1-mini",
      assistantDefaultModelId: "gpt-4.1-mini",
      explicitFallbackModelId: null,
    },
    budgets: { dailyCents: 100, monthlyCents: 1_000 },
    privacy: { allowSourceContent: true, storePrompts: false },
  },
};

/** Settings client that only records what the workspace persisted. */
function settingsStub(
  saveWorkspaceState: SettingsClient["saveWorkspaceState"],
): SettingsClient {
  const snapshot = () => Promise.resolve(configuredSettings);
  return {
    getSettings: snapshot,
    completeOnboarding: snapshot,
    connectProvider: snapshot,
    rotateProvider: snapshot,
    saveAiConfiguration: snapshot,
    setAiEnabled: snapshot,
    saveWorkspaceState,
    testProvider: snapshot,
    removeProvider: snapshot,
  };
}

/** Records which window command each control invoked (#33). */
function windowChromeStub(maximized = false) {
  const calls: string[] = [];
  const record = (call: string) => {
    calls.push(call);
    return Promise.resolve();
  };
  return {
    calls,
    close: () => record("close"),
    isMaximized: () => Promise.resolve(maximized),
    minimize: () => record("minimize"),
    onMaximizeChange: () => Promise.resolve(() => undefined),
    startDragging: () => record("startDragging"),
    startResize: (edge: WindowEdge) => record(`startResize:${edge}`),
    toggleMaximize: () => record("toggleMaximize"),
  };
}

describe("application shell", () => {
  // Explorer collapse state persists per vault (#6), so one test's collapsed
  // folder would otherwise hide rows the next test needs.
  beforeEach(() => {
    localStorage.clear();
  });

  it("gates the primary modes until onboarding is complete", () => {
    render(<App setupComplete={false} />);

    expect(
      screen.getByRole("heading", { name: "Set up your workspace" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("tablist", { name: "Primary mode" }),
    ).not.toBeInTheDocument();
  });

  it("exposes exactly Ingest and Retrieve after setup", () => {
    render(<App setupComplete />);

    const modes = within(
      screen.getByRole("tablist", { name: "Primary mode" }),
    ).getAllByRole("tab");
    expect(modes.map((mode) => mode.textContent)).toEqual([
      "Ingest",
      "Retrieve",
    ]);
  });

  it("starts in the sparse Ingest mode", () => {
    render(<App setupComplete />);

    expect(screen.getByRole("tab", { name: "Ingest" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByRole("textbox", { name: "Add knowledge" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("region", { name: "Explorer" }),
    ).not.toBeInTheDocument();
  });

  it("renders a desktop-grade workbench chrome", () => {
    render(<App setupComplete />);

    const chrome = screen.getByRole("banner");
    expect(chrome).toHaveAttribute("data-ui", "desktop-chrome");
    expect(
      within(chrome).getByRole("tablist", { name: "Primary mode" }),
    ).toBeVisible();
    expect(
      within(chrome).getByRole("button", { name: "Settings" }),
    ).toBeVisible();
  });

  it("presents Ingest as a polished multi-source composer", () => {
    render(<App setupComplete />);

    expect(
      screen.getByRole("heading", { name: "Capture a source" }),
    ).toBeVisible();
    expect(
      screen.queryByText("Capture once. Retrieve forever."),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Attach files" })).toBeVisible();
    expect(screen.getByText("YouTube")).toBeVisible();
    expect(screen.getByText("PDF")).toBeVisible();
    expect(screen.getByText("Meeting notes")).toBeVisible();
  });

  it("switches to Retrieve with the keyboard", () => {
    render(<App setupComplete />);

    const ingest = screen.getByRole("tab", { name: "Ingest" });
    ingest.focus();
    fireEvent.keyDown(ingest, { key: "ArrowRight" });

    expect(screen.getByRole("tab", { name: "Retrieve" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("region", { name: "Explorer" })).toBeVisible();
  });

  it("switches back to Ingest with the keyboard", () => {
    render(<App setupComplete initialMode="Retrieve" />);

    const retrieve = screen.getByRole("tab", { name: "Retrieve" });
    retrieve.focus();
    fireEvent.keyDown(retrieve, { key: "ArrowLeft" });

    expect(screen.getByRole("tab", { name: "Ingest" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Ingest" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("shows the three durable Retrieve regions", () => {
    render(<App setupComplete initialMode="Retrieve" />);

    expect(screen.getByRole("region", { name: "Explorer" })).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Knowledge canvas" }),
    ).toBeVisible();
    expect(screen.getByRole("region", { name: "Assistant" })).toBeVisible();
  });

  it("renders a realistic knowledge explorer, graph canvas and read-only agent", () => {
    render(<App setupComplete initialMode="Retrieve" />);

    const explorer = screen.getByRole("region", { name: "Explorer" });
    expect(within(explorer).getByText("Inbox")).toBeVisible();
    expect(within(explorer).getByText("Projects")).toBeVisible();
    expect(within(explorer).getByText("Research")).toBeVisible();
    expect(screen.getByRole("tab", { name: "Graph view" })).toBeVisible();

    const assistant = screen.getByRole("region", { name: "Assistant" });
    expect(within(assistant).getByText("Knowledge Assistant")).toBeVisible();
    expect(
      within(assistant).getByRole("combobox", { name: "Assistant model" }),
    ).toBeVisible();
    expect(
      within(assistant).getByRole("textbox", {
        name: "Ask your knowledge base",
      }),
    ).toBeVisible();
    expect(
      within(assistant).getByRole("button", { name: "Send question" }),
    ).toBeDisabled();
  });

  it("reports local runtime and index readiness", () => {
    render(<App setupComplete />);

    expect(screen.getByText("Local")).toHaveAttribute("data-status", "ready");
    expect(screen.getByText("Index ready")).toHaveAttribute(
      "data-status",
      "ready",
    );
  });

  it("reports offline state without disabling local modes", () => {
    render(<App setupComplete online={false} />);

    expect(screen.getByText("Offline")).toHaveAttribute(
      "data-status",
      "offline",
    );
    expect(screen.getByRole("tab", { name: "Ingest" })).toBeEnabled();
    expect(screen.getByRole("tab", { name: "Retrieve" })).toBeEnabled();
  });

  it("does not make a required network request", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    render(<App setupComplete online={false} />);

    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("keeps Ingest free of dashboard cards", () => {
    const { container } = render(<App setupComplete />);

    expect(
      container.querySelectorAll("[data-ui='dashboard-card']"),
    ).toHaveLength(0);
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
  });

  it("keeps the active mode focusable", () => {
    render(<App setupComplete initialMode="Retrieve" />);

    expect(screen.getByRole("tab", { name: "Retrieve" })).toHaveAttribute(
      "tabindex",
      "0",
    );
    expect(screen.getByRole("tab", { name: "Ingest" })).toHaveAttribute(
      "tabindex",
      "-1",
    );
  });

  it("submits a source to the native knowledge client and reports its path", async () => {
    const { capture, client } = createKnowledgeClient();
    render(<App knowledgeClient={client} setupComplete />);

    fireEvent.change(screen.getByRole("textbox", { name: "Add knowledge" }), {
      target: { value: "A detailed meeting record about retrieval." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Process source" }));

    await waitFor(() => {
      expect(capture).toHaveBeenCalledOnce();
    });
    expect(capture).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "auto",
        content: "A detailed meeting record about retrieval.",
      }),
    );
    expect(
      await screen.findByText("Saved · Inbox/quick-capture.md"),
    ).toBeVisible();
  });

  it("loads the real library and graph when Retrieve opens", async () => {
    const { client, getGraph, getLibrary } = createKnowledgeClient();
    render(
      <App initialMode="Retrieve" knowledgeClient={client} setupComplete />,
    );

    expect((await screen.findAllByText("Transformers"))[0]).toBeVisible();
    expect(
      screen.getByRole("group", { name: "Knowledge graph" }),
    ).toBeVisible();
    // The shell also reads the library to offer real folders in the Ingest
    // composer (#5), so this asserts the surface loaded, not the call count.
    expect(getLibrary).toHaveBeenCalled();
    expect(getGraph).toHaveBeenCalledOnce();
  });

  it("opens the concept Markdown note from the graph", async () => {
    const { client } = createKnowledgeClient();
    const openNote = vi.fn((path: string) =>
      Promise.resolve({
        path,
        content: "# Transformers\n\nAttention research.\n",
        diagnostics: [],
      }),
    );
    render(
      <App
        editorClient={{
          openNote,
          saveNote: (path, content) =>
            Promise.resolve({ path, content, diagnostics: [] }),
        }}
        initialMode="Retrieve"
        knowledgeClient={client}
        setupComplete
      />,
    );

    fireEvent.keyDown(
      await screen.findByRole("link", { name: "Transformers" }),
      { key: "Enter" },
    );

    await waitFor(() => {
      expect(openNote).toHaveBeenCalledWith("Research/Transformers.md");
    });
    expect(
      await screen.findByRole("tab", { name: /Transformers\.md/ }),
    ).toHaveAttribute("aria-selected", "true");
  });

  it("runs local retrieval from the Explorer and renders resolvable evidence", async () => {
    const { client, search: searchClient } = createKnowledgeClient();
    render(
      <App initialMode="Retrieve" knowledgeClient={client} setupComplete />,
    );
    const search = screen.getByRole("textbox", { name: "Filter knowledge" });
    fireEvent.change(search, { target: { value: "evidence" } });
    fireEvent.keyDown(search, { key: "Enter" });

    expect(await screen.findByText("Transformer research")).toBeVisible();
    expect(
      screen.getByText("Grounded evidence from the local note."),
    ).toBeVisible();
    expect(searchClient).toHaveBeenCalledWith("evidence");
  });

  it("asks the selected provider model and keeps the citation visible", async () => {
    const { ask, client } = createKnowledgeClient();
    render(
      <App initialSettings={configuredSettings} knowledgeClient={client} />,
    );
    const question = screen.getByRole("textbox", {
      name: "Ask your knowledge base",
    });
    fireEvent.change(question, {
      target: { value: "How does retrieval connect to transformers?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send question" }));

    expect(
      await screen.findByText("The evidence links transformers to retrieval."),
    ).toBeVisible();
    expect(screen.getByText("[1] Transformer research")).toBeVisible();
    expect(ask).toHaveBeenCalledWith(
      "How does retrieval connect to transformers?",
      "gpt-4.1-mini",
    );
  });

  it("searches as the query settles and restores the tree when it is cleared", async () => {
    const { client, search: searchClient } = createKnowledgeClient();
    render(
      <App initialMode="Retrieve" knowledgeClient={client} setupComplete />,
    );
    const explorer = screen.getByRole("region", { name: "Explorer" });
    expect(await within(explorer).findByText("Research")).toBeVisible();

    fireEvent.change(
      screen.getByRole("textbox", { name: "Filter knowledge" }),
      {
        target: { value: "evidence" },
      },
    );

    expect(await screen.findByText("Transformer research")).toBeVisible();
    expect(searchClient).toHaveBeenCalledWith("evidence");
    expect(screen.getByLabelText("Search results")).toBeVisible();
    expect(within(explorer).queryByText("Research")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));

    expect(await within(explorer).findByText("Research")).toBeVisible();
    expect(screen.queryByLabelText("Search results")).not.toBeInTheDocument();
  });

  it("collapses and re-expands a folder in the Explorer tree", async () => {
    const { client } = createKnowledgeClient();
    render(
      <App initialMode="Retrieve" knowledgeClient={client} setupComplete />,
    );
    const folder = await screen.findByRole("button", { name: "Research" });
    expect(screen.getByRole("button", { name: "Transformers" })).toBeVisible();

    fireEvent.click(folder);

    expect(
      screen.queryByRole("button", { name: "Transformers" }),
    ).not.toBeInTheDocument();

    fireEvent.click(folder);

    expect(screen.getByRole("button", { name: "Transformers" })).toBeVisible();
  });

  it("creates a named note in the vault and opens it", async () => {
    const { client } = createKnowledgeClient();
    const saveNote = vi.fn((path: string, content: string) =>
      Promise.resolve({ path, content, diagnostics: [] }),
    );
    render(
      <App
        editorClient={{
          openNote: (path) =>
            Promise.resolve({ path, content: "# Welcome", diagnostics: [] }),
          saveNote,
        }}
        initialMode="Retrieve"
        knowledgeClient={client}
        setupComplete
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "New note" }));
    const name = screen.getByRole("textbox", { name: "New note name" });
    fireEvent.change(name, { target: { value: "Reading notes" } });
    fireEvent.keyDown(name, { key: "Enter" });

    await waitFor(() => {
      expect(saveNote).toHaveBeenCalledWith(
        "Reading notes.md",
        "# Reading notes\n\n",
      );
    });
    expect(
      await screen.findByRole("tab", { name: /Reading notes\.md/ }),
    ).toBeVisible();
  });

  it("creates a folder inside the selected folder and reports failures", async () => {
    const { client, createFolder } = createKnowledgeClient();
    createFolder.mockRejectedValueOnce(
      new Error("a folder with that name already exists"),
    );
    render(
      <App initialMode="Retrieve" knowledgeClient={client} setupComplete />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Research" }));
    fireEvent.click(screen.getByRole("button", { name: "New folder" }));
    const name = screen.getByRole("textbox", { name: "New folder name" });
    fireEvent.change(name, { target: { value: "Papers" } });
    fireEvent.keyDown(name, { key: "Enter" });

    expect(
      await screen.findByText("a folder with that name already exists"),
    ).toBeVisible();
    expect(createFolder).toHaveBeenCalledWith("Research/Papers");

    fireEvent.keyDown(name, { key: "Enter" });

    await waitFor(() => {
      expect(createFolder).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("textbox", { name: "New folder name" }),
      ).not.toBeInTheDocument();
    });
  });

  it("sends the chosen organization mode with the capture", async () => {
    const { capture, client } = createKnowledgeClient();
    render(<App knowledgeClient={client} setupComplete />);
    const organize = await screen.findByRole("combobox", {
      name: "Organize this capture",
    });
    expect(organize).toHaveTextContent("Auto organize");

    fireEvent.change(screen.getByRole("textbox", { name: "Add knowledge" }), {
      target: { value: "A note about retrieval." },
    });
    fireEvent.click(organize);
    fireEvent.click(await screen.findByRole("option", { name: "Research" }));
    fireEvent.click(screen.getByRole("button", { name: "Process source" }));

    await waitFor(() => {
      expect(capture).toHaveBeenCalledWith(
        expect.objectContaining({
          organize: "folder",
          organizeFolder: "Research",
        }),
      );
    });
  });

  it("captures without enrichment when organization is declined", async () => {
    const { capture, client } = createKnowledgeClient();
    render(<App knowledgeClient={client} setupComplete />);
    fireEvent.change(screen.getByRole("textbox", { name: "Add knowledge" }), {
      target: { value: "A loose thought." },
    });
    fireEvent.click(
      await screen.findByRole("combobox", { name: "Organize this capture" }),
    );
    fireEvent.click(
      await screen.findByRole("option", { name: "Don't organize" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Process source" }));

    await waitFor(() => {
      expect(capture).toHaveBeenCalledWith(
        expect.objectContaining({ organize: "none", organizeFolder: "" }),
      );
    });
  });

  it("renames a note from the right-click menu", async () => {
    const { client, renameEntry } = createKnowledgeClient();
    render(
      <App initialMode="Retrieve" knowledgeClient={client} setupComplete />,
    );
    const note = await screen.findByRole("button", { name: "Transformers" });

    fireEvent.contextMenu(note);
    fireEvent.click(
      within(
        screen.getByRole("menu", { name: "Actions for Transformers.md" }),
      ).getByRole("menuitem", { name: "Rename" }),
    );
    const name = screen.getByRole("textbox", { name: "New name" });
    expect(name).toHaveValue("Transformers");
    fireEvent.change(name, { target: { value: "Attention" } });
    fireEvent.keyDown(name, { key: "Enter" });

    await waitFor(() => {
      expect(renameEntry).toHaveBeenCalledWith(
        "Research/Transformers.md",
        "Attention",
      );
    });
  });

  it("deletes a folder only after the confirmation is accepted", async () => {
    const { client, deleteEntry } = createKnowledgeClient();
    render(
      <App initialMode="Retrieve" knowledgeClient={client} setupComplete />,
    );
    const folder = await screen.findByRole("button", { name: "Research" });

    fireEvent.contextMenu(folder);
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));

    const confirm = screen.getByRole("alertdialog", { name: "Confirm delete" });
    expect(confirm).toHaveTextContent("and everything inside it");
    expect(deleteEntry).not.toHaveBeenCalled();

    fireEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));
    expect(deleteEntry).not.toHaveBeenCalled();

    fireEvent.contextMenu(folder);
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    fireEvent.click(
      within(
        screen.getByRole("alertdialog", { name: "Confirm delete" }),
      ).getByRole("button", { name: "Delete" }),
    );

    await waitFor(() => {
      expect(deleteEntry).toHaveBeenCalledWith("Research");
    });
  });

  it("closes the context menu on Escape without acting", async () => {
    const { client, deleteEntry } = createKnowledgeClient();
    render(
      <App initialMode="Retrieve" knowledgeClient={client} setupComplete />,
    );
    fireEvent.contextMenu(
      await screen.findByRole("button", { name: "Research" }),
    );
    expect(screen.getByRole("menu")).toBeVisible();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(deleteEntry).not.toHaveBeenCalled();
  });

  it("moves a note into the folder it is dropped on", async () => {
    const { client, moveEntry } = createKnowledgeClient();
    render(
      <App initialMode="Retrieve" knowledgeClient={client} setupComplete />,
    );
    const note = await screen.findByRole("button", { name: "Transformers" });
    const folder = screen.getByRole("button", { name: "Research" });
    const dataTransfer = {
      effectAllowed: "",
      dropEffect: "",
      setData: vi.fn(),
      getData: () => "Research/Transformers.md",
    };

    fireEvent.dragStart(note, { dataTransfer });
    fireEvent.dragOver(folder, { dataTransfer });
    fireEvent.drop(folder, { dataTransfer });

    await waitFor(() => {
      expect(moveEntry).toHaveBeenCalledWith(
        "Research/Transformers.md",
        "Research",
      );
    });
  });

  it("reorganizes a folder from the menu and offers a single undo", async () => {
    const { client, reorganizeFolder, undoReorganization } =
      createKnowledgeClient();
    render(
      <App initialMode="Retrieve" knowledgeClient={client} setupComplete />,
    );
    fireEvent.contextMenu(
      await screen.findByRole("button", { name: "Research" }),
    );
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Reorganize this folder" }),
    );

    await waitFor(() => {
      expect(reorganizeFolder).toHaveBeenCalledWith("Research");
    });
    expect(
      await screen.findByText(/Reorganized Research — 1 note moved/),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    await waitFor(() => {
      expect(undoReorganization).toHaveBeenCalledOnce();
    });
  });

  it("resizes a pane by dragging its divider and persists the width", async () => {
    const saveWorkspaceState = vi.fn((_mode: unknown, layoutJson: string) =>
      Promise.resolve({ ...configuredSettings, layoutJson }),
    );
    render(
      <App
        initialSettings={configuredSettings}
        settingsClient={settingsStub(
          saveWorkspaceState as unknown as SettingsClient["saveWorkspaceState"],
        )}
      />,
    );
    const divider = screen.getByRole("separator", { name: "Resize Explorer" });

    fireEvent.pointerDown(divider, { clientX: 240, pointerId: 1 });
    fireEvent.pointerMove(divider, { clientX: 300, pointerId: 1 });
    fireEvent.pointerUp(divider, { clientX: 300, pointerId: 1 });

    await waitFor(() => {
      expect(saveWorkspaceState).toHaveBeenCalled();
    });
    const [, layoutJson] = saveWorkspaceState.mock.calls.at(-1) ?? [];
    expect(
      (
        JSON.parse(layoutJson ?? "{}") as {
          panes: { explorer: { width: number } };
        }
      ).panes.explorer.width,
    ).toBe(300);
  });

  it("resizes a pane with the keyboard from the divider", async () => {
    const saveWorkspaceState = vi.fn((_mode: unknown, layoutJson: string) =>
      Promise.resolve({ ...configuredSettings, layoutJson }),
    );
    render(
      <App
        initialSettings={configuredSettings}
        settingsClient={settingsStub(
          saveWorkspaceState as unknown as SettingsClient["saveWorkspaceState"],
        )}
      />,
    );

    fireEvent.keyDown(
      screen.getByRole("separator", { name: "Resize Assistant" }),
      { key: "ArrowLeft" },
    );

    await waitFor(() => {
      expect(saveWorkspaceState).toHaveBeenCalled();
    });
    const [, layoutJson] = saveWorkspaceState.mock.calls.at(-1) ?? [];
    expect(
      (
        JSON.parse(layoutJson ?? "{}") as {
          panes: { assistant: { width: number } };
        }
      ).panes.assistant.width,
    ).toBe(336);
  });

  it("draws its own window controls and invokes the matching commands", async () => {
    const chrome = windowChromeStub();
    render(<App setupComplete windowChrome={chrome} />);

    const controls = screen.getByRole("group", { name: "Window controls" });
    const minimize = within(controls).getByRole("button", { name: "Minimize" });
    const maximize = within(controls).getByRole("button", { name: "Maximize" });
    const close = within(controls).getByRole("button", { name: "Close" });

    minimize.focus();
    expect(minimize).toHaveFocus();
    fireEvent.click(minimize);
    fireEvent.click(maximize);
    fireEvent.click(close);

    await waitFor(() => {
      expect(chrome.calls).toEqual(["minimize", "toggleMaximize", "close"]);
    });
  });

  it("flips the maximize control to Restore while the window is maximized", async () => {
    const chrome = windowChromeStub(true);
    render(<App setupComplete windowChrome={chrome} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Restore" })).toBeVisible();
    });
    expect(
      screen.queryByRole("button", { name: "Maximize" }),
    ).not.toBeInTheDocument();
  });

  it("drags the window from the header background but not from its controls", () => {
    const chrome = windowChromeStub();
    render(<App setupComplete windowChrome={chrome} />);

    const header = screen.getByRole("banner");
    fireEvent.mouseDown(header, { button: 0, detail: 1 });
    expect(chrome.calls).toEqual(["startDragging"]);

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Retrieve" }), {
      button: 0,
      detail: 1,
    });
    fireEvent.mouseDown(screen.getByRole("button", { name: "Settings" }), {
      button: 0,
      detail: 1,
    });
    expect(chrome.calls).toEqual(["startDragging"]);
  });

  it("toggles maximize when the drag region is double clicked", () => {
    const chrome = windowChromeStub();
    render(<App setupComplete windowChrome={chrome} />);

    fireEvent.mouseDown(screen.getByRole("banner"), { button: 0, detail: 2 });

    expect(chrome.calls).toEqual(["toggleMaximize"]);
  });

  it("keeps the OS chrome when no window client is available", () => {
    render(<App setupComplete windowChrome={null} />);

    expect(
      screen.queryByRole("group", { name: "Window controls" }),
    ).not.toBeInTheDocument();
  });

  it("focuses the Explorer search from Ingest with Cmd/Ctrl+F", async () => {
    render(<App setupComplete />);
    expect(screen.getByRole("tab", { name: "Ingest" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    fireEvent.keyDown(document, { key: "f", ctrlKey: true });

    await waitFor(() => {
      expect(
        screen.getByRole("textbox", { name: "Filter knowledge" }),
      ).toHaveFocus();
    });
    expect(screen.getByRole("tab", { name: "Retrieve" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("selects the standing query so Cmd/Ctrl+F replaces it", async () => {
    render(<App setupComplete initialMode="Retrieve" />);
    const search = screen.getByRole("textbox", { name: "Filter knowledge" });
    fireEvent.change(search, { target: { value: "agents" } });

    fireEvent.keyDown(document, { key: "f", ctrlKey: true });

    await waitFor(() => {
      expect(search).toHaveFocus();
    });
    expect((search as HTMLInputElement).selectionStart).toBe(0);
    expect((search as HTMLInputElement).selectionEnd).toBe("agents".length);
  });

  it("clears the query and returns focus when Escape leaves the search", async () => {
    render(<App setupComplete initialMode="Retrieve" />);
    const retrieve = screen.getByRole("tab", { name: "Retrieve" });
    retrieve.focus();
    fireEvent.keyDown(document, { key: "f", ctrlKey: true });
    const search = screen.getByRole("textbox", { name: "Filter knowledge" });
    await waitFor(() => {
      expect(search).toHaveFocus();
    });
    fireEvent.change(search, { target: { value: "agents" } });

    fireEvent.keyDown(search, { key: "Escape" });

    expect(search).toHaveValue("");
    expect(retrieve).toHaveFocus();
  });

  it("ignores shortcuts while a modal owns the screen", () => {
    render(<App setupComplete />);
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    expect(
      screen.getByRole("dialog", { name: "Command palette" }),
    ).toBeVisible();

    fireEvent.keyDown(document, { key: "f", ctrlKey: true });

    expect(screen.getByRole("tab", { name: "Ingest" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("lists a command's shortcut next to it in the palette", () => {
    render(<App setupComplete />);

    fireEvent.keyDown(document, { key: "k", ctrlKey: true });

    const command = screen
      .getAllByRole("option")
      .find((option) => option.textContent.startsWith("Search Knowledge"));
    expect(command?.textContent).toContain("Ctrl+F");
  });

  it("renders the ambient graph behind Ingest as inert decoration", async () => {
    const { container } = render(
      <App knowledgeClient={createKnowledgeClient()} setupComplete />,
    );

    const ambient = await waitFor(() => {
      const found = container.querySelector(".ambient-graph");
      if (!found) throw new Error("ambient layer not rendered");
      return found;
    });
    expect(ambient).toHaveAttribute("aria-hidden", "true");
    expect(ambient.querySelector("[tabindex]")).toBeNull();
    expect(
      screen.getByRole("textbox", { name: "Add knowledge" }),
    ).toBeVisible();
  });

  it("leaves the Ingest surface untouched when the index is empty", async () => {
    const client = createKnowledgeClient();
    const empty = {
      ...client,
      getGraph: () =>
        Promise.resolve({ concepts: [], edges: [], truncated: false }),
    };
    const { container } = render(<App knowledgeClient={empty} setupComplete />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Capture a source" }),
      ).toBeVisible();
    });
    expect(container.querySelector(".ambient-graph")).toBeNull();
  });

  it("has no detectable accessibility violations in either mode", async () => {
    const { container, rerender } = render(<App setupComplete />);
    expect((await axe.run(container)).violations).toEqual([]);

    rerender(<App setupComplete initialMode="Retrieve" />);
    expect((await axe.run(container)).violations).toEqual([]);
  });
});
