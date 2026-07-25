export const tokens = {
  color: {
    canvas: "#111214",
    panel: "#181a1e",
    raised: "#202329",
    border: "#30343b",
    text: "#f2f3f5",
    muted: "#a7acb5",
    accent: "#8ab4ff",
    danger: "#ff8a8a",
  },
  size: {
    controlHeight: "28px",
    radius: "4px",
  },
  space: {
    inline: "6px",
    panel: "8px",
  },
  focus: {
    ring: "0 0 0 2px #8ab4ff",
  },
} as const;

export const desktopStyles = `
:root {
  color-scheme: dark;
  --ko-canvas: ${tokens.color.canvas};
  --ko-panel: ${tokens.color.panel};
  --ko-raised: ${tokens.color.raised};
  --ko-border: ${tokens.color.border};
  --ko-text: ${tokens.color.text};
  --ko-muted: ${tokens.color.muted};
  --ko-accent: ${tokens.color.accent};
  --ko-danger: ${tokens.color.danger};
  --ko-control-height: ${tokens.size.controlHeight};
  --ko-radius: ${tokens.size.radius};
  --ko-panel-space: ${tokens.space.panel};
}

.ko-focus-ring:focus-visible {
  outline: none;
  box-shadow: ${tokens.focus.ring};
}

.ko-button,
.ko-menu-item {
  min-height: var(--ko-control-height);
  border: 1px solid var(--ko-border);
  border-radius: var(--ko-radius);
  color: var(--ko-text);
  background: var(--ko-raised);
  font: inherit;
}

.ko-button:disabled {
  color: var(--ko-muted);
  opacity: 0.6;
}

.ko-menu {
  display: grid;
  gap: 2px;
  margin: 0;
  padding: 4px;
  list-style: none;
  background: var(--ko-panel);
}

.ko-menu-item {
  width: 100%;
  padding-inline: ${tokens.space.inline};
  text-align: left;
}

.ko-pane {
  min-width: 0;
  padding: var(--ko-panel-space);
  overflow: auto;
  background: var(--ko-panel);
  border: 1px solid var(--ko-border);
}

.ko-pane[data-collapsed="true"] {
  display: none;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
`;
