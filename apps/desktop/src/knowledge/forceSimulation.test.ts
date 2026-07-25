import { describe, expect, it } from "vitest";

import {
  createGraphSimulation,
  dragGraphNode,
  releaseGraphNode,
  settleGraphSimulation,
  tickGraphSimulation,
} from "./forceSimulation";

describe("interactive force simulation", () => {
  it("seeds the same bounded graph without running a settled layout", () => {
    const input = {
      nodes: Array.from({ length: 500 }, (_, index) => ({
        id: `concept-${String(index)}`,
        degree: index % 7,
      })),
      edges: [],
    };

    const first = createGraphSimulation(input);
    const second = createGraphSimulation(input);

    expect(
      [...first.nodes.values()].map(({ id, x, y }) => ({ id, x, y })),
    ).toEqual([...second.nodes.values()].map(({ id, x, y }) => ({ id, x, y })));
    for (const node of first.nodes.values()) {
      expect(node.x).toBeGreaterThanOrEqual(node.radius);
      expect(node.x).toBeLessThanOrEqual(first.width - node.radius);
      expect(node.y).toBeGreaterThanOrEqual(node.radius);
      expect(node.y).toBeLessThanOrEqual(first.height - node.radius);
    }
  });

  it("pins a dragged node and pulls its connected neighbor", () => {
    const simulation = createGraphSimulation({
      nodes: [
        { id: "dragged", degree: 1 },
        { id: "neighbor", degree: 1 },
      ],
      edges: [{ source: "dragged", target: "neighbor" }],
    });
    const neighbor = simulation.nodes.get("neighbor");
    expect(neighbor).toBeDefined();
    const before = { x: neighbor?.x ?? 0, y: neighbor?.y ?? 0 };

    expect(dragGraphNode(simulation, "dragged", 720, 260)).toBe(true);
    for (let frame = 0; frame < 12; frame += 1) {
      tickGraphSimulation(simulation);
    }

    const dragged = simulation.nodes.get("dragged");
    expect(dragged?.x).toBeCloseTo(720, 5);
    expect(dragged?.y).toBeCloseTo(260, 5);
    expect(dragged?.fixed).toBe(true);
    expect(
      Math.hypot((neighbor?.x ?? 0) - before.x, (neighbor?.y ?? 0) - before.y),
    ).toBeGreaterThan(0.5);
  });

  it("releases, separates and settles nodes inside the stage", () => {
    const simulation = createGraphSimulation({
      nodes: [
        { id: "a", degree: 1 },
        { id: "b", degree: 1 },
        { id: "c", degree: 0 },
      ],
      edges: [{ source: "a", target: "b" }],
    });
    const a = simulation.nodes.get("a");
    const b = simulation.nodes.get("b");
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    if (!a || !b) return;
    a.x = 400;
    a.y = 260;
    b.x = 400;
    b.y = 260;

    dragGraphNode(simulation, "a", 420, 260);
    expect(releaseGraphNode(simulation, "a")).toBe(true);
    const ticks = settleGraphSimulation(simulation);

    expect(ticks).toBeLessThanOrEqual(360);
    expect(a.fixed).toBe(false);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThanOrEqual(
      a.radius + b.radius,
    );
    for (const node of simulation.nodes.values()) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
      expect(node.x).toBeGreaterThanOrEqual(node.radius);
      expect(node.x).toBeLessThanOrEqual(simulation.width - node.radius);
      expect(node.y).toBeGreaterThanOrEqual(node.radius);
      expect(node.y).toBeLessThanOrEqual(simulation.height - node.radius);
    }
    expect(tickGraphSimulation(simulation)).toBe(false);
  });

  it("ignores missing edge endpoints and unknown drag targets", () => {
    const simulation = createGraphSimulation({
      nodes: [{ id: "known", degree: 1 }],
      edges: [{ source: "known", target: "missing" }],
    });

    expect(simulation.links).toHaveLength(0);
    expect(dragGraphNode(simulation, "missing", 10, 10)).toBe(false);
    settleGraphSimulation(simulation);
    const known = simulation.nodes.get("known");
    expect(known).toBeDefined();
    expect(Number.isFinite(known?.x ?? Number.NaN)).toBe(true);
    expect(Number.isFinite(known?.y ?? Number.NaN)).toBe(true);
  });
});
