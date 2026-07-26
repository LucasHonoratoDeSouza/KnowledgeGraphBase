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

function installAnimationFrameQueue() {
  let nextId = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  const request = vi.fn((callback: FrameRequestCallback) => {
    const id = nextId;
    nextId += 1;
    callbacks.set(id, callback);
    return id;
  });
  const cancel = vi.fn((id: number) => {
    callbacks.delete(id);
  });
  vi.stubGlobal("requestAnimationFrame", request);
  vi.stubGlobal("cancelAnimationFrame", cancel);
  return {
    cancel,
    drain(maximumFrames = 100) {
      let frames = 0;
      while (callbacks.size > 0 && frames < maximumFrames) {
        this.flushOne();
        frames += 1;
      }
      return frames;
    },
    flushOne() {
      const next = callbacks.entries().next().value;
      if (!next) return false;
      callbacks.delete(next[0]);
      next[1](performance.now());
      return true;
    },
    pending() {
      return callbacks.size;
    },
    request,
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
    const { rerender } = render(<KnowledgeGraph graph={connectedGraph} />);
    const svg = screen.getByRole("img", { name: "Knowledge graph" });

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(svg).toHaveAttribute("viewBox", "80 52 640 416");
    expect(screen.getByLabelText("Graph zoom")).toHaveTextContent("125%");
    rerender(
      <KnowledgeGraph
        graph={{
          ...connectedGraph,
          concepts: [...connectedGraph.concepts],
          edges: [...connectedGraph.edges],
        }}
      />,
    );
    expect(svg).toHaveAttribute("viewBox", "80 52 640 416");

    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(svg).toHaveAttribute("viewBox", "0 0 800 520");
    expect(screen.getByLabelText("Graph zoom")).toHaveTextContent("100%");
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(svg).toHaveAttribute("viewBox", "-100 -65 1000 650");
    expect(screen.getByLabelText("Graph zoom")).toHaveTextContent("80%");

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
    const node = document.querySelector<SVGGElement>('[data-graph-node="a"]');
    expect(node).not.toBeNull();
    const nodeBefore = {
      x: node?.dataset.graphX,
      y: node?.dataset.graphY,
    };

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
    expect(node?.dataset.graphX).toBe(nodeBefore.x);
    expect(node?.dataset.graphY).toBe(nodeBefore.y);
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

    fireEvent.pointerDown(svg, {
      button: 0,
      clientX: 100,
      clientY: 100,
      isPrimary: true,
      pointerId: 8,
    });
    fireEvent.lostPointerCapture(svg, { isPrimary: true, pointerId: 8 });
    expect(svg.parentElement).not.toHaveClass("graph-stage-panning");
  });

  it("batches weighted drag paints and stops frames after lost capture", () => {
    const frames = installAnimationFrameQueue();
    const { container } = render(<KnowledgeGraph graph={connectedGraph} />);
    expect(frames.pending()).toBe(1);
    expect(frames.drain()).toBeLessThan(100);
    expect(frames.pending()).toBe(0);
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
    const transform = vi.spyOn(dragged, "setAttribute");

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
    expect(frames.pending()).toBe(1);
    expect(Number(dragged.dataset.graphX)).toBeCloseTo(startX, 5);
    transform.mockClear();
    frames.flushOne();
    expect(Number(dragged.dataset.graphX)).toBeGreaterThan(startX);
    expect(Number(dragged.dataset.graphX)).toBeLessThan(startX + 180);
    expect(
      transform.mock.calls.filter(([name]) => name === "transform"),
    ).toHaveLength(1);
    expect(
      Math.hypot(
        Number(neighbor.dataset.graphX) - neighborBefore.x,
        Number(neighbor.dataset.graphY) - neighborBefore.y,
      ),
    ).toBeGreaterThan(0);
    fireEvent.lostPointerCapture(dragged, { isPrimary: true, pointerId: 9 });
    expect(dragged).not.toHaveClass("graph-node-dragging");
    expect(frames.drain()).toBeLessThan(100);
    expect(frames.pending()).toBe(0);
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

    const { container } = render(<KnowledgeGraph graph={connectedGraph} />);
    const svg = screen.getByRole("img", { name: "Knowledge graph" });
    expect(svg).toBeInstanceOf(SVGSVGElement);
    if (!(svg instanceof SVGSVGElement)) return;
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue(graphBounds());
    const dragged = container.querySelector<SVGGElement>(
      '[data-graph-node="a"]',
    );
    expect(dragged).not.toBeNull();
    if (!dragged) return;
    const startX = Number(dragged.dataset.graphX);
    const startY = Number(dragged.dataset.graphY);

    fireEvent.pointerDown(dragged, {
      button: 0,
      clientX: startX,
      clientY: startY,
      isPrimary: true,
      pointerId: 11,
    });
    fireEvent.pointerMove(dragged, {
      clientX: startX + 120,
      clientY: startY,
      isPrimary: true,
      pointerId: 11,
    });
    fireEvent.pointerUp(dragged, { isPrimary: true, pointerId: 11 });

    expect(requestAnimationFrame).not.toHaveBeenCalled();
    expect(Number(dragged.dataset.graphX)).toBeGreaterThan(startX);
    expect(svg).toBeVisible();
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
