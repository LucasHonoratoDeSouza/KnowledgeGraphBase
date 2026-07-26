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
  targetX: number | null;
  targetY: number | null;
  targetFresh: boolean;
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
  collisionGap: number;
}

const INITIAL_ALPHA = 0.72;
const DRAG_ALPHA = 0.58;
const RELEASE_ALPHA = 0.28;
const MIN_ALPHA = 0.002;
const STOP_SPEED = 0.025;
const VELOCITY_DECAY = 0.82;
const ALPHA_DECAY = 0.93;
const SPRING_LENGTH = 118;
const SPRING_STRENGTH = 0.045;
const CHARGE_RADIUS = 112;
const CHARGE_STRENGTH = 1.1;
const DRAG_CHARGE_STRENGTH = 4.4;
const COLLISION_GAP = 8;
const COLLISION_EPSILON = 0.01;
const GRID_SIZE = CHARGE_RADIUS;
const DRAG_FOLLOW = 0.35;
const DRAG_MAX_STEP = 135;
const DRAG_SNAP_DISTANCE = 12;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function densityScale(nodeCount: number) {
  return Math.min(1, Math.sqrt(90 / Math.max(1, nodeCount)));
}

function deterministicUnit(value: string, salt: number) {
  let hash = (2_166_136_261 ^ salt) >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  return (hash + 0.5) / 4_294_967_296;
}

/**
 * Seeds a stable shape-free scatter in O(n). The initial frame is useful
 * immediately, while graph forces refine it across animation frames.
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
  const nodes = new Map<string, SimulationNode>();
  const geometryScale = densityScale(ordered.length);

  ordered.forEach((item) => {
    const radius = Math.max(3, radiusFor(item.degree) * geometryScale);
    const padding = radius + 8;
    const x = clamp(
      padding +
        deterministicUnit(item.id, 0x9e37_79b9) *
          Math.max(0, bounds.width - padding * 2),
      radius,
      bounds.width - radius,
    );
    const y = clamp(
      padding +
        deterministicUnit(item.id, 0x85eb_ca6b) *
          Math.max(0, bounds.height - padding * 2),
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
      targetX: null,
      targetY: null,
      targetFresh: false,
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
    collisionGap: Math.max(2, COLLISION_GAP * geometryScale),
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
  const targetX = clamp(x, node.radius, simulation.width - node.radius);
  const targetY = clamp(y, node.radius, simulation.height - node.radius);
  if (!node.fixed) {
    node.vx = 0;
    node.vy = 0;
  }
  node.fixed = true;
  node.targetFresh = node.targetX !== targetX || node.targetY !== targetY;
  node.targetX = targetX;
  node.targetY = targetY;
  reheatGraphSimulation(simulation, DRAG_ALPHA);
  return true;
}

export function releaseGraphNode(simulation: GraphSimulation, id: string) {
  const node = simulation.nodes.get(id);
  if (!node) return false;
  node.fixed = false;
  node.targetX = null;
  node.targetY = null;
  node.targetFresh = false;
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
    const strength =
      left.fixed || right.fixed ? DRAG_CHARGE_STRENGTH : CHARGE_STRENGTH;
    const force = (1 - distance / CHARGE_RADIUS) * strength * alpha;
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

function resolveCollisions(nodes: SimulationNode[], collisionGap: number) {
  forEachNearbyPair(nodes, (left, right) => {
    const { distance, ux, uy } = directionBetween(left, right);
    const overlap = left.radius + right.radius + collisionGap - distance;
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

function hasVisibleOverlap(nodes: SimulationNode[]) {
  let overlap = false;
  forEachNearbyPair(nodes, (left, right) => {
    if (overlap) return;
    const distance = Math.hypot(right.x - left.x, right.y - left.y);
    if (distance < left.radius + right.radius - COLLISION_EPSILON) {
      overlap = true;
    }
  });
  return overlap;
}

function followDragTarget(
  node: SimulationNode,
  nodes: SimulationNode[],
  simulation: GraphSimulation,
) {
  if (!node.fixed || node.targetX === null || node.targetY === null) {
    return false;
  }
  const dx = node.targetX - node.x;
  const dy = node.targetY - node.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.001) {
    node.x = node.targetX;
    node.y = node.targetY;
    node.vx = 0;
    node.vy = 0;
    node.targetFresh = false;
    return false;
  }

  const regularStep = Math.min(DRAG_MAX_STEP, distance * DRAG_FOLLOW);
  const shouldSnap =
    !node.targetFresh && distance - regularStep <= DRAG_SNAP_DISTANCE;
  const step = shouldSnap ? distance : regularStep;
  const stepX = (dx / distance) * step;
  const stepY = (dy / distance) * step;
  const safeSubstep = Math.max(
    6,
    Math.min(16, node.radius + simulation.collisionGap),
  );
  const substeps = Math.max(1, Math.ceil(step / safeSubstep));
  for (let substep = 0; substep < substeps; substep += 1) {
    node.x += stepX / substeps;
    node.y += stepY / substeps;
    for (const other of nodes) {
      if (other === node || other.fixed) continue;
      const { distance: separation, ux, uy } = directionBetween(node, other);
      const overlap =
        node.radius + other.radius + simulation.collisionGap - separation;
      if (overlap <= 0) continue;
      other.x += ux * overlap;
      other.y += uy * overlap;
      other.vx += ux * Math.min(3, overlap * 0.12);
      other.vy += uy * Math.min(3, overlap * 0.12);
      clampNode(other, simulation);
    }
  }
  node.vx = stepX;
  node.vy = stepY;
  node.targetFresh = false;
  return !shouldSnap;
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
  let targetPending = false;
  for (const node of nodes) {
    if (followDragTarget(node, nodes, simulation)) targetPending = true;
  }

  const alpha = simulation.alpha > MIN_ALPHA ? simulation.alpha : 0;
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
  for (const node of nodes) {
    if (node.fixed) continue;
    node.vx *= VELOCITY_DECAY;
    node.vy *= VELOCITY_DECAY;
    node.x += node.vx;
    node.y += node.vy;
    clampNode(node, simulation);
  }

  // Repeated local passes let dense pockets open without an all-pairs sweep.
  for (let pass = 0; pass < 2; pass += 1) {
    resolveCollisions(nodes, simulation.collisionGap);
    for (const node of nodes) clampNode(node, simulation);
  }

  simulation.alpha = alpha * ALPHA_DECAY;
  if (simulation.alpha <= MIN_ALPHA) simulation.alpha = 0;
  const maxSpeed = nodes.reduce(
    (maximum, node) =>
      node.fixed ? maximum : Math.max(maximum, Math.hypot(node.vx, node.vy)),
    0,
  );
  if (
    simulation.alpha === 0 &&
    maxSpeed <= STOP_SPEED &&
    !targetPending &&
    !hasVisibleOverlap(nodes)
  ) {
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
    if (!tickGraphSimulation(simulation)) return { settled: true, ticks: tick };
  }
  return { settled: false, ticks: maximumTicks };
}
