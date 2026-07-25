import { describe, expect, it } from "vitest";

import {
  DEFAULT_LAYOUT,
  closeTab,
  openTab,
  pinTab,
  resizePane,
  restoreLayout,
  serializeLayout,
  splitTab,
  togglePane,
} from "./layout";

describe("serializable workspace layout", () => {
  it("defines Explorer, canvas and assistant panes", () => {
    expect(Object.keys(DEFAULT_LAYOUT.panes)).toEqual([
      "explorer",
      "canvas",
      "assistant",
    ]);
    expect(DEFAULT_LAYOUT.panes.explorer.width).toBe(240);
    expect(DEFAULT_LAYOUT.panes.assistant.width).toBe(320);
  });

  it("round-trips open content through JSON", () => {
    const layout = openTab(DEFAULT_LAYOUT, {
      id: "note:alpha",
      kind: "markdown",
      title: "Alpha",
      preview: true,
      pinned: false,
    });

    expect(restoreLayout(serializeLayout(layout))).toEqual(layout);
  });

  it("recovers deterministically from malformed JSON", () => {
    expect(restoreLayout("{not-json")).toEqual(DEFAULT_LAYOUT);
  });

  it("recovers deterministically from an unknown layout version", () => {
    expect(
      restoreLayout(JSON.stringify({ ...DEFAULT_LAYOUT, version: 2 })),
    ).toEqual(DEFAULT_LAYOUT);
  });

  it("recovers when persisted pane widths violate bounds", () => {
    const invalid = structuredClone(DEFAULT_LAYOUT);
    invalid.panes.explorer.width = -1;

    expect(restoreLayout(JSON.stringify(invalid))).toEqual(DEFAULT_LAYOUT);
  });

  it("clamps every pane resize to its documented minimum", () => {
    expect(
      resizePane(DEFAULT_LAYOUT, "explorer", -500).panes.explorer.width,
    ).toBe(160);
    expect(resizePane(DEFAULT_LAYOUT, "canvas", 0).panes.canvas.width).toBe(
      320,
    );
    expect(
      resizePane(DEFAULT_LAYOUT, "assistant", 1).panes.assistant.width,
    ).toBe(240);
  });

  it("clamps every pane resize to its documented maximum", () => {
    expect(
      resizePane(DEFAULT_LAYOUT, "explorer", 5000).panes.explorer.width,
    ).toBe(480);
    expect(resizePane(DEFAULT_LAYOUT, "canvas", 5000).panes.canvas.width).toBe(
      1600,
    );
    expect(
      resizePane(DEFAULT_LAYOUT, "assistant", 5000).panes.assistant.width,
    ).toBe(640);
  });

  it("collapses and restores Explorer and assistant independently", () => {
    const explorerCollapsed = togglePane(DEFAULT_LAYOUT, "explorer");
    const bothCollapsed = togglePane(explorerCollapsed, "assistant");

    expect(bothCollapsed.panes.explorer.collapsed).toBe(true);
    expect(bothCollapsed.panes.assistant.collapsed).toBe(true);
    expect(togglePane(bothCollapsed, "explorer").panes.explorer.collapsed).toBe(
      false,
    );
  });

  it("never collapses the primary canvas", () => {
    expect(togglePane(DEFAULT_LAYOUT, "canvas")).toEqual(DEFAULT_LAYOUT);
  });

  it("opens a preview tab and makes it active", () => {
    const layout = openTab(DEFAULT_LAYOUT, {
      id: "pdf:one",
      kind: "pdf",
      title: "Paper",
      preview: true,
      pinned: false,
    });

    expect(layout.activeTabId).toBe("pdf:one");
    expect(layout.tabs.at(-1)).toMatchObject({ id: "pdf:one", preview: true });
  });

  it("selects an already-open tab without duplicating it", () => {
    const first = openTab(DEFAULT_LAYOUT, {
      id: "graph:local",
      kind: "graph",
      title: "Local graph",
      preview: false,
      pinned: false,
    });
    const open = first.tabs.at(-1);
    expect(open).toBeDefined();
    if (!open) throw new Error("Expected the graph tab to be open");
    const second = openTab(first, open);

    expect(second.tabs.filter((tab) => tab.id === "graph:local")).toHaveLength(
      1,
    );
    expect(second.activeTabId).toBe("graph:local");
  });

  it("pins a tab and prevents it from being closed", () => {
    const opened = openTab(DEFAULT_LAYOUT, {
      id: "note:pinned",
      kind: "markdown",
      title: "Pinned",
      preview: true,
      pinned: false,
    });
    const pinned = pinTab(opened, "note:pinned", true);

    expect(pinned.tabs.find((tab) => tab.id === "note:pinned")).toMatchObject({
      pinned: true,
      preview: false,
    });
    expect(closeTab(pinned, "note:pinned")).toEqual(pinned);
  });

  it("closes an unpinned active tab and selects a deterministic neighbor", () => {
    const opened = openTab(DEFAULT_LAYOUT, {
      id: "transcript:one",
      kind: "transcript",
      title: "Transcript",
      preview: false,
      pinned: false,
    });
    const closed = closeTab(opened, "transcript:one");

    expect(closed.tabs.map((tab) => tab.id)).toEqual(["welcome"]);
    expect(closed.activeTabId).toBe("welcome");
  });

  it("splits an existing tab into a second canvas group", () => {
    const split = splitTab(DEFAULT_LAYOUT, "welcome", "vertical");

    expect(split.splits).toEqual([
      { id: "primary", direction: "horizontal", tabIds: [] },
      { id: "split-1", direction: "vertical", tabIds: ["welcome"] },
    ]);
  });

  it("does not create a split for a missing tab", () => {
    expect(splitTab(DEFAULT_LAYOUT, "missing", "vertical")).toEqual(
      DEFAULT_LAYOUT,
    );
  });

  it("restores defaults when saved split references are inconsistent", () => {
    const invalid = structuredClone(DEFAULT_LAYOUT);
    const primary = invalid.splits[0];
    expect(primary).toBeDefined();
    if (!primary) throw new Error("Expected the primary split");
    primary.tabIds.push("missing");

    expect(restoreLayout(JSON.stringify(invalid))).toEqual(DEFAULT_LAYOUT);
  });
});
