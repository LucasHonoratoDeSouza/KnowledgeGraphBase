import { afterEach, describe, expect, it, vi } from "vitest";

import { chordFromEvent, normalizeChord, shortcutsSuppressed } from "./chords";

function keyEvent(init: KeyboardEventInit & { key: string }) {
  return new KeyboardEvent("keydown", init);
}

function pretendPlatform(platform: string) {
  vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
}

describe("shortcut chords", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("orders modifiers so the same binding is written one way", () => {
    expect(normalizeChord("Shift+Mod+V")).toBe("mod+shift+v");
    expect(normalizeChord("mod+shift+v")).toBe("mod+shift+v");
    expect(normalizeChord("Mod+S")).toBe("mod+s");
  });

  it("normalizes Cmd to mod on macOS and leaves Ctrl as its own modifier", () => {
    pretendPlatform("MacIntel");

    expect(chordFromEvent(keyEvent({ key: "s", metaKey: true }))).toBe("mod+s");
    expect(chordFromEvent(keyEvent({ key: "s", ctrlKey: true }))).toBe(
      "ctrl+s",
    );
  });

  it("normalizes Ctrl to mod everywhere else", () => {
    pretendPlatform("Linux x86_64");

    expect(chordFromEvent(keyEvent({ key: "f", ctrlKey: true }))).toBe("mod+f");
    expect(
      chordFromEvent(keyEvent({ key: "v", ctrlKey: true, shiftKey: true })),
    ).toBe("mod+shift+v");
  });

  it("ignores bare keys and lone modifier presses", () => {
    expect(chordFromEvent(keyEvent({ key: "s" }))).toBeNull();
    expect(
      chordFromEvent(keyEvent({ key: "Shift", shiftKey: true })),
    ).toBeNull();
    expect(
      chordFromEvent(keyEvent({ key: "Control", ctrlKey: true })),
    ).toBeNull();
  });

  it("suppresses shortcuts while a modal owns the screen", () => {
    expect(shortcutsSuppressed(document)).toBe(false);

    document.body.innerHTML = '<div role="dialog" aria-modal="true"></div>';
    expect(shortcutsSuppressed(document)).toBe(true);

    document.body.innerHTML = '<div role="alertdialog"></div>';
    expect(shortcutsSuppressed(document)).toBe(true);
  });
});
