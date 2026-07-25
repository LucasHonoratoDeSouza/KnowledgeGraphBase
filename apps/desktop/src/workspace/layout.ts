export type PaneId = "explorer" | "canvas" | "assistant";
export type TabKind = "markdown" | "graph" | "pdf" | "transcript" | "search";
export type SplitDirection = "horizontal" | "vertical";

export interface PaneState {
  width: number;
  collapsed: boolean;
}

export interface WorkspaceTab {
  id: string;
  kind: TabKind;
  title: string;
  preview: boolean;
  pinned: boolean;
}

export interface WorkspaceSplit {
  id: string;
  direction: SplitDirection;
  tabIds: string[];
}

export interface WorkspaceLayout {
  version: 1;
  panes: Record<PaneId, PaneState>;
  tabs: WorkspaceTab[];
  activeTabId: string;
  splits: WorkspaceSplit[];
}

const paneBounds: Record<PaneId, { min: number; max: number }> = {
  explorer: { min: 160, max: 480 },
  canvas: { min: 320, max: 1600 },
  assistant: { min: 240, max: 640 },
};

export const DEFAULT_LAYOUT: WorkspaceLayout = {
  version: 1,
  panes: {
    explorer: { width: 240, collapsed: false },
    canvas: { width: 720, collapsed: false },
    assistant: { width: 320, collapsed: false },
  },
  tabs: [
    {
      id: "welcome",
      kind: "markdown",
      title: "Welcome",
      preview: false,
      pinned: true,
    },
  ],
  activeTabId: "welcome",
  splits: [{ id: "primary", direction: "horizontal", tabIds: ["welcome"] }],
};

function withPane(
  layout: WorkspaceLayout,
  pane: PaneId,
  state: PaneState,
): WorkspaceLayout {
  return {
    ...layout,
    panes: { ...layout.panes, [pane]: state },
  };
}

export function resizePane(
  layout: WorkspaceLayout,
  pane: PaneId,
  requestedWidth: number,
) {
  const bounds = paneBounds[pane];
  const width = Math.min(bounds.max, Math.max(bounds.min, requestedWidth));
  return withPane(layout, pane, { ...layout.panes[pane], width });
}

export function togglePane(layout: WorkspaceLayout, pane: PaneId) {
  if (pane === "canvas") return layout;
  const current = layout.panes[pane];
  return withPane(layout, pane, { ...current, collapsed: !current.collapsed });
}

export function openTab(
  layout: WorkspaceLayout,
  tab: WorkspaceTab,
): WorkspaceLayout {
  if (layout.tabs.some((candidate) => candidate.id === tab.id)) {
    return { ...layout, activeTabId: tab.id };
  }

  return {
    ...layout,
    tabs: [...layout.tabs, { ...tab }],
    activeTabId: tab.id,
    splits: layout.splits.map((split, index) =>
      index === 0 ? { ...split, tabIds: [...split.tabIds, tab.id] } : split,
    ),
  };
}

export function pinTab(
  layout: WorkspaceLayout,
  tabId: string,
  pinned: boolean,
) {
  if (!layout.tabs.some((tab) => tab.id === tabId)) return layout;

  return {
    ...layout,
    tabs: layout.tabs.map((tab) =>
      tab.id === tabId
        ? { ...tab, pinned, preview: pinned ? false : tab.preview }
        : tab,
    ),
  };
}

export function closeTab(layout: WorkspaceLayout, tabId: string) {
  const closingIndex = layout.tabs.findIndex((tab) => tab.id === tabId);
  if (closingIndex < 0 || layout.tabs[closingIndex]?.pinned) return layout;

  const tabs = layout.tabs.filter((tab) => tab.id !== tabId);
  if (tabs.length === 0) return DEFAULT_LAYOUT;
  const firstTab = tabs[0];
  if (!firstTab) return DEFAULT_LAYOUT;

  const neighborIndex = Math.min(closingIndex, tabs.length - 1);
  const nextActive =
    layout.activeTabId === tabId
      ? (tabs[neighborIndex]?.id ?? firstTab.id)
      : layout.activeTabId;

  return {
    ...layout,
    tabs,
    activeTabId: nextActive,
    splits: layout.splits.map((split) => ({
      ...split,
      tabIds: split.tabIds.filter((id) => id !== tabId),
    })),
  };
}

export function splitTab(
  layout: WorkspaceLayout,
  tabId: string,
  direction: SplitDirection,
) {
  if (!layout.tabs.some((tab) => tab.id === tabId)) return layout;

  return {
    ...layout,
    activeTabId: tabId,
    splits: [
      ...layout.splits.map((split) => ({
        ...split,
        tabIds: split.tabIds.filter((id) => id !== tabId),
      })),
      {
        id: `split-${String(layout.splits.length)}`,
        direction,
        tabIds: [tabId],
      },
    ],
  };
}

export function serializeLayout(layout: WorkspaceLayout) {
  return JSON.stringify(layout);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPaneState(value: unknown, pane: PaneId): value is PaneState {
  if (!isRecord(value)) return false;
  const bounds = paneBounds[pane];
  return (
    typeof value.width === "number" &&
    Number.isFinite(value.width) &&
    value.width >= bounds.min &&
    value.width <= bounds.max &&
    typeof value.collapsed === "boolean" &&
    (pane !== "canvas" || !value.collapsed)
  );
}

const tabKinds: TabKind[] = [
  "markdown",
  "graph",
  "pdf",
  "transcript",
  "search",
];
const splitDirections: SplitDirection[] = ["horizontal", "vertical"];

function isWorkspaceTab(value: unknown): value is WorkspaceTab {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.kind === "string" &&
    tabKinds.includes(value.kind as TabKind) &&
    typeof value.title === "string" &&
    value.title.length > 0 &&
    typeof value.preview === "boolean" &&
    typeof value.pinned === "boolean"
  );
}

function isWorkspaceSplit(value: unknown): value is WorkspaceSplit {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.direction === "string" &&
    splitDirections.includes(value.direction as SplitDirection) &&
    Array.isArray(value.tabIds) &&
    value.tabIds.every((id) => typeof id === "string")
  );
}

function isWorkspaceLayout(value: unknown): value is WorkspaceLayout {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.panes))
    return false;
  if (
    !isPaneState(value.panes.explorer, "explorer") ||
    !isPaneState(value.panes.canvas, "canvas") ||
    !isPaneState(value.panes.assistant, "assistant") ||
    !Array.isArray(value.tabs) ||
    value.tabs.length === 0 ||
    !value.tabs.every(isWorkspaceTab) ||
    typeof value.activeTabId !== "string" ||
    !Array.isArray(value.splits) ||
    value.splits.length === 0 ||
    !value.splits.every(isWorkspaceSplit)
  ) {
    return false;
  }

  const tabIds = value.tabs.map((tab) => tab.id);
  const splitIds = value.splits.map((split) => split.id);
  const referencedTabIds = value.splits.flatMap((split) => split.tabIds);
  return (
    new Set(tabIds).size === tabIds.length &&
    new Set(splitIds).size === splitIds.length &&
    tabIds.includes(value.activeTabId) &&
    referencedTabIds.length === tabIds.length &&
    new Set(referencedTabIds).size === tabIds.length &&
    tabIds.every((id) => referencedTabIds.includes(id))
  );
}

export function restoreLayout(
  saved: string | null | undefined,
): WorkspaceLayout {
  if (!saved) return DEFAULT_LAYOUT;

  try {
    const parsed: unknown = JSON.parse(saved);
    return isWorkspaceLayout(parsed) ? parsed : DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT;
  }
}
