import {
  createGraphSimulation,
  settleGraphSimulation,
} from "./forceSimulation";
import type { GraphView } from "./types";

/** Enough to read as a fragment of something larger, cheap enough to ignore. */
export const AMBIENT_NODE_LIMIT = 16;

export interface AmbientNode {
  id: string;
  x: number;
  y: number;
  radius: number;
  /** Per-node phase, so the drift never looks like one rigid body moving. */
  phase: number;
  speed: number;
}

export interface AmbientEdge {
  id: string;
  source: string;
  target: string;
}

export interface AmbientLayout {
  nodes: AmbientNode[];
  edges: AmbientEdge[];
  width: number;
  height: number;
}

const AMBIENT_BOUNDS = { width: 900, height: 620 };

function deterministicUnit(value: string, salt: number) {
  let hash = (2_166_136_261 ^ salt) >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  return (hash + 0.5) / 4_294_967_296;
}

/**
 * Samples the vault's graph down to a sparse ambient fragment (#35): the most
 * connected concepts, plus only the edges that survive between them. Returns
 * an empty layout for an empty or still-building index, so the Ingest surface
 * renders exactly as it did before.
 */
export function sampleAmbientGraph(
  graph: GraphView | null,
  limit = AMBIENT_NODE_LIMIT,
): AmbientLayout {
  const empty: AmbientLayout = {
    nodes: [],
    edges: [],
    ...AMBIENT_BOUNDS,
  };
  if (!graph || graph.concepts.length === 0) return empty;

  const degree = new Map<string, number>();
  for (const edge of graph.edges) {
    degree.set(
      edge.sourceConceptId,
      (degree.get(edge.sourceConceptId) ?? 0) + 1,
    );
    degree.set(
      edge.targetConceptId,
      (degree.get(edge.targetConceptId) ?? 0) + 1,
    );
  }
  const sampled = [...graph.concepts]
    .sort(
      (left, right) =>
        (degree.get(right.id) ?? 0) - (degree.get(left.id) ?? 0) ||
        left.id.localeCompare(right.id),
    )
    .slice(0, Math.max(0, limit));
  if (sampled.length === 0) return empty;

  const kept = new Set(sampled.map((concept) => concept.id));
  const edges = graph.edges
    .filter(
      (edge) =>
        kept.has(edge.sourceConceptId) && kept.has(edge.targetConceptId),
    )
    .map((edge) => ({
      id: edge.id,
      source: edge.sourceConceptId,
      target: edge.targetConceptId,
    }));

  // The layout is settled once, up front: the ambient layer drifts around a
  // fixed arrangement instead of paying for a live simulation every frame.
  const simulation = createGraphSimulation(
    {
      nodes: sampled.map((concept) => ({
        id: concept.id,
        degree: degree.get(concept.id) ?? 0,
      })),
      edges: edges.map((edge) => ({
        source: edge.source,
        target: edge.target,
      })),
    },
    AMBIENT_BOUNDS,
  );
  settleGraphSimulation(simulation, 220);

  return {
    nodes: [...simulation.nodes.values()].map((node) => ({
      id: node.id,
      x: node.x,
      y: node.y,
      radius: node.radius,
      phase: deterministicUnit(node.id, 0x51_ed_27_0b) * Math.PI * 2,
      speed: 0.6 + deterministicUnit(node.id, 0x9e_37_79_b9) * 0.8,
    })),
    edges,
    ...AMBIENT_BOUNDS,
  };
}

/** One full wander takes tens of seconds, and no node ever arrives anywhere. */
const DRIFT_RADIUS = 14;
const DRIFT_PERIOD_MS = 42_000;

/** The offset a node sits at for a given time, in layout units. */
export function ambientDrift(node: AmbientNode, elapsedMs: number) {
  const t = (elapsedMs / DRIFT_PERIOD_MS) * Math.PI * 2 * node.speed;
  return {
    x: Math.cos(t + node.phase) * DRIFT_RADIUS,
    y: Math.sin(t * 0.8 + node.phase * 1.3) * DRIFT_RADIUS * 0.7,
  };
}
