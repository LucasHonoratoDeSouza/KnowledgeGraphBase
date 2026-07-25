/**
 * A small force-directed layout for the knowledge graph (#13).
 *
 * Hand-rolled instead of pulling in d3-force: the app ships offline and only
 * needs repulsion, spring edges, centering and collision. The simulation is
 * deterministic for a given input — seeded placement, fixed step order — so
 * the same vault always lays out the same way and the result is testable.
 */

export interface LayoutInput {
  nodes: { id: string; degree: number }[];
  edges: { source: string; target: string }[];
}

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  radius: number;
  degree: number;
}

export interface LayoutOptions {
  width: number;
  height: number;
  iterations: number;
}

export const DEFAULT_LAYOUT_OPTIONS: LayoutOptions = {
  width: 800,
  height: 520,
  iterations: 320,
};

/** Bigger for better-connected concepts, but bounded so hubs stay readable. */
export function radiusFor(degree: number) {
  return Math.min(20, 7 + degree * 1.6);
}

function seededAngle(index: number, total: number) {
  // Golden-angle placement spreads the initial ring evenly for any count,
  // which keeps the simulation from starting inside its own collisions.
  return index * 2.399_963_229_728_653 + (total > 0 ? 0 : 0);
}

export function layoutGraph(
  input: LayoutInput,
  options: LayoutOptions = DEFAULT_LAYOUT_OPTIONS,
): LayoutNode[] {
  const { width, height, iterations } = options;
  const centerX = width / 2;
  const centerY = height / 2;
  const ordered = [...input.nodes].sort(
    (left, right) =>
      right.degree - left.degree || left.id.localeCompare(right.id),
  );
  const nodes = ordered.map((node, index) => {
    const angle = seededAngle(index, ordered.length);
    const spread = index === 0 ? 0 : 40 + Math.sqrt(index) * 46;
    return {
      id: node.id,
      degree: node.degree,
      radius: radiusFor(node.degree),
      x: centerX + Math.cos(angle) * spread,
      y: centerY + Math.sin(angle) * spread,
      vx: 0,
      vy: 0,
    };
  });
  const index = new Map(nodes.map((node) => [node.id, node]));
  const edges = input.edges.flatMap((edge) => {
    const source = index.get(edge.source);
    const target = index.get(edge.target);
    return source && target && source !== target ? [{ source, target }] : [];
  });

  for (let step = 0; step < iterations; step += 1) {
    const cooling = 1 - step / iterations;

    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i];
        const b = nodes[j];
        if (!a || !b) continue;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let distance = Math.hypot(dx, dy);
        if (distance < 0.01) {
          // Perfectly coincident nodes have no direction to separate along;
          // nudge them apart deterministically instead of dividing by zero.
          dx = (i - j) % 2 === 0 ? 0.5 : -0.5;
          dy = 0.5;
          distance = Math.hypot(dx, dy);
        }
        const repulsion = (26_000 / (distance * distance)) * cooling;
        const ux = dx / distance;
        const uy = dy / distance;
        a.vx -= ux * repulsion;
        a.vy -= uy * repulsion;
        b.vx += ux * repulsion;
        b.vy += uy * repulsion;

        const overlap = a.radius + b.radius + 14 - distance;
        if (overlap > 0) {
          a.x -= ux * overlap * 0.5;
          a.y -= uy * overlap * 0.5;
          b.x += ux * overlap * 0.5;
          b.y += uy * overlap * 0.5;
        }
      }
    }

    for (const edge of edges) {
      const dx = edge.target.x - edge.source.x;
      const dy = edge.target.y - edge.source.y;
      const distance = Math.max(Math.hypot(dx, dy), 0.01);
      const rest = 118;
      const force = (distance - rest) * 0.012 * cooling;
      const ux = dx / distance;
      const uy = dy / distance;
      edge.source.vx += ux * force;
      edge.source.vy += uy * force;
      edge.target.vx -= ux * force;
      edge.target.vy -= uy * force;
    }

    for (const node of nodes) {
      node.vx += (centerX - node.x) * 0.004 * cooling;
      node.vy += (centerY - node.y) * 0.004 * cooling;
      node.vx *= 0.82;
      node.vy *= 0.82;
      node.x += node.vx;
      node.y += node.vy;
      const margin = node.radius + 26;
      node.x = Math.min(width - margin, Math.max(margin, node.x));
      node.y = Math.min(height - margin, Math.max(margin, node.y));
    }
  }

  return nodes.map(({ id, x, y, radius, degree }) => ({
    id,
    x,
    y,
    radius,
    degree,
  }));
}
