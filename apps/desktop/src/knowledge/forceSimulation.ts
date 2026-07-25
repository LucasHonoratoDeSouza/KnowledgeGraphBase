import {
  DEFAULT_LAYOUT_OPTIONS,
  radiusFor,
  type LayoutInput,
} from "./forceLayout";

export interface SimulationNode {
  id: string;
  x: number;
  y: number;
  radius: number;
  degree: number;
  vx: number;
  vy: number;
  fixed: boolean;
}

export interface SimulationLink {
  source: SimulationNode;
  target: SimulationNode;
}

export interface GraphSimulation {
  nodes: Map<string, SimulationNode>;
  links: SimulationLink[];
  width: number;
  height: number;
  alpha: number;
}

const GOLDEN_ANGLE = 2.399_963_229_728_653;
const INITIAL_ALPHA = 0.72;
const DRAG_ALPHA = 0.58;
const RELEASE_ALPHA = 0.28;
const MIN_ALPHA = 0.002;
const STOP_SPEED = 0.025;
const VELOCITY_DECAY = 0.82;
const ALPHA_DECAY = 0.93;
const SPRING_LENGTH = 118;
const SPRING_STRENGTH = 0.045;
const CENTER_STRENGTH = 0.0008;
const CHARGE_RADIUS = 112;
const CHARGE_STRENGTH = 0.9;
const COLLISION_GAP = 8;
const GRID_SIZE = CHARGE_RADIUS;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * Seeds a stable sunflower distribution in O(n). The initial frame is useful
 * immediately, while the live simulation can refine it across animation frames.
 */
export function createGraphSimulation(
  input: LayoutInput,
  bounds: {
    width: number;
    height: number;
  } = DEFAULT_LAYOUT_OPTIONS,
): GraphSimulation {
  const ordered = [...input.nodes].sort(
    (left, right) =>
      right.degree - left.degree || left.id.localeCompare(right.id),
  );
  const centerX = bounds.width / 2;
  const centerY = bounds.height / 2;
  const spreadX = Math.max(0, centerX - 42);
  const spreadY = Math.max(0, centerY - 42);
  const denominator = Math.max(1, ordered.length - 1);
  const nodes = new Map<string, SimulationNode>();

  ordered.forEach((item, index) => {
    const radius = radiusFor(item.degree);
    const distance = index === 0 ? 0 : Math.sqrt(index / denominator);
    const angle = index * GOLDEN_ANGLE;
    const x = clamp(
      centerX + Math.cos(angle) * spreadX * distance,
      radius,
      bounds.width - radius,
    );
    const y = clamp(
      centerY + Math.sin(angle) * spreadY * distance,
      radius,
      bounds.height - radius,
    );
    nodes.set(item.id, {
      id: item.id,
      degree: item.degree,
      radius,
      x,
      y,
      vx: 0,
      vy: 0,
      fixed: false,
    });
  });

  const links = input.edges.flatMap((edge) => {
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);
    return source && target && source !== target ? [{ source, target }] : [];
  });

  return {
    nodes,
    links,
    width: bounds.width,
    height: bounds.height,
    alpha: nodes.size > 1 ? INITIAL_ALPHA : 0,
  };
}

export function reheatGraphSimulation(
  simulation: GraphSimulation,
  alpha = RELEASE_ALPHA,
) {
  simulation.alpha = Math.max(simulation.alpha, alpha);
}

export function dragGraphNode(
  simulation: GraphSimulation,
  id: string,
  x: number,
  y: number,
) {
  const node = simulation.nodes.get(id);
  if (!node) return false;
  node.x = clamp(x, node.radius, simulation.width - node.radius);
  node.y = clamp(y, node.radius, simulation.height - node.radius);
  node.vx = 0;
  node.vy = 0;
  node.fixed = true;
  reheatGraphSimulation(simulation, DRAG_ALPHA);
  return true;
}

export function releaseGraphNode(simulation: GraphSimulation, id: string) {
  const node = simulation.nodes.get(id);
  if (!node) return false;
  node.fixed = false;
  reheatGraphSimulation(simulation, RELEASE_ALPHA);
  return true;
}

function gridKey(column: number, row: number) {
  return `${String(column)}:${String(row)}`;
}

function buildGrid(nodes: SimulationNode[]) {
  const grid = new Map<string, number[]>();
  nodes.forEach((node, index) => {
    const column = Math.floor(node.x / GRID_SIZE);
    const row = Math.floor(node.y / GRID_SIZE);
    const key = gridKey(column, row);
    const bucket = grid.get(key);
    if (bucket) bucket.push(index);
    else grid.set(key, [index]);
  });
  return grid;
}

function forEachNearbyPair(
  nodes: SimulationNode[],
  callback: (left: SimulationNode, right: SimulationNode) => void,
) {
  const grid = buildGrid(nodes);
  nodes.forEach((node, index) => {
    const column = Math.floor(node.x / GRID_SIZE);
    const row = Math.floor(node.y / GRID_SIZE);
    for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
      for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
        const bucket = grid.get(
          gridKey(column + columnOffset, row + rowOffset),
        );
        if (!bucket) continue;
        for (const candidateIndex of bucket) {
          if (candidateIndex <= index) continue;
          const candidate = nodes[candidateIndex];
          if (candidate) callback(node, candidate);
        }
      }
    }
  });
}

