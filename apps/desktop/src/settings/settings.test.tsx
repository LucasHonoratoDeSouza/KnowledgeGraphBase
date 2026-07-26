import {
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_LAYOUT, serializeLayout } from "../workspace/layout";
import {
  AISettings,
  Onboarding,
  type FolderPicker,
  type SettingsClient,
  type SettingsSnapshot,
} from "./index";

const snapshot: SettingsSnapshot = {
  setupComplete: true,
  vaultName: "Research",
  activeMode: "Retrieve",
  layoutJson: "{}",
  aiEnabled: true,
  providers: [
    {
      provider: "openai",
      endpoint: "https://api.openai.example",
      credentialStatus: "configured_masked",
      health: "healthy",
    },
  ],
  ai: {
    models: [
      {
        id: "openai:gpt",
        provider: "openai",
        displayName: "GPT",
        enabled: true,
      },
    ],
    routing: {
      mainModelId: "openai:gpt",
      assistantDefaultModelId: "openai:gpt",
      explicitFallbackModelId: null,
    },
    budgets: { dailyCents: 250, monthlyCents: 4_000 },
    privacy: { allowSourceContent: false, storePrompts: false },
  },
};

function client() {
  return {
    completeOnboarding: vi
      .fn<SettingsClient["completeOnboarding"]>()
      .mockResolvedValue(snapshot),
    connectProvider: vi
      .fn<SettingsClient["connectProvider"]>()
      .mockResolvedValue(snapshot),
    getSettings: vi
      .fn<SettingsClient["getSettings"]>()
      .mockResolvedValue(snapshot),
    removeProvider: vi
      .fn<SettingsClient["removeProvider"]>()
      .mockResolvedValue(snapshot),
    rotateProvider: vi
      .fn<SettingsClient["rotateProvider"]>()
      .mockResolvedValue(snapshot),
    saveAiConfiguration: vi
      .fn<SettingsClient["saveAiConfiguration"]>()
      .mockResolvedValue(snapshot),
    setAiEnabled: vi
      .fn<SettingsClient["setAiEnabled"]>()
      .mockResolvedValue(snapshot),
    saveWorkspaceState: vi
      .fn<SettingsClient["saveWorkspaceState"]>()
      .mockResolvedValue(snapshot),
    testProvider: vi
      .fn<SettingsClient["testProvider"]>()
      .mockResolvedValue(snapshot),
  } satisfies SettingsClient;
}

function folderPicker(
  parent: string | null = "/vaults",
  existing: string | null = "/vaults/Existing",
  fallback: string | null = "/home/lucas",
): FolderPicker {
  return {
    chooseExistingVault: vi.fn().mockResolvedValue(existing),
    chooseParentLocation: vi.fn().mockResolvedValue(parent),
    defaultParentLocation: vi.fn().mockResolvedValue(fallback),
  };
}

