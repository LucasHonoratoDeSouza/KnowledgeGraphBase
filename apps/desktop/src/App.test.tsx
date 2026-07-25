import { render, screen } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("desktop foundation", () => {
  it("renders the Knowledge OS product identity", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Knowledge OS" })).toBeVisible();
  });

  it("exposes an explicitly named workspace landmark", () => {
    render(<App />);

    expect(
      screen.getByRole("main", { name: "Knowledge workspace" }),
    ).toBeInTheDocument();
  });

  it("boots the local foundation without a required network request", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    render(<App />);

    expect(fetch).not.toHaveBeenCalled();
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = render(<App />);

    expect((await axe.run(container)).violations).toEqual([]);
  });
});
