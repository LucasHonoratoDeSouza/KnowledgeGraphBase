/**
 * The one place a keyboard shortcut is described (#34). A chord is written
 * `mod+key`, where `mod` is Cmd on macOS and Ctrl everywhere else, so a
 * binding is declared once and normalized per platform here.
 */

const modifierOrder = ["mod", "ctrl", "alt", "shift"] as const;

function onApple() {
  return (
    typeof navigator !== "undefined" &&
    /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent)
  );
}

/** `Mod+Shift+V` and `shift+mod+v` are the same binding. */
export function normalizeChord(chord: string) {
  const parts = chord
    .toLowerCase()
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  const key = parts.filter(
    (part) => !modifierOrder.includes(part as (typeof modifierOrder)[number]),
  );
  const modifiers = modifierOrder.filter((modifier) =>
    parts.includes(modifier),
  );
  return [...modifiers, ...key].join("+");
}

/**
 * The chord a key event represents, or `null` for a bare keypress. `mod` wins
 * over `ctrl` so a binding never has to branch on the platform.
 */
export function chordFromEvent(event: KeyboardEvent): string | null {
  const key = event.key.toLowerCase();
  if (["control", "meta", "alt", "shift"].includes(key)) return null;
  const modifiers: string[] = [];
  const apple = onApple();
  // On macOS `mod` is strictly Cmd, so Ctrl stays available as its own
  // modifier. Elsewhere Ctrl is `mod`, and Super is accepted alongside it
  // because nothing in the app binds Super on its own.
  if (apple ? event.metaKey : event.ctrlKey || event.metaKey) {
    modifiers.push("mod");
  } else if (event.ctrlKey) modifiers.push("ctrl");
  if (event.altKey) modifiers.push("alt");
  if (event.shiftKey) modifiers.push("shift");
  if (modifiers.length === 0) return null;
  return normalizeChord([...modifiers, key].join("+"));
}

/** The human-readable form shown next to a command in the palette. */
export function shortcutLabel(chord: string) {
  const apple = onApple();
  return normalizeChord(chord)
    .split("+")
    .map((part) => {
      if (part === "mod") return apple ? "⌘" : "Ctrl";
      if (part === "shift") return apple ? "⇧" : "Shift";
      if (part === "alt") return apple ? "⌥" : "Alt";
      if (part === "ctrl") return "Ctrl";
      return part.length === 1 ? part.toUpperCase() : part;
    })
    .join(apple ? "" : "+");
}

/**
 * Shortcuts stay out of the way while a dialog owns the screen — the command
 * palette, the delete confirmation, the onboarding gate's own modals.
 */
export function shortcutsSuppressed(root: Document = document) {
  return Boolean(
    root.querySelector('[aria-modal="true"], [role="alertdialog"]'),
  );
}
