import {
  useRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { desktopStyles } from "./tokens";

function classes(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function DesktopStyles() {
  return <style>{desktopStyles}</style>;
}

export function Button({
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={classes("ko-button", "ko-focus-ring", className)}
      type={type}
      {...props}
    />
  );
}

export interface MenuItem {
  id: string;
  label: string;
  disabled?: boolean;
  onSelect: () => void;
}

interface MenuProps {
  "aria-label": string;
  items: MenuItem[];
}

export function Menu({ "aria-label": ariaLabel, items }: MenuProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function moveFocus(index: number, direction: 1 | -1) {
    if (items.length === 0) return;

    let next = index;
    for (let attempts = 0; attempts < items.length; attempts += 1) {
      next = (next + direction + items.length) % items.length;
      if (!items[next]?.disabled) {
        refs.current[next]?.focus();
        return;
      }
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(index, event.key === "ArrowDown" ? 1 : -1);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      items[index]?.onSelect();
    }
  }

  return (
    <ul aria-label={ariaLabel} className="ko-menu" role="menu">
      {items.map((item, index) => (
        <li key={item.id} role="none">
          <button
            className="ko-menu-item ko-focus-ring"
            disabled={item.disabled}
            onClick={item.onSelect}
            onKeyDown={(event) => {
              onKeyDown(event, index);
            }}
            ref={(node) => {
              refs.current[index] = node;
            }}
            role="menuitem"
            tabIndex={index === 0 ? 0 : -1}
            type="button"
          >
            {item.label}
          </button>
        </li>
      ))}
    </ul>
  );
}

interface PaneProps extends HTMLAttributes<HTMLElement> {
  "aria-label": string;
  children: ReactNode;
  collapsed?: boolean;
}

export function Pane({
  "aria-label": ariaLabel,
  children,
  className,
  collapsed = false,
  ...props
}: PaneProps) {
  return (
    <section
      aria-hidden={collapsed || undefined}
      aria-label={ariaLabel}
      className={classes("ko-pane", className)}
      data-collapsed={String(collapsed)}
      {...props}
    >
      {children}
    </section>
  );
}
