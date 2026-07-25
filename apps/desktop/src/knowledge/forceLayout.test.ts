import { describe, expect, it } from "vitest";

import { DEFAULT_LAYOUT_OPTIONS, layoutGraph, radiusFor } from "./forceLayout";

function ring(count: number) {
  return {
    nodes: Array.from({ length: count }, (_, index) => ({
      id: `concept-${String(index)}`,
      degree: index === 0 ? count - 1 : 1,
    })),
    edges: Array.from({ length: count - 1 }, (_, index) => ({
      source: "concept-0",
      target: `concept-${String(index + 1)}`,
    })),
  };
}

describe("force layout", () => {
  it("settles with no two nodes overlapping", () => {
    const nodes = layoutGraph(ring(24));

    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i];
        const b = nodes[j];
        if (!a || !b) continue;
        const distance = Math.hypot(b.x - a.x, b.y - a.y);
        expect(distance).toBeGreaterThan(a.radius + b.radius);
      }
    }
  });

  it("keeps every node inside the stage", () => {
    const { width, height } = DEFAULT_LAYOUT_OPTIONS;

    for (const node of layoutGraph(ring(30))) {
      expect(node.x).toBeGreaterThanOrEqual(node.radius);
      expect(node.x).toBeLessThanOrEqual(width - node.radius);
      expect(node.y).toBeGreaterThanOrEqual(node.radius);
      expect(node.y).toBeLessThanOrEqual(height - node.radius);
    }
  });

  it("is deterministic for the same graph", () => {
    expect(layoutGraph(ring(12))).toEqual(layoutGraph(ring(12)));
  });

  it("centers a single node and handles an empty graph", () => {
    const single = layoutGraph({
      nodes: [{ id: "only", degree: 0 }],
      edges: [],
    });

    expect(single).toHaveLength(1);
    expect(single[0]?.x).toBeCloseTo(DEFAULT_LAYOUT_OPTIONS.width / 2, 0);
    expect(single[0]?.y).toBeCloseTo(DEFAULT_LAYOUT_OPTIONS.height / 2, 0);
    expect(layoutGraph({ nodes: [], edges: [] })).toEqual([]);
  });

  it("sizes nodes by connectivity within a readable bound", () => {
    expect(radiusFor(0)).toBe(7);
    expect(radiusFor(4)).toBeGreaterThan(radiusFor(1));
    expect(radiusFor(100)).toBe(20);
  });

  it("ignores edges pointing at concepts that are not in the graph", () => {
    const nodes = layoutGraph({
      nodes: [{ id: "a", degree: 1 }],
      edges: [{ source: "a", target: "ghost" }],
    });

    expect(nodes.map((node) => node.id)).toEqual(["a"]);
  });
});
