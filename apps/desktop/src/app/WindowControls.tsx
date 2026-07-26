import { Copy, Minus, Square, X } from "lucide-react";

import type { WindowChromeClient, WindowEdge } from "./windowChrome";

const edges: { edge: WindowEdge; className: string }[] = [
  { edge: "North", className: "window-resize-n" },
  { edge: "South", className: "window-resize-s" },
  { edge: "East", className: "window-resize-e" },
  { edge: "West", className: "window-resize-w" },
  { edge: "NorthWest", className: "window-resize-nw" },
  { edge: "NorthEast", className: "window-resize-ne" },
  { edge: "SouthWest", className: "window-resize-sw" },
  { edge: "SouthEast", className: "window-resize-se" },
];

/**
 * Invisible grab strips around the window. A frameless window loses the OS
 * resize border, so every edge and corner gets one back.
 */
export function WindowResizeHandles({
  chrome,
  maximized,
}: {
  chrome: WindowChromeClient | null;
  maximized: boolean;
}) {
  if (!chrome || maximized) return null;
  return (
    <div aria-hidden="true" className="window-resize-handles">
      {edges.map(({ edge, className }) => (
        <span
          className={`window-resize-handle ${className}`}
          data-window-no-drag="true"
          data-window-resize={edge}
          key={edge}
          onMouseDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            void chrome.startResize(edge);
          }}
        />
      ))}
    </div>
  );
}

/** Minimize / maximize-restore / close, drawn in the app's own palette. */
export function WindowControls({
  chrome,
  maximized,
}: {
  chrome: WindowChromeClient | null;
  maximized: boolean;
}) {
  if (!chrome) return null;
  return (
    <div
      aria-label="Window controls"
      className="window-controls"
      data-window-no-drag="true"
      role="group"
    >
      <button
        aria-label="Minimize"
        onClick={() => {
          void chrome.minimize();
        }}
        type="button"
      >
        <Minus aria-hidden="true" size={14} />
      </button>
      <button
        aria-label={maximized ? "Restore" : "Maximize"}
        onClick={() => {
          void chrome.toggleMaximize();
        }}
        type="button"
      >
        {maximized ? (
          <Copy aria-hidden="true" size={12} />
        ) : (
          <Square aria-hidden="true" size={12} />
        )}
      </button>
      <button
        aria-label="Close"
        className="window-control-close"
        onClick={() => {
          void chrome.close();
        }}
        type="button"
      >
        <X aria-hidden="true" size={14} />
      </button>
    </div>
  );
}
