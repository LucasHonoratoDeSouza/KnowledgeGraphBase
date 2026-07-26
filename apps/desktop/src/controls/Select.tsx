import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

import { createPortal } from "react-dom";

import { ChevronDown } from "lucide-react";

export interface SelectOption {
  /** Indentation level, so nested folders read as a hierarchy (#31). */
  depth?: number;
  label: string;
  /** Shown on the trigger when chosen, for rows whose label is abbreviated. */
  selectedLabel?: string;
  title?: string;
  value: string;
}

interface SelectProps {
  "aria-label": string;
  className?: string;
  icon?: ReactNode;
  onChange: (value: string) => void;
  options: SelectOption[];
  value: string;
}

interface Anchor {
  bottom: number;
  left: number;
  top: number;
  width: number;
}

/** Kept in sync with `.select-menu`'s max-height, which decides the flip. */
const MENU_MAX_HEIGHT = 264;

/** Gap between the trigger and the menu, matching the composer's rhythm. */
const MENU_OFFSET = 5;

/**
 * A listbox that replaces the native `<select>` (#31).
 *
 * A native select's popup is drawn by the compositor, so it ignores every
 * token in the stylesheet — no amount of CSS reaches the open list. Owning the
 * popup is the only way to make it look like the rest of the app, and it also
 * buys hierarchy, truncation and scrolling that the native control can't do.
 *
 * Focus stays on the trigger and the active row is tracked with
 * `aria-activedescendant`, which keeps the keyboard contract close to the
 * native one without juggling focus across an ephemeral list.
 */
export function Select({
  "aria-label": ariaLabel,
  className,
  icon,
  onChange,
  options,
  value,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [placement, setPlacement] = useState<"above" | "below">("below");
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLUListElement>(null);
  const listId = useId();

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = options[selectedIndex];

  function openMenu() {
    setActiveIndex(selectedIndex < 0 ? 0 : selectedIndex);
    setOpen(true);
  }

  function closeMenu() {
    setOpen(false);
    trigger.current?.focus();
  }

  function choose(index: number) {
    const option = options[index];
    if (option) onChange(option.value);
    closeMenu();
  }

  // A pointer down anywhere else dismisses, in the capture phase so the click
  // still lands on whatever the user was actually reaching for.
  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      // The menu is portalled to the body, so it is not inside `root` — miss it
      // here and pressing an option would unmount the row before its click.
      if (root.current?.contains(target) || menu.current?.contains(target)) {
        return;
      }
      setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [open]);

  // The menu is portalled out of the app tree, so it needs the trigger's
  // viewport rect to sit against. Recomputed on resize and on any scroll,
  // since either one moves the trigger out from under an open menu.
  useLayoutEffect(() => {
    if (!open) return undefined;
    function measure() {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom;
      setPlacement(
        below < MENU_MAX_HEIGHT && rect.top > below ? "above" : "below",
      );
      setAnchor({
        bottom: rect.bottom,
        left: rect.left,
        top: rect.top,
        width: rect.width,
      });
    }

    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const active = menu.current?.querySelector<HTMLElement>(
      '[data-active="true"]',
    );
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  function onKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (options.length === 0) return;

    if (!open) {
      if (
        event.key === "Enter" ||
        event.key === " " ||
        event.key === "ArrowDown" ||
        event.key === "ArrowUp"
      ) {
        event.preventDefault();
        openMenu();
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
    } else if (event.key === "Tab") {
      // Tab keeps moving focus; the menu just gets out of the way.
      setOpen(false);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex(
        (current) => (current + step + options.length) % options.length,
      );
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setActiveIndex(event.key === "Home" ? 0 : options.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(activeIndex);
    }
  }

  return (
    <div className="select" ref={root}>
      <button
        aria-activedescendant={
          open && options[activeIndex]
            ? `${listId}-${String(activeIndex)}`
            : undefined
        }
        aria-controls={listId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className={["select-trigger", className].filter(Boolean).join(" ")}
        onClick={() => {
          if (open) setOpen(false);
          else openMenu();
        }}
        onKeyDown={onKeyDown}
        ref={trigger}
        role="combobox"
        type="button"
      >
        {icon}
        <span className="select-value">
          {selected ? (selected.selectedLabel ?? selected.label) : ""}
        </span>
        <ChevronDown aria-hidden="true" className="select-chevron" size={13} />
      </button>
      {open && anchor
        ? createPortal(
            <ul
              aria-label={ariaLabel}
              className="select-menu"
              data-placement={placement}
              id={listId}
              ref={menu}
              role="listbox"
              style={
                placement === "below"
                  ? {
                      left: anchor.left,
                      minWidth: anchor.width,
                      top: anchor.bottom + MENU_OFFSET,
                    }
                  : {
                      bottom: window.innerHeight - anchor.top + MENU_OFFSET,
                      left: anchor.left,
                      minWidth: anchor.width,
                    }
              }
            >
              {options.map((option, index) => (
                <li
                  aria-selected={option.value === value}
                  className="select-option"
                  data-active={index === activeIndex}
                  data-depth={option.depth ?? 0}
                  id={`${listId}-${String(index)}`}
                  key={option.value}
                  onClick={() => {
                    choose(index);
                  }}
                  onMouseEnter={() => {
                    setActiveIndex(index);
                  }}
                  role="option"
                  title={option.title}
                >
                  <span>{option.label}</span>
                </li>
              ))}
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}
