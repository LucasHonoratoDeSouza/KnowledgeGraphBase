import { describe, expect, it } from "vitest";

import {
  AMBIENT_NODE_LIMIT,
  ambientDrift,
  sampleAmbientGraph,
} from "./ambientGraph";
import type { GraphView } from "./types";

function graphOf(conceptCount: number, edgeCount = 0): GraphView {
  const concepts = Array.from({ length: conceptCount }, (_, index) => ({
    id: `concept-${String(index)}`,
    normalizedName: `concept ${String(index)}`,
    displayName: `Concept ${String(index)}`,
    notePath: `Concepts/${String(index)}.md`,
  }));
  const edges = Array.from({ length: edgeCount }, (_, index) => ({
    id: `edge-${String(index)}`,
    sourceConceptId: `concept-${String(index)}`,
    targetConceptId: `concept-${String(index + 1)}`,
    relation: "related",
    confidenceBasisPoints: 9_000,
    originDocumentIds: ["doc"],
  }));
  return { concepts, edges, truncated: false };
}

describe("ambient graph sampling", () => {
  it("renders nothing for a missing or empty index", () => {
    expect(sampleAmbientGraph(null).nodes).toEqual([]);
    expect(sampleAmbientGraph(graphOf(0)).nodes).toEqual([]);
  });

  it("caps the sample so a large vault stays cheap", () => {
    const layout = sampleAmbientGraph(graphOf(120, 60));

    expect(layout.nodes).toHaveLength(AMBIENT_NODE_LIMIT);
  });

  it("keeps only edges whose both ends survived the sample", () => {
    const layout = sampleAmbientGraph(graphOf(40, 39), 6);
    const kept = new Set(layout.nodes.map((node) => node.id));

    expect(layout.nodes).toHaveLength(6);
    for (const edge of layout.edges) {
      expect(kept.has(edge.source)).toBe(true);
      expect(kept.has(edge.target)).toBe(true);
    }
  });

  it("lays every node out inside the ambient bounds", () => {
    const layout = sampleAmbientGraph(graphOf(20, 12));

    for (const node of layout.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.x).toBeLessThanOrEqual(layout.width);
      expect(node.y).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeLessThanOrEqual(layout.height);
    }
  });

  it("is the same layout for the same graph", () => {
    expect(sampleAmbientGraph(graphOf(12, 8)).nodes).toEqual(
      sampleAmbientGraph(graphOf(12, 8)).nodes,
    );
  });
});

describe("ambient drift", () => {
  const node = {
    id: "concept-0",
    x: 100,
    y: 100,
    radius: 6,
    phase: 0.4,
    speed: 1,
  };

  it("wanders within a small radius and never arrives anywhere", () => {
    for (let elapsed = 0; elapsed <= 120_000; elapsed += 500) {
      const offset = ambientDrift(node, elapsed);
      expect(Math.hypot(offset.x, offset.y)).toBeLessThanOrEqual(18);
    }
  });

  it("moves slowly enough that a frame is a sub-pixel step", () => {
    const first = ambientDrift(node, 0);
    const next = ambientDrift(node, 90);

    expect(Math.hypot(next.x - first.x, next.y - first.y)).toBeLessThan(1);
  });

  it("gives different nodes different phases of the same wander", () => {
    const other = { ...node, id: "concept-1", phase: 2.1, speed: 1.3 };

    expect(ambientDrift(node, 5_000)).not.toEqual(ambientDrift(other, 5_000));
  });
});
