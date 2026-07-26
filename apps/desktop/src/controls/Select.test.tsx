import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Select, type SelectOption } from "./index";

const options: SelectOption[] = [
  { label: "Auto organize", value: "auto" },
  {
    depth: 0,
    label: "Projects",
    selectedLabel: "File in Projects",
    title: "Projects",
    value: "Projects",
  },
  {
    depth: 1,
    label: "Machine Learning",
    selectedLabel: "File in Projects/Machine Learning",
    title: "Projects/Machine Learning",
    value: "Projects/Machine Learning",
  },
  { label: "Don't organize", value: "none" },
];

function Harness({ onChange }: { onChange?: (value: string) => void }) {
  const [value, setValue] = useState("auto");
  return (
    <Select
      aria-label="Organize this capture"
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
      options={options}
      value={value}
    />
  );
}

function trigger() {
  return screen.getByRole("combobox", { name: "Organize this capture" });
}

describe("Select", () => {
  it("keeps the list closed until the trigger is used", () => {
    render(<Harness />);

    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    fireEvent.click(trigger());

    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("listbox")).toBeVisible();
  });

  it("selects with the keyboard and reports the chosen value", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    // The first arrow opens on the selected row; the next two walk down.
    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    fireEvent.keyDown(trigger(), { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith("Projects/Machine Learning");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger()).toHaveTextContent("File in Projects/Machine Learning");
  });

  it("wraps around the ends of the list", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    // Open on the selected row (index 0), so up wraps to the last option.
    fireEvent.click(trigger());
    fireEvent.keyDown(trigger(), { key: "ArrowUp" });
    fireEvent.keyDown(trigger(), { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith("none");
  });

  it("closes on Escape without changing the value", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    fireEvent.click(trigger());
    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    fireEvent.keyDown(trigger(), { key: "Escape" });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  it("closes when a pointer lands outside the control", () => {
    render(
      <>
        <Harness />
        <button type="button">Elsewhere</button>
      </>,
    );

    fireEvent.click(trigger());
    fireEvent.pointerDown(screen.getByRole("button", { name: "Elsewhere" }));

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("marks the active row for assistive tech and indents nested folders", () => {
    render(<Harness />);

    fireEvent.click(trigger());
    fireEvent.keyDown(trigger(), { key: "End" });

    const rows = screen.getAllByRole("option");
    expect(rows[2]).toHaveAttribute("data-depth", "1");
    expect(rows[0]).toHaveAttribute("aria-selected", "true");
    expect(trigger()).toHaveAttribute(
      "aria-activedescendant",
      rows[3]?.getAttribute("id"),
    );
  });
});
