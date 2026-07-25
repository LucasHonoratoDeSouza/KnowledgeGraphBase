import { fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";

import { Button, Menu, Pane, desktopStyles, tokens } from "./index";

describe("dense dark-first desktop primitives", () => {
  it("uses the dark palette as the default surface", () => {
    expect(tokens.color.canvas).toBe("#111214");
    expect(tokens.color.text).toBe("#f2f3f5");
    expect(tokens.color.panel).toBe("#181a1e");
  });

  it("defines compact desktop density", () => {
    expect(tokens.size.controlHeight).toBe("28px");
    expect(tokens.space.panel).toBe("8px");
  });

  it("defines a visible focus indicator", () => {
    expect(tokens.focus.ring).toBe("0 0 0 2px #8ab4ff");
    expect(desktopStyles).toContain(".ko-focus-ring:focus-visible");
  });

  it("removes non-essential animation when reduced motion is requested", () => {
    expect(desktopStyles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(desktopStyles).toContain("transition-duration: 0.01ms");
  });

  it("renders a keyboard-operable button with a stable focus class", () => {
    const onPress = vi.fn();
    render(<Button onClick={onPress}>Open note</Button>);

    const button = screen.getByRole("button", { name: "Open note" });
    fireEvent.click(button);

    expect(onPress).toHaveBeenCalledOnce();
    expect(button).toHaveClass("ko-focus-ring");
  });

  it("does not activate a disabled button", () => {
    const onPress = vi.fn();
    render(
      <Button disabled onClick={onPress}>
        Save
      </Button>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onPress).not.toHaveBeenCalled();
  });

  it("renders menus with named menu and menuitem semantics", () => {
    render(
      <Menu
        aria-label="Note actions"
        items={[{ id: "pin", label: "Pin note", onSelect: vi.fn() }]}
      />,
    );

    expect(screen.getByRole("menu", { name: "Note actions" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "Pin note" })).toBeVisible();
  });

  it("moves menu focus with arrow keys and activates with Enter", () => {
    const onSecond = vi.fn();
    render(
      <Menu
        aria-label="View actions"
        items={[
          { id: "split", label: "Split", onSelect: vi.fn() },
          { id: "close", label: "Close", onSelect: onSecond },
        ]}
      />,
    );

    const first = screen.getByRole("menuitem", { name: "Split" });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByRole("menuitem", { name: "Close" }), {
      key: "Enter",
    });

    expect(screen.getByRole("menuitem", { name: "Close" })).toHaveFocus();
    expect(onSecond).toHaveBeenCalledOnce();
  });

  it("wraps menu focus from the last item to the first", () => {
    render(
      <Menu
        aria-label="Layout actions"
        items={[
          { id: "one", label: "One", onSelect: vi.fn() },
          { id: "two", label: "Two", onSelect: vi.fn() },
        ]}
      />,
    );

    const last = screen.getByRole("menuitem", { name: "Two" });
    last.focus();
    fireEvent.keyDown(last, { key: "ArrowDown" });

    expect(screen.getByRole("menuitem", { name: "One" })).toHaveFocus();
  });

  it("exposes a named pane as a region", () => {
    render(<Pane aria-label="Explorer">Library</Pane>);

    expect(screen.getByRole("region", { name: "Explorer" })).toHaveTextContent(
      "Library",
    );
  });

  it("keeps a collapsed pane named and hidden", () => {
    render(
      <Pane aria-label="Assistant" collapsed>
        Conversation
      </Pane>,
    );

    const pane = screen.getByRole("region", { hidden: true });
    expect(pane).toHaveAttribute("aria-label", "Assistant");
    expect(pane).toHaveAttribute("aria-hidden", "true");
    expect(pane).toHaveAttribute("data-collapsed", "true");
  });

  it("has no detectable accessibility violations in the primitive composition", async () => {
    const { container } = render(
      <Pane aria-label="Explorer">
        <Button>New note</Button>
        <Menu
          aria-label="New item"
          items={[{ id: "note", label: "Note", onSelect: vi.fn() }]}
        />
      </Pane>,
    );

    expect((await axe.run(container)).violations).toEqual([]);
  });
});