function directionBetween(left: SimulationNode, right: SimulationNode) {
  let dx = right.x - left.x;
  let dy = right.y - left.y;
  let distance = Math.hypot(dx, dy);
  if (distance < 0.001) {
    dx = left.id.localeCompare(right.id) <= 0 ? 1 : -1;
    dy = 0;
    distance = 1;
  }
  return { dx, dy, distance, ux: dx / distance, uy: dy / distance };
}

function applyLocalCharge(nodes: SimulationNode[], alpha: number) {
  forEachNearbyPair(nodes, (left, right) => {
    const { distance, ux, uy } = directionBetween(left, right);
    if (distance >= CHARGE_RADIUS) return;
    const force = (1 - distance / CHARGE_RADIUS) * CHARGE_STRENGTH * alpha;
    if (!left.fixed) {
      left.vx -= ux * force;
      left.vy -= uy * force;
    }
    if (!right.fixed) {
      right.vx += ux * force;
      right.vy += uy * force;
    }
  });
}

function resolveCollisions(nodes: SimulationNode[]) {
  forEachNearbyPair(nodes, (left, right) => {
    const { distance, ux, uy } = directionBetween(left, right);
    const overlap = left.radius + right.radius + COLLISION_GAP - distance;
    if (overlap <= 0) return;

    if (left.fixed && right.fixed) return;
    if (left.fixed) {
      right.x += ux * overlap;
      right.y += uy * overlap;
      return;
    }
    if (right.fixed) {
      left.x -= ux * overlap;
      left.y -= uy * overlap;
      return;
    }
    left.x -= ux * overlap * 0.5;
    left.y -= uy * overlap * 0.5;
    right.x += ux * overlap * 0.5;
    right.y += uy * overlap * 0.5;
  });
}

function clampNode(node: SimulationNode, simulation: GraphSimulation) {
  const x = clamp(node.x, node.radius, simulation.width - node.radius);
  const y = clamp(node.y, node.radius, simulation.height - node.radius);
  if (x !== node.x) node.vx = 0;
  if (y !== node.y) node.vy = 0;
  node.x = x;
  node.y = y;
}

/** Advances one inexpensive frame; returns whether another frame is useful. */
export function tickGraphSimulation(simulation: GraphSimulation) {
  const nodes = [...simulation.nodes.values()];
  const moving = nodes.some(
    (node) => Math.abs(node.vx) > STOP_SPEED || Math.abs(node.vy) > STOP_SPEED,
  );
  if (simulation.alpha <= MIN_ALPHA && !moving) {
    simulation.alpha = 0;
    for (const node of nodes) {
      node.vx = 0;
      node.vy = 0;
    }
    return false;
  }

  const alpha = Math.max(simulation.alpha, MIN_ALPHA);
  for (const link of simulation.links) {
    const { distance, ux, uy } = directionBetween(link.source, link.target);
    const force = (distance - SPRING_LENGTH) * SPRING_STRENGTH * alpha;
    if (!link.source.fixed) {
      link.source.vx += ux * force;
      link.source.vy += uy * force;
    }
    if (!link.target.fixed) {
      link.target.vx -= ux * force;
      link.target.vy -= uy * force;
    }
  }

  applyLocalCharge(nodes, alpha);
  const centerX = simulation.width / 2;
  const centerY = simulation.height / 2;
  for (const node of nodes) {
    if (node.fixed) continue;
    node.vx += (centerX - node.x) * CENTER_STRENGTH * alpha;
    node.vy += (centerY - node.y) * CENTER_STRENGTH * alpha;
    node.vx *= VELOCITY_DECAY;
    node.vy *= VELOCITY_DECAY;
    node.x += node.vx;
    node.y += node.vy;
    clampNode(node, simulation);
  }

  // Two local passes resolve dense pockets without an all-pairs sweep.
  resolveCollisions(nodes);
  resolveCollisions(nodes);
  for (const node of nodes) clampNode(node, simulation);

  simulation.alpha *= ALPHA_DECAY;
  const maxSpeed = nodes.reduce(
    (maximum, node) => Math.max(maximum, Math.hypot(node.vx, node.vy)),
    0,
  );
  if (simulation.alpha <= MIN_ALPHA && maxSpeed <= STOP_SPEED) {
    simulation.alpha = 0;
    for (const node of nodes) {
      node.vx = 0;
      node.vy = 0;
    }
    return false;
  }
  return true;
}

export function settleGraphSimulation(
  simulation: GraphSimulation,
  maximumTicks = 360,
) {
  for (let tick = 1; tick <= maximumTicks; tick += 1) {
    if (!tickGraphSimulation(simulation)) return tick;
  }
  return maximumTicks;
}
