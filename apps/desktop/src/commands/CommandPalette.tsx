import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

import type { CommandRegistry } from "./registry";

interface CommandPaletteHostProps {
  children: ReactNode;
  registry: CommandRegistry;
}

export function CommandPaletteHost({
  children,
  registry,
}: CommandPaletteHostProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const priorFocus = useRef<HTMLElement | null>(null);
  const results = useMemo(() => registry.search(query), [query, registry]);

  function openPalette() {
    priorFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setQuery("");
    setActiveIndex(0);
    setOpen(true);
  }

  function closePalette() {
    setOpen(false);
    priorFocus.current?.focus();
  }

  function execute(id: string) {
    registry.execute(id);
    closePalette();
  }

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLocaleLowerCase() === "k"
      ) {
        event.preventDefault();
        openPalette();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  function onSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closePalette();
    } else if (event.key === "ArrowDown" && results.length > 0) {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % results.length);
    } else if (event.key === "ArrowUp" && results.length > 0) {
      event.preventDefault();
      setActiveIndex(
        (current) => (current - 1 + results.length) % results.length,
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      const command = results[activeIndex];
      if (command) execute(command.id);
    }
  }

  const activeCommand = results[activeIndex] ?? results[0];

  return (
    <>
      {children}
      {open ? (
        <div
          aria-label="Command palette"
          aria-modal="true"
          className="command-palette"
          role="dialog"
        >
          <input
            aria-activedescendant={
              activeCommand ? `command-${activeCommand.id}` : undefined
            }
            aria-controls="command-results"
            aria-expanded="true"
            aria-label="Search commands"
            autoFocus
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setActiveIndex(0);
            }}
            onKeyDown={onSearchKeyDown}
            placeholder="Type a command"
            role="combobox"
            value={query}
          />
          <div aria-label="Commands" id="command-results" role="listbox">
            {results.map((command) => (
              <button
                aria-selected={command.id === activeCommand?.id}
                id={`command-${command.id}`}
                key={command.id}
                onClick={() => {
                  execute(command.id);
                }}
                role="option"
                type="button"
              >
                {command.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
