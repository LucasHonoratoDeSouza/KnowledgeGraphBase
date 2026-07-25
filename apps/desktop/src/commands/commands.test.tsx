import { fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";

import {
  CommandPaletteHost,
  CommandRegistry,
  createDefaultCommands,
  type Command,
} from "./index";

const specifiedNames = [
  "Add Source",
  "Open Note",
  "Open Graph",
  "Search Knowledge",
  "Ask Knowledge",
  "Open Source",
  "Show Backlinks",
  "Show Connections",
  "Create Note",
  "Export Vault",
  "Switch Workspace",
];

function renderPalette(onCommand = vi.fn()) {
  const registry = new CommandRegistry(createDefaultCommands(onCommand));
  return {
    onCommand,
    registry,
    ...render(
      <CommandPaletteHost registry={registry}>
        <button type="button">Workspace</button>
      </CommandPaletteHost>,
    ),
  };
}

describe("shared command registry", () => {
  it("contains every command named in the source design in order", () => {
    const registry = new CommandRegistry(createDefaultCommands(vi.fn()));

    expect(registry.all().map((command) => command.label)).toEqual(
      specifiedNames,
    );
  });

  it("assigns a unique stable id to every command", () => {
    const commands = createDefaultCommands(vi.fn());

    expect(new Set(commands.map((command) => command.id)).size).toBe(11);
  });

  it("returns every command for a blank query", () => {
    const registry = new CommandRegistry(createDefaultCommands(vi.fn()));

    expect(registry.search("   ")).toHaveLength(11);
  });

  it("searches labels case-insensitively", () => {
    const registry = new CommandRegistry(createDefaultCommands(vi.fn()));

    expect(registry.search("gRaPh").map((command) => command.label)).toEqual([
      "Open Graph",
    ]);
  });

  it("searches command keywords", () => {
    const registry = new CommandRegistry(createDefaultCommands(vi.fn()));

    expect(registry.search("capture").map((command) => command.label)).toEqual([
      "Add Source",
    ]);
  });

  it("executes a registered command by id", () => {
    const execute = vi.fn();
    const registry = new CommandRegistry([
      { id: "test", label: "Test command", keywords: [], execute },
    ]);

    expect(registry.execute("test")).toBe(true);
    expect(execute).toHaveBeenCalledOnce();
  });

  it("fails closed for an unknown command id", () => {
    const registry = new CommandRegistry(createDefaultCommands(vi.fn()));

    expect(registry.execute("unknown")).toBe(false);
  });

  it("rejects duplicate command ids", () => {
    const duplicate: Command[] = [
      { id: "same", label: "One", keywords: [], execute: vi.fn() },
      { id: "same", label: "Two", keywords: [], execute: vi.fn() },
    ];

    expect(() => new CommandRegistry(duplicate)).toThrow(
      "Duplicate command id: same",
    );
  });

  it("rejects conflicting shortcuts", () => {
    const conflict: Command[] = [
      {
        id: "one",
        label: "One",
        keywords: [],
        shortcut: "Mod+Shift+V",
        execute: vi.fn(),
      },
      {
        id: "two",
        label: "Two",
        keywords: [],
        shortcut: "mod+shift+v",
        execute: vi.fn(),
      },
    ];

    expect(() => new CommandRegistry(conflict)).toThrow(
      "Shortcut conflict: mod+shift+v",
    );
  });
});

describe("command palette keyboard behavior", () => {
  it("opens with Ctrl+K and focuses search", () => {
    renderPalette();

    fireEvent.keyDown(document, { key: "k", ctrlKey: true });

    expect(
      screen.getByRole("dialog", { name: "Command palette" }),
    ).toBeVisible();
    expect(
      screen.getByRole("combobox", { name: "Search commands" }),
    ).toHaveFocus();
  });

  it("opens with Cmd+K", () => {
    renderPalette();

    fireEvent.keyDown(document, { key: "k", metaKey: true });

    expect(
      screen.getByRole("dialog", { name: "Command palette" }),
    ).toBeVisible();
  });

  it("filters visible commands while typing", () => {
    renderPalette();
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });

    fireEvent.change(
      screen.getByRole("combobox", { name: "Search commands" }),
      {
        target: { value: "backlinks" },
      },
    );

    expect(
      screen.getAllByRole("option").map((option) => option.textContent),
    ).toEqual(["Show Backlinks"]);
  });

  it("moves the active command with ArrowDown", () => {
    renderPalette();
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    const search = screen.getByRole("combobox", { name: "Search commands" });

    fireEvent.keyDown(search, { key: "ArrowDown" });

    expect(search).toHaveAttribute(
      "aria-activedescendant",
      "command-open-note",
    );
    expect(screen.getByRole("option", { name: "Open Note" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("executes the active command with Enter and closes", () => {
    const { onCommand } = renderPalette();
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    const search = screen.getByRole("combobox", { name: "Search commands" });
    fireEvent.change(search, { target: { value: "Export Vault" } });

    fireEvent.keyDown(search, { key: "Enter" });

    expect(onCommand).toHaveBeenCalledWith("export-vault");
    expect(
      screen.queryByRole("dialog", { name: "Command palette" }),
    ).not.toBeInTheDocument();
  });

  it("closes with Escape and returns focus to the prior control", () => {
    renderPalette();
    const prior = screen.getByRole("button", { name: "Workspace" });
    prior.focus();
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });

    fireEvent.keyDown(
      screen.getByRole("combobox", { name: "Search commands" }),
      {
        key: "Escape",
      },
    );

    expect(
      screen.queryByRole("dialog", { name: "Command palette" }),
    ).not.toBeInTheDocument();
    expect(prior).toHaveFocus();
  });

  it("has no detectable accessibility violations when open", async () => {
    const { container } = renderPalette();
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });

    expect((await axe.run(container)).violations).toEqual([]);
  });
});
