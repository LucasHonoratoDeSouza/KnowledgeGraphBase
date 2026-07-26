import { useEffect, useState, type MouseEvent as ReactMouseEvent } from "react";

import { getCurrentWindow } from "@tauri-apps/api/window";

/** The eight edges and corners a frameless window can be resized from. */
export type WindowEdge =
  | "East"
  | "North"
  | "NorthEast"
  | "NorthWest"
  | "South"
  | "SouthEast"
  | "SouthWest"
  | "West";

/**
 * Everything the frontend needs once the OS title bar is gone (#33). Kept as a
 * client interface, like the editor and knowledge clients, so the browser E2E
 * build can record calls instead of talking to a window that does not exist.
 */
export interface WindowChromeClient {
  close(): Promise<void>;
  isMaximized(): Promise<boolean>;
  minimize(): Promise<void>;
  /** Subscribes to maximize/restore, resolving to an unsubscribe callback. */
  onMaximizeChange(listener: (maximized: boolean) => void): Promise<() => void>;
  startDragging(): Promise<void>;
  startResize(edge: WindowEdge): Promise<void>;
  toggleMaximize(): Promise<void>;
}

export const nativeWindowChrome: WindowChromeClient = {
  close: () => getCurrentWindow().close(),
  isMaximized: () => getCurrentWindow().isMaximized(),
  minimize: () => getCurrentWindow().minimize(),
  onMaximizeChange: async (listener) => {
    const window = getCurrentWindow();
    // Maximizing and restoring both resize the window; the state itself is
    // what the icon reflects, so every resize re-reads it.
    return window.onResized(() => {
      void window.isMaximized().then(listener);
    });
  },
  startDragging: () => getCurrentWindow().startDragging(),
  startResize: (edge) => getCurrentWindow().startResizeDragging(edge),
  toggleMaximize: () => getCurrentWindow().toggleMaximize(),
};

/**
 * The native chrome, or `null` when the UI is running in a plain browser (the
 * Vite dev server, tests) where the surrounding window is not ours to drive.
 */
export function detectWindowChrome(): WindowChromeClient | null {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
    ? nativeWindowChrome
    : null;
}

/** Tracks maximize state so the middle control can flip to "Restore" (#33). */
export function useWindowMaximized(chrome: WindowChromeClient | null) {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!chrome) return undefined;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void chrome
      .isMaximized()
      .then((current) => {
        if (!cancelled) setMaximized(current);
      })
      .catch(() => {
        // A window that cannot report its state keeps the restore icon hidden.
      });
    void chrome
      .onMaximizeChange((current) => {
        if (!cancelled) setMaximized(current);
      })
      .then((stop) => {
        if (cancelled) stop();
        else unlisten = stop;
      })
      .catch(() => {
        // Without the subscription the icon only lags; the controls still work.
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [chrome]);

  return maximized;
}

/**
 * Starts a native window drag from the header background, and maximizes on the
 * second click of a double click. Buttons, the mode switch and the breadcrumb
 * opt out through `data-window-no-drag`, so clicks there still reach them.
 */
export function beginWindowDrag(
  chrome: WindowChromeClient | null,
  event: ReactMouseEvent<HTMLElement>,
) {
  if (!chrome || event.button !== 0) return;
  const target = event.target instanceof Element ? event.target : null;
  if (!target || target.closest("[data-window-no-drag]")) return;
  if (event.detail >= 2) {
    void chrome.toggleMaximize();
    return;
  }
  void chrome.startDragging();
}
