import { fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";

import { App } from "../App";

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

  it("has no detectable accessibility violations in either mode", async () => {
    const { container, rerender } = render(<App setupComplete />);
    expect((await axe.run(container)).violations).toEqual([]);

    rerender(<App setupComplete initialMode="Retrieve" />);
    expect((await axe.run(container)).violations).toEqual([]);
  });
});
