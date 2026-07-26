import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { KnowledgeGraph } from "./KnowledgeGraph";
import type { GraphView } from "./types";

const connectedGraph: GraphView = {
  concepts: [
    { id: "a", normalizedName: "alpha", displayName: "Alpha" },
    { id: "b", normalizedName: "beta", displayName: "Beta" },
    { id: "c", normalizedName: "gamma", displayName: "Gamma" },
  ],
  edges: [
    {
      id: "a-b",
      sourceConceptId: "a",
      targetConceptId: "b",
      relation: "related",
      confidenceBasisPoints: 10_000,
      originDocumentIds: ["test"],
    },
  ],
  truncated: false,
};

function graphBounds() {
  return {
    bottom: 520,
    height: 520,
    left: 0,
    right: 800,
    toJSON: () => ({}),
    top: 0,
    width: 800,
    x: 0,
    y: 0,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  // Unit tests exercise the component's deterministic no-rAF fallback. The
  // browser-level suite covers real animation-frame scheduling.
  vi.stubGlobal("requestAnimationFrame", undefined);
});

describe("fluid knowledge graph", () => {
  it("offers bounded zoom controls and restores the exact default view", () => {
    render(<KnowledgeGraph graph={connectedGraph} />);
    const svg = screen.getByRole("img", { name: "Knowledge graph" });

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(svg).toHaveAttribute("viewBox", "80 52 640 416");
    expect(screen.getByLabelText("Graph zoom")).toHaveTextContent("125%");

    for (let step = 0; step < 20; step += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    }
    expect(svg).toHaveAttribute("data-graph-scale", "0.35");

    fireEvent.click(screen.getByRole("button", { name: "Reset graph view" }));
    expect(svg).toHaveAttribute("viewBox", "0 0 800 520");
    expect(screen.getByLabelText("Graph zoom")).toHaveTextContent("100%");
  });

  it("pans the background and clears the gesture on pointer cancel", () => {
    render(<KnowledgeGraph graph={connectedGraph} />);
    const svg = screen.getByRole("img", { name: "Knowledge graph" });
    expect(svg).toBeInstanceOf(SVGSVGElement);
    if (!(svg instanceof SVGSVGElement)) return;
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue(graphBounds());

    fireEvent.pointerDown(svg, {
      button: 0,
      clientX: 100,
      clientY: 100,
      isPrimary: true,
      pointerId: 7,
    });
    fireEvent.pointerMove(svg, {
      clientX: 140,
      clientY: 120,
      isPrimary: true,
      pointerId: 7,
    });

    expect(svg).toHaveAttribute("viewBox", "-40 -20 800 520");
    expect(svg.parentElement).toHaveClass("graph-stage-panning");
    fireEvent.pointerCancel(svg, { isPrimary: true, pointerId: 7 });
    expect(svg.parentElement).not.toHaveClass("graph-stage-panning");

    fireEvent.pointerMove(svg, {
      clientX: 240,
      clientY: 220,
      isPrimary: true,
      pointerId: 7,
    });
    expect(svg).toHaveAttribute("viewBox", "-40 -20 800 520");
  });

  it("drags a pinned node, moves its neighbor and releases on cancel", () => {
    const { container } = render(<KnowledgeGraph graph={connectedGraph} />);
    const svg = screen.getByRole("img", { name: "Knowledge graph" });
    expect(svg).toBeInstanceOf(SVGSVGElement);
    if (!(svg instanceof SVGSVGElement)) return;
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue(graphBounds());
    const dragged = container.querySelector<SVGGElement>(
      '[data-graph-node="a"]',
    );
    const neighbor = container.querySelector<SVGGElement>(
      '[data-graph-node="b"]',
    );
    expect(dragged).not.toBeNull();
    expect(neighbor).not.toBeNull();
    if (!dragged || !neighbor) return;
    const startX = Number(dragged.dataset.graphX);
    const startY = Number(dragged.dataset.graphY);

    const down = new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      cancelable: true,
      clientX: startX,
      clientY: startY,
      isPrimary: true,
      pointerId: 9,
    });
    fireEvent(dragged, down);
    const neighborBefore = {
      x: Number(neighbor.dataset.graphX),
      y: Number(neighbor.dataset.graphY),
    };
    fireEvent.pointerMove(dragged, {
      clientX: startX + 180,
      clientY: startY,
      isPrimary: true,
      pointerId: 9,
    });

    expect(down.defaultPrevented).toBe(true);
    expect(Number(dragged.dataset.graphX)).toBeGreaterThan(startX);
    expect(Number(dragged.dataset.graphX)).toBeLessThan(startX + 180);
    expect(
      Math.hypot(
        Number(neighbor.dataset.graphX) - neighborBefore.x,
        Number(neighbor.dataset.graphY) - neighborBefore.y,
      ),
    ).toBeGreaterThan(0);
    fireEvent.pointerCancel(dragged, { isPrimary: true, pointerId: 9 });
    expect(dragged).not.toHaveClass("graph-node-dragging");
  });

  it("settles without scheduling animation when reduced motion is requested", () => {
    const requestAnimationFrame = vi.fn(() => 1);
    vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        addEventListener: vi.fn(),
        addListener: vi.fn(),
        dispatchEvent: vi.fn(),
        matches: true,
        media: "(prefers-reduced-motion: reduce)",
        onchange: null,
        removeEventListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    );

    render(<KnowledgeGraph graph={connectedGraph} />);

    expect(requestAnimationFrame).not.toHaveBeenCalled();
    expect(screen.getByRole("img", { name: "Knowledge graph" })).toBeVisible();
  });

  it("keeps the existing empty state", () => {
    render(
      <KnowledgeGraph graph={{ concepts: [], edges: [], truncated: false }} />,
    );

    expect(
      screen.getByText("Capture a source to grow your local graph."),
    ).toBeVisible();
  });
});