describe("first-run onboarding", () => {
  it("presents a focused local-first welcome experience", () => {
    render(
      <Onboarding
        client={client()}
        folderPicker={folderPicker()}
        onComplete={vi.fn()}
      />,
    );

    expect(screen.getByText("DESKTOP KNOWLEDGE SYSTEM")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Built for the long term." }),
    ).toBeVisible();
  });

  it("offers exactly two local choices and no account or AI step", () => {
    render(
      <Onboarding
        client={client()}
        folderPicker={folderPicker()}
        onComplete={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(
      screen.getByRole("radio", { name: "Create local knowledge base" }),
    ).toBeChecked();
    expect(screen.queryByLabelText("Provider key")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Main model")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("radio", { name: "AI enabled" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Continue without account" }),
    ).not.toBeInTheDocument();
  });

  it("asks only for a name and fills the location in by itself", async () => {
    render(
      <Onboarding
        client={client()}
        folderPicker={folderPicker()}
        onComplete={vi.fn()}
      />,
    );

    expect(screen.getByRole("textbox", { name: "Vault name" })).toBeRequired();
    // The destination is reported, not asked for: no path field to fill in.
    expect(
      screen.queryByRole("textbox", { name: "Parent location" }),
    ).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("/home/lucas/…")).toBeVisible();
    });
  });

  it("previews the exact folder the new vault will occupy", async () => {
    render(
      <Onboarding
        client={client()}
        folderPicker={folderPicker()}
        onComplete={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText("/home/lucas/…")).toBeVisible();
    });

    fireEvent.change(screen.getByRole("textbox", { name: "Vault name" }), {
      target: { value: "Research" },
    });

    expect(screen.getByText("/home/lucas/Research")).toBeVisible();
  });

  it("creates the vault in the default location with one name and one click", async () => {
    const settingsClient = client();
    const onComplete = vi.fn();
    render(
      <Onboarding
        client={settingsClient}
        folderPicker={folderPicker()}
        onComplete={onComplete}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText("/home/lucas/…")).toBeVisible();
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Vault name" }), {
      target: { value: "Research" },
    });

    fireEvent.submit(screen.getByRole("form", { name: "Workspace setup" }));

    await waitFor(() => {
      expect(settingsClient.completeOnboarding).toHaveBeenCalledWith({
        vault: {
          kind: "create",
          parentPath: "/home/lucas",
          vaultName: "Research",
        },
        aiEnabled: false,
        provider: null,
        endpoint: null,
        credential: null,
        mainModelId: null,
        dailyBudgetCents: 0,
        monthlyBudgetCents: 0,
        layoutJson: serializeLayout(DEFAULT_LAYOUT),
      });
    });
    expect(settingsClient.connectProvider).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("lets the default location be overridden", async () => {
    const settingsClient = client();
    render(
      <Onboarding
        client={settingsClient}
        folderPicker={folderPicker()}
        onComplete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Change location" }));
    await waitFor(() => {
      expect(screen.getByText("/vaults/…")).toBeVisible();
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Vault name" }), {
      target: { value: "Research" },
    });

    fireEvent.submit(screen.getByRole("form", { name: "Workspace setup" }));

    await waitFor(() => {
      expect(settingsClient.completeOnboarding).toHaveBeenCalledWith(
        expect.objectContaining({
          vault: {
            kind: "create",
            parentPath: "/vaults",
            vaultName: "Research",
          },
        }),
      );
    });
  });

  it("keeps the resolved default when the chooser is cancelled", async () => {
    render(
      <Onboarding
        client={client()}
        folderPicker={folderPicker(null)}
        onComplete={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText("/home/lucas/…")).toBeVisible();
    });

    fireEvent.click(screen.getByRole("button", { name: "Change location" }));

    await waitFor(() => {
      expect(screen.getByText("/home/lucas/…")).toBeVisible();
    });
  });

  it("refuses to submit when no location could be resolved", async () => {
    const settingsClient = client();
    render(
      <Onboarding
        client={settingsClient}
        folderPicker={folderPicker("/vaults", "/vaults/Existing", null)}
        onComplete={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Vault name" }), {
      target: { value: "Research" },
    });

    fireEvent.submit(screen.getByRole("form", { name: "Workspace setup" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose where the vault should live.",
    );
    expect(settingsClient.completeOnboarding).not.toHaveBeenCalled();
  });

  it("can open an explicitly selected existing folder", async () => {
    const settingsClient = client();
    render(
      <Onboarding
        client={settingsClient}
        folderPicker={folderPicker()}
        onComplete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "Open existing vault" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose folder" }));

    const path = screen.getByRole("textbox", { name: "Existing vault path" });
    expect(path).toBeRequired();
    expect(path).toHaveAttribute("readonly");
    await waitFor(() => {
      expect(path).toHaveValue("/vaults/Existing");
    });
    expect(
      screen.queryByRole("textbox", { name: "Vault name" }),
    ).not.toBeInTheDocument();

    fireEvent.submit(screen.getByRole("form", { name: "Workspace setup" }));

    await waitFor(() => {
      expect(settingsClient.completeOnboarding).toHaveBeenCalledWith(
        expect.objectContaining({
          aiEnabled: false,
          vault: { kind: "open_existing", vaultPath: "/vaults/Existing" },
        }),
      );
    });
  });
});

describe("dedicated AI settings", () => {
  it("uses provider cards with visible connection state", () => {
    render(<AISettings client={client()} initial={snapshot} />);

    expect(screen.getByText("Model connections")).toBeVisible();
    expect(
      screen.getByRole("group", { name: "OpenAI connection" }),
    ).toHaveAttribute("data-provider-state", "connected");
    expect(
      screen.getByRole("group", { name: "Anthropic connection" }),
    ).toHaveAttribute("data-provider-state", "disconnected");
  });

  it("provides accessible AI settings navigation", () => {
    render(<AISettings client={client()} initial={snapshot} />);

    const navigation = screen.getByRole("navigation", { name: "AI settings" });
    expect(
      within(navigation)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["AI Providers", "Models & Routing", "Costs & Usage", "Privacy"]);
  });

  it("shows separate direct and OpenAI-compatible provider connections", () => {
    render(<AISettings client={client()} initial={snapshot} />);

    expect(
      screen.getByRole("group", { name: "OpenAI connection" }),
    ).toBeVisible();
    expect(
      screen.getByRole("group", { name: "Anthropic connection" }),
    ).toBeVisible();
    expect(
      screen.getByRole("group", { name: "DeepSeek connection" }),
    ).toBeVisible();
    expect(
      screen.getByRole("group", { name: "Groq connection" }),
    ).toBeVisible();
    expect(
      screen.getByRole("group", {
        name: "Compatible / LiteLLM connection",
      }),
    ).toBeVisible();
  });

  it("adds an enabled model from any configured provider to routing", () => {
    render(<AISettings client={client()} initial={snapshot} />);
    fireEvent.change(screen.getByLabelText("New model provider"), {
      target: { value: "compatible" },
    });
    fireEvent.change(screen.getByLabelText("New model identifier"), {
      target: { value: "openrouter/auto" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add model" }));

    expect(screen.getByLabelText("Enable openrouter/auto")).toBeChecked();
    expect(screen.getByLabelText("Main model")).toContainHTML(
      '<option value="openrouter/auto">openrouter/auto</option>',
    );
  });

  it("renders configured credentials only as masked status", () => {
    render(<AISettings client={client()} initial={snapshot} />);

    const openAi = screen.getByRole("group", { name: "OpenAI connection" });
    expect(within(openAi).getByText("Configured ••••••••")).toBeVisible();
    expect(openAi).not.toHaveTextContent("transient");
    expect(openAi).not.toHaveTextContent("stronghold://");
  });

  it("connects providers independently and clears the transient key", async () => {
    const settingsClient = client();
    render(<AISettings client={settingsClient} initial={snapshot} />);
    const anthropic = screen.getByRole("group", {
      name: "Anthropic connection",
    });
    const key = within(anthropic).getByLabelText("New Anthropic key");
    fireEvent.change(key, { target: { value: "anthropic-secret" } });

    fireEvent.click(
      within(anthropic).getByRole("button", { name: "Connect Anthropic" }),
    );

    await waitFor(() => {
      expect(settingsClient.connectProvider).toHaveBeenCalledWith({
        provider: "anthropic",
        endpoint: "https://api.anthropic.com/v1",
        credential: "anthropic-secret",
      });
    });
    expect(key).toHaveValue("");
  });

  it("hides the endpoint behind Advanced except for the compatible gateway", () => {
    render(<AISettings client={client()} initial={snapshot} />);

    expect(screen.getByLabelText("OpenAI endpoint")).not.toBeVisible();
    expect(
      screen.getByLabelText("Compatible / LiteLLM endpoint"),
    ).toBeVisible();

    fireEvent.click(
      within(
        screen.getByRole("group", { name: "OpenAI connection" }),
      ).getByText("Advanced"),
    );

    expect(screen.getByLabelText("OpenAI endpoint")).toBeVisible();
  });

  it("configures a usable default model, routing and privacy on connect", async () => {
    const settingsClient = client();
    const fresh: SettingsSnapshot = {
      ...snapshot,
      aiEnabled: false,
      providers: [],
      ai: {
        ...snapshot.ai,
        models: [],
        routing: {
          mainModelId: null,
          assistantDefaultModelId: null,
          explicitFallbackModelId: null,
        },
        privacy: { allowSourceContent: false, storePrompts: false },
      },
    };
    settingsClient.connectProvider.mockResolvedValue(fresh);
    render(<AISettings client={settingsClient} initial={fresh} />);
    const anthropic = screen.getByRole("group", {
      name: "Anthropic connection",
    });
    fireEvent.change(within(anthropic).getByLabelText("New Anthropic key"), {
      target: { value: "anthropic-secret" },
    });

    fireEvent.click(
      within(anthropic).getByRole("button", { name: "Connect Anthropic" }),
    );

    await waitFor(() => {
      expect(settingsClient.saveAiConfiguration).toHaveBeenCalledWith(
        expect.objectContaining({
          models: [
            {
              id: "claude-sonnet-4-5",
              provider: "anthropic",
              displayName: "claude-sonnet-4-5",
              enabled: true,
            },
          ],
          routing: {
            mainModelId: "claude-sonnet-4-5",
            assistantDefaultModelId: "claude-sonnet-4-5",
            explicitFallbackModelId: null,
          },
          privacy: { allowSourceContent: true, storePrompts: false },
        }),
      );
    });
    expect(settingsClient.setAiEnabled).toHaveBeenCalledWith(true);
    expect(await screen.findByText(/claude-sonnet-4-5 added/)).toBeVisible();
  });

  it("keeps an existing Main model when another provider connects", async () => {
    const settingsClient = client();
    settingsClient.connectProvider.mockResolvedValue(snapshot);
    render(<AISettings client={settingsClient} initial={snapshot} />);
    const groq = screen.getByRole("group", { name: "Groq connection" });
    fireEvent.change(within(groq).getByLabelText("New Groq key"), {
      target: { value: "groq-secret" },
    });

    fireEvent.click(within(groq).getByRole("button", { name: "Connect Groq" }));

    await waitFor(() => {
      expect(settingsClient.saveAiConfiguration).toHaveBeenCalledWith(
        expect.objectContaining({
          routing: {
            mainModelId: "openai:gpt",
            assistantDefaultModelId: "openai:gpt",
            explicitFallbackModelId: null,
          },
        }),
      );
    });
  });

  it("rotates a configured key without reading the stored key", async () => {
    const settingsClient = client();
    render(<AISettings client={settingsClient} initial={snapshot} />);
    const openAi = screen.getByRole("group", { name: "OpenAI connection" });
    const key = within(openAi).getByLabelText("New OpenAI key");
    fireEvent.change(key, { target: { value: "replacement" } });

    fireEvent.click(
      within(openAi).getByRole("button", { name: "Rotate OpenAI key" }),
    );

    await waitFor(() => {
      expect(settingsClient.rotateProvider).toHaveBeenCalledWith(
        "openai",
        "replacement",
      );
    });
    expect(key).toHaveValue("");
  });

  it("tests and removes only the selected provider", async () => {
    const settingsClient = client();
    render(<AISettings client={settingsClient} initial={snapshot} />);
    const openAi = screen.getByRole("group", { name: "OpenAI connection" });

    fireEvent.click(
      within(openAi).getByRole("button", { name: "Test OpenAI" }),
    );
    fireEvent.click(
      within(openAi).getByRole("button", { name: "Remove OpenAI" }),
    );

    await waitFor(() => {
      expect(settingsClient.testProvider).toHaveBeenCalledWith("openai");
    });
    expect(settingsClient.removeProvider).toHaveBeenCalledWith("openai");
  });

  it("shows Main, assistant, explicit fallback, budgets and privacy controls", () => {
    render(<AISettings client={client()} initial={snapshot} />);

    expect(screen.getByLabelText("Main model")).toHaveValue("openai:gpt");
    expect(screen.getByLabelText("Assistant default model")).toHaveValue(
      "openai:gpt",
    );
    expect(screen.getByLabelText("Explicit fallback model")).toHaveValue("");
    expect(screen.getByLabelText("Daily budget (cents)")).toHaveValue(250);
    expect(screen.getByLabelText("Allow source content")).not.toBeChecked();
  });

  it("persists model assignments, budgets and privacy as one settings update", async () => {
    const settingsClient = client();
    render(<AISettings client={settingsClient} initial={snapshot} />);
    fireEvent.change(screen.getByLabelText("Daily budget (cents)"), {
      target: { value: "300" },
    });
    fireEvent.click(screen.getByLabelText("Allow source content"));

    fireEvent.click(screen.getByRole("button", { name: "Save AI settings" }));

    await waitFor(() => {
      expect(settingsClient.saveAiConfiguration).toHaveBeenCalledOnce();
    });
    const saved = settingsClient.saveAiConfiguration.mock.calls[0]?.[0];
    expect(saved?.routing.mainModelId).toBe("openai:gpt");
    expect(saved?.budgets).toEqual({ dailyCents: 300, monthlyCents: 4000 });
    expect(saved?.privacy).toEqual({
      allowSourceContent: true,
      storePrompts: false,
    });
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = render(
      <AISettings client={client()} initial={snapshot} />,
    );

    expect((await axe.run(container)).violations).toEqual([]);
  });
});
