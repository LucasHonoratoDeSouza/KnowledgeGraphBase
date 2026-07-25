import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";

import { App } from "../App";
import type {
  AssistantAnswer,
  CaptureRequest,
  CaptureResponse,
  GraphView,
  KnowledgeClient,
  LibrarySnapshot,
  RetrievalResult,
} from "../knowledge";
import type { SettingsSnapshot } from "../settings";

function createKnowledgeClient() {
  const capture = vi.fn(
    (request: CaptureRequest): Promise<CaptureResponse> =>
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
  const getLibrary = vi.fn(
    (): Promise<LibrarySnapshot> =>
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
  const getGraph = vi.fn(
    (): Promise<GraphView> =>
      Promise.resolve({
      concepts: [
        {
          id: "concept-1",
          normalizedName: "transformers",
          displayName: "Transformers",
        },
      ],
      edges: [],
      truncated: false,
      }),
  );
  const search = vi.fn(
    (query: string): Promise<RetrievalResult> =>
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
  const client: KnowledgeClient = {
    capture,
    getLibrary,
    getGraph,
    search,
    ask,
  };
  return { ask, capture, client, getGraph, getLibrary, search };
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

describe("application shell", () => {
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
    expect(await screen.findByText("Saved · Inbox/quick-capture.md")).toBeVisible();
  });

  it("loads the real library and graph when Retrieve opens", async () => {
    const { client, getGraph, getLibrary } = createKnowledgeClient();
    render(
      <App
        initialMode="Retrieve"
        knowledgeClient={client}
        setupComplete
      />,
    );

    expect((await screen.findAllByText("Transformers"))[0]).toBeVisible();
    expect(screen.getByRole("img", { name: "Knowledge graph" })).toBeVisible();
    expect(getLibrary).toHaveBeenCalledOnce();
    expect(getGraph).toHaveBeenCalledOnce();
  });

  it("runs local retrieval from the Explorer and renders resolvable evidence", async () => {
    const { client, search: searchClient } = createKnowledgeClient();
    render(
      <App
        initialMode="Retrieve"
        knowledgeClient={client}
        setupComplete
      />,
    );
    const search = screen.getByRole("textbox", { name: "Filter knowledge" });
    fireEvent.change(search, { target: { value: "evidence" } });
    fireEvent.keyDown(search, { key: "Enter" });

    expect(await screen.findByText("Transformer research")).toBeVisible();
    expect(screen.getByText("Grounded evidence from the local note.")).toBeVisible();
    expect(searchClient).toHaveBeenCalledWith("evidence");
  });

  it("asks the selected provider model and keeps the citation visible", async () => {
    const { ask, client } = createKnowledgeClient();
    render(
      <App
        initialSettings={configuredSettings}
        knowledgeClient={client}
      />,
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

  it("has no detectable accessibility violations in either mode", async () => {
    const { container, rerender } = render(<App setupComplete />);
    expect((await axe.run(container)).violations).toEqual([]);

    rerender(<App setupComplete initialMode="Retrieve" />);
    expect((await axe.run(container)).violations).toEqual([]);
  });
});
