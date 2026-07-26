import { useEffect, useRef } from "react";

import { chordFromEvent, normalizeChord, shortcutsSuppressed } from "./chords";

/** A handler that returns `false` declines the key; anything else takes it. */
export type ShortcutBindings = Record<
  string,
  (event: KeyboardEvent) => unknown
>;

interface ShortcutOptions {
  /** A component can register its bindings and still stand down, e.g. a
   * background tab that must not answer for the visible one. */
  enabled?: boolean;
}

/**
 * Registers `mod+key` bindings for as long as the component is mounted (#34).
 *
 * The listener runs in the capture phase at the document, which is what lets
 * `Cmd+S` and `Cmd+F` work while focus sits inside CodeMirror — it swallows
 * keys through its own handlers on the content element, which only see the
 * event later. A handler returning `false` declines the key and lets it
 * through; anything else consumes it, including the webview's native find bar.
 */
export function useShortcuts(
  bindings: ShortcutBindings,
  { enabled = true }: ShortcutOptions = {},
) {
  const current = useRef(bindings);
  useEffect(() => {
    current.current = bindings;
  }, [bindings]);

  useEffect(() => {
    if (!enabled) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      const chord = chordFromEvent(event);
      if (!chord) return;
      const handler = Object.entries(current.current).find(
        ([binding]) => normalizeChord(binding) === chord,
      )?.[1];
      if (!handler) return;
      if (shortcutsSuppressed(document)) return;
      if (handler(event) === false) return;
      event.preventDefault();
      event.stopPropagation();
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [enabled]);
}
