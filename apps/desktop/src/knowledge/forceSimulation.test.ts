import { describe, expect, it } from "vitest";

import {
  createGraphSimulation,
  dragGraphNode,
  type GraphSimulation,
  releaseGraphNode,
  settleGraphSimulation,
  tickGraphSimulation,
} from "./forceSimulation";

function expectBoundedAndSeparated(simulation: GraphSimulation) {
  const nodes = [...simulation.nodes.values()];
  expect(simulation.alpha).toBeLessThanOrEqual(0.002);
  expect(
    Math.max(...nodes.map((node) => Math.hypot(node.vx, node.vy))),
  ).toBeLessThan(0.025);
  let minimumClearance = Number.POSITIVE_INFINITY;
  for (const [index, node] of nodes.entries()) {
    expect(Number.isFinite(node.x)).toBe(true);
    expect(Number.isFinite(node.y)).toBe(true);
    expect(node.x).toBeGreaterThanOrEqual(node.radius);
    expect(node.x).toBeLessThanOrEqual(simulation.width - node.radius);
    expect(node.y).toBeGreaterThanOrEqual(node.radius);
    expect(node.y).toBeLessThanOrEqual(simulation.height - node.radius);
    for (const other of nodes.slice(index + 1)) {
      minimumClearance = Math.min(
        minimumClearance,
        Math.hypot(other.x - node.x, other.y - node.y) -
          node.radius -
          other.radius,
      );
    }
  }
  expect(minimumClearance).toBeGreaterThanOrEqual(-0.01);
}

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
    const quadrants = new Set(
      [...first.nodes.values()].map(
        (node) =>
          `${node.x < 400 ? "left" : "right"}-${node.y < 260 ? "top" : "bottom"}`,
      ),
    );
    expect(quadrants).toEqual(
      new Set(["left-top", "right-top", "left-bottom", "right-bottom"]),
    );
  });

  it("gives a dragged node weight and pulls its connected neighbor", () => {
    const simulation = createGraphSimulation({
      nodes: [
        { id: "dragged", degree: 1 },
        { id: "neighbor", degree: 1 },
      ],
      edges: [{ source: "dragged", target: "neighbor" }],
    });
    const dragged = simulation.nodes.get("dragged");
    const neighbor = simulation.nodes.get("neighbor");
    expect(dragged).toBeDefined();
    expect(neighbor).toBeDefined();
    if (!dragged || !neighbor) return;
    dragged.x = 180;
    dragged.y = 260;
    neighbor.x = 620;
    neighbor.y = 260;
    const before = { x: neighbor.x, y: neighbor.y };

    expect(dragGraphNode(simulation, "dragged", 360, 260)).toBe(true);
    tickGraphSimulation(simulation);
    expect(dragged.x).toBeGreaterThan(180);
    expect(dragged.x).toBeLessThan(360);
    for (let frame = 1; frame < 12; frame += 1) {
      tickGraphSimulation(simulation);
    }

    expect(dragged.x).toBeCloseTo(360, 5);
    expect(dragged.y).toBeCloseTo(260, 5);
    expect(dragged.fixed).toBe(true);
    expect(
      Math.hypot(neighbor.x - before.x, neighbor.y - before.y),
    ).toBeGreaterThan(20);
  });

  it("opens small graphs as separated components with hubs and depth layers", () => {
    const simulation = createGraphSimulation({
      nodes: [
        { id: "a-hub", degree: 2 },
        { id: "a-near", degree: 2 },
        { id: "a-leaf", degree: 1 },
        { id: "a-deep", degree: 1 },
        { id: "b-hub", degree: 2 },
        { id: "b-left", degree: 1 },
        { id: "b-right", degree: 1 },
      ],
      edges: [
        { source: "a-hub", target: "a-near" },
        { source: "a-hub", target: "a-leaf" },
        { source: "a-near", target: "a-deep" },
        { source: "b-hub", target: "b-left" },
        { source: "b-hub", target: "b-right" },
      ],
    });
    const node = (id: string) => {
      const found = simulation.nodes.get(id);
      expect(found).toBeDefined();
      if (!found) throw new Error(`missing seed node ${id}`);
      return found;
    };
    const aNodes = ["a-hub", "a-near", "a-leaf", "a-deep"].map(node);
    const bNodes = ["b-hub", "b-left", "b-right"].map(node);
    const aHub = node("a-hub");
    const near = node("a-near");
    const deep = node("a-deep");

    expect(Math.max(...aNodes.map((item) => item.x))).toBeLessThan(
      Math.min(...bNodes.map((item) => item.x)),
    );
    expect(Math.hypot(near.x - aHub.x, near.y - aHub.y)).toBeGreaterThan(40);
    expect(Math.hypot(deep.x - aHub.x, deep.y - aHub.y)).toBeGreaterThan(
      Math.hypot(near.x - aHub.x, near.y - aHub.y),
    );
  });

  it("smoothly clears an unconnected node from a dragged path", () => {
    const simulation = createGraphSimulation({
      nodes: [
        { id: "dragged", degree: 0 },
        { id: "nearby", degree: 0 },
      ],
      edges: [],
    });
    const dragged = simulation.nodes.get("dragged");
    const nearby = simulation.nodes.get("nearby");
    expect(dragged).toBeDefined();
    expect(nearby).toBeDefined();
    if (!dragged || !nearby) return;
    dragged.x = 100;
    dragged.y = 260;
    nearby.x = 260;
    nearby.y = 260;

    dragGraphNode(simulation, "dragged", 400, 260);
    tickGraphSimulation(simulation);

    expect(dragged.x).toBeGreaterThan(100);
    expect(dragged.x).toBeLessThan(400);
    expect(nearby.x).toBeGreaterThan(260);
    expect(
      Math.hypot(nearby.x - dragged.x, nearby.y - dragged.y),
    ).toBeGreaterThanOrEqual(dragged.radius + nearby.radius);
    for (let tick = 1; tick < 12; tick += 1) {
      tickGraphSimulation(simulation);
    }
    expect(dragged.x).toBeCloseTo(400, 5);
    expect(nearby.x).toBeGreaterThan(400);
    expect(
      Math.hypot(nearby.x - dragged.x, nearby.y - dragged.y),
    ).toBeGreaterThanOrEqual(dragged.radius + nearby.radius);
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
    const result = settleGraphSimulation(simulation);

    expect(result).toMatchObject({ settled: true });
    expect(result.ticks).toBeLessThanOrEqual(360);
    expect(a.fixed).toBe(false);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThanOrEqual(
      a.radius + b.radius,
    );
    expectBoundedAndSeparated(simulation);
    expect(tickGraphSimulation(simulation)).toBe(false);
  });

  it.each([100, 500])(
    "settles a dense %i-node ring without visible overlaps",
    (nodeCount) => {
      const simulation = createGraphSimulation({
        nodes: Array.from({ length: nodeCount }, (_, index) => ({
          id: `node-${String(index).padStart(3, "0")}`,
          degree: 20,
        })),
        edges: Array.from({ length: nodeCount }, (_, index) => ({
          source: `node-${String(index).padStart(3, "0")}`,
          target: `node-${String((index + 1) % nodeCount).padStart(3, "0")}`,
        })),
      });
      const draggedId = "node-000";
      const dragged = simulation.nodes.get(draggedId);
      expect(dragged).toBeDefined();
      if (!dragged) return;
      expect(
        dragGraphNode(
          simulation,
          draggedId,
          simulation.width - dragged.radius,
          simulation.height / 2,
        ),
      ).toBe(true);
      for (let tick = 0; tick < 8; tick += 1) {
        tickGraphSimulation(simulation);
      }
      expect(releaseGraphNode(simulation, draggedId)).toBe(true);

      const result = settleGraphSimulation(simulation);

      expect(result.settled).toBe(true);
      expect(result.ticks).toBeLessThanOrEqual(360);
      expectBoundedAndSeparated(simulation);
      expect(tickGraphSimulation(simulation)).toBe(false);
    },
  );

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
