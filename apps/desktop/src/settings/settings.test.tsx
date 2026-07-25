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
): FolderPicker {
  return {
    chooseExistingVault: vi.fn().mockResolvedValue(existing),
    chooseParentLocation: vi.fn().mockResolvedValue(parent),
  };
}

describe("first-run onboarding", () => {
  it("presents a focused local-first welcome experience", () => {
    render(<Onboarding client={client()} onComplete={vi.fn()} />);

    expect(screen.getByText("DESKTOP KNOWLEDGE SYSTEM")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Built for the long term." }),
    ).toBeVisible();
    expect(screen.getByText("1 of 2")).toBeVisible();
  });

  it("collects a parent location and vault name before creating locally", () => {
    render(<Onboarding client={client()} onComplete={vi.fn()} />);

    expect(
      screen.getByRole("radio", { name: "Create local knowledge base" }),
    ).toBeChecked();
    expect(
      screen.getByRole("textbox", { name: "Parent location" }),
    ).toBeRequired();
    expect(
      screen.getByRole("textbox", { name: "Parent location" }),
    ).toHaveAttribute("readonly");
    expect(screen.getByRole("textbox", { name: "Vault name" })).toBeRequired();
    expect(
      screen.getByRole("button", { name: "Open workspace" }),
    ).toBeVisible();
  });

  it("defaults to complete local-only operation", () => {
    render(<Onboarding client={client()} onComplete={vi.fn()} />);

    expect(screen.getByRole("radio", { name: "Local only" })).toBeChecked();
    expect(
      screen.getByRole("button", { name: "Continue without account" }),
    ).toBeVisible();
    expect(screen.queryByLabelText("Provider key")).not.toBeInTheDocument();
  });

  it("can open an explicitly selected existing vault", async () => {
    render(
      <Onboarding
        client={client()}
        folderPicker={folderPicker()}
        onComplete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "Open existing vault" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Choose existing vault" }),
    );

    expect(
      screen.getByRole("textbox", { name: "Existing vault path" }),
    ).toBeRequired();
    expect(
      screen.getByRole("textbox", { name: "Existing vault path" }),
    ).toHaveAttribute("readonly");
    await waitFor(() =>
      expect(
        screen.getByRole("textbox", { name: "Existing vault path" }),
      ).toHaveValue("/vaults/Existing"),
    );
    expect(
      screen.queryByRole("textbox", { name: "Vault name" }),
    ).not.toBeInTheDocument();
  });

  it("leaves the selected parent unchanged when the chooser is cancelled", async () => {
    render(
      <Onboarding
        client={client()}
        folderPicker={folderPicker(null)}
        onComplete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Choose location" }));

    await waitFor(() =>
      expect(
        screen.getByRole("textbox", { name: "Parent location" }),
      ).toHaveValue(""),
    );
  });

  it("completes local-only setup without a provider request", async () => {
    const settingsClient = client();
    const onComplete = vi.fn();
    render(
      <Onboarding
        client={settingsClient}
        folderPicker={folderPicker()}
        onComplete={onComplete}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose location" }));
    await waitFor(() =>
      expect(
        screen.getByRole("textbox", { name: "Parent location" }),
      ).toHaveValue("/vaults"),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Vault name" }), {
      target: { value: "Research" },
    });

    fireEvent.submit(screen.getByRole("form", { name: "Workspace setup" }));

    await waitFor(() => {
      expect(settingsClient.completeOnboarding).toHaveBeenCalledWith({
        vault: { kind: "create", parentPath: "/vaults", vaultName: "Research" },
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

  it("uses a password input for transient AI credentials", () => {
    render(<Onboarding client={client()} onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: "AI enabled" }));

    expect(screen.getByLabelText("Provider key")).toHaveAttribute(
      "type",
      "password",
    );
    expect(screen.getByRole("combobox", { name: "Provider" })).toHaveValue(
      "openai",
    );
  });

  it("submits AI policy and budgets in the secure setup request", async () => {
    const settingsClient = client();
    render(
      <Onboarding
        client={settingsClient}
        folderPicker={folderPicker()}
        onComplete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose location" }));
    await waitFor(() =>
      expect(
        screen.getByRole("textbox", { name: "Parent location" }),
      ).toHaveValue("/vaults"),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Vault name" }), {
      target: { value: "Research" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "AI enabled" }));
    fireEvent.change(screen.getByLabelText("Provider key"), {
      target: { value: "transient" },
    });
    fireEvent.change(screen.getByLabelText("Main model"), {
      target: { value: "gpt-main" },
    });
    fireEvent.change(screen.getByLabelText("Daily budget (cents)"), {
      target: { value: "250" },
    });
    fireEvent.change(screen.getByLabelText("Monthly budget (cents)"), {
      target: { value: "4000" },
    });

    fireEvent.submit(screen.getByRole("form", { name: "Workspace setup" }));

    await waitFor(() => {
      expect(settingsClient.completeOnboarding).toHaveBeenCalledWith(
        expect.objectContaining({
          credential: "transient",
          mainModelId: "gpt-main",
          dailyBudgetCents: 250,
          monthlyBudgetCents: 4000,
        }),
      );
    });
    expect(screen.getByLabelText("Provider key")).toHaveValue("");
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
