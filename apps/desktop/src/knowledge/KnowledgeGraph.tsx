import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";

import {
  MoreHorizontal,
  RotateCcw,
  Search,
  SlidersHorizontal,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import {
  createGraphSimulation,
  dragGraphNode,
  releaseGraphNode,
  settleGraphSimulation,
  tickGraphSimulation,
  type GraphSimulation,
} from "./forceSimulation";
import {
  DEFAULT_GRAPH_VIEWPORT,
  panViewportByPixels,
  viewBoxFor,
  zoomViewportAt,
  type GraphViewport,
} from "./graphViewport";
import type { GraphView } from "./types";

const EMPTY_CONCEPTS: GraphView["concepts"] = [];
const EMPTY_EDGES: GraphView["edges"] = [];

type ActiveGesture =
  | {
      kind: "node";
      nodeId: string;
      pointerId: number;
      startClientX: number;
      startClientY: number;
      maximumTravel: number;
    }
  | {
      kind: "pan";
      pointerId: number;
      lastClientX: number;
      lastClientY: number;
    };

function serializeViewBox(viewport: GraphViewport) {
  const box = viewBoxFor(viewport);
  return [box.x, box.y, box.width, box.height]
    .map((value) => String(Number(value.toFixed(4))))
    .join(" ");
}

function isPrimaryPointer(event: ReactPointerEvent) {
  return event.button === 0 && event.isPrimary;
}

function capturePointer(element: Element, pointerId: number) {
  if (typeof element.setPointerCapture === "function") {
    element.setPointerCapture(pointerId);
  }
}

function releasePointer(element: Element, pointerId: number) {
  if (
    typeof element.hasPointerCapture === "function" &&
    element.hasPointerCapture(pointerId) &&
    typeof element.releasePointerCapture === "function"
  ) {
    element.releasePointerCapture(pointerId);
  }
}

function prefersReducedMotion() {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function KnowledgeGraph({
  graph,
  onOpenNote,
}: {
  graph: GraphView | null;
  onOpenNote?: (path: string) => void;
}) {
  const concepts = graph?.concepts ?? EMPTY_CONCEPTS;
  const graphEdges = graph?.edges ?? EMPTY_EDGES;
  const signature = concepts
    .map((concept) => concept.id)
    .concat(
      graphEdges.map(
        (edge) => `${edge.id}:${edge.sourceConceptId}:${edge.targetConceptId}`,
      ),
    )
    .join("|");
  const model = useMemo(() => {
    const degree = new Map<string, number>();
    for (const edge of graphEdges) {
      degree.set(
        edge.sourceConceptId,
        (degree.get(edge.sourceConceptId) ?? 0) + 1,
      );
      degree.set(
        edge.targetConceptId,
        (degree.get(edge.targetConceptId) ?? 0) + 1,
      );
    }
    const simulation = createGraphSimulation({
      nodes: concepts.map((concept) => ({
        id: concept.id,
        degree: degree.get(concept.id) ?? 0,
      })),
      edges: graphEdges.map((edge) => ({
        source: edge.sourceConceptId,
        target: edge.targetConceptId,
      })),
    });
    return {
      degree,
      edges: graphEdges,
      maxDegree: Math.max(1, ...degree.values()),
      simulation,
    };
    // Graph data is re-created by its caller; this stable identity captures its contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const stage = useRef<SVGSVGElement | null>(null);
  const zoomOutput = useRef<HTMLOutputElement | null>(null);
  const nodeElements = useRef(new Map<string, SVGGElement>());
  const edgeElements = useRef(new Map<string, SVGLineElement>());
  const simulation = useRef<GraphSimulation>(model.simulation);
  const viewport = useRef<GraphViewport>({ ...DEFAULT_GRAPH_VIEWPORT });
  const animationFrame = useRef<number | null>(null);
  const viewportFrame = useRef<number | null>(null);
  const gesture = useRef<ActiveGesture | null>(null);
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [panning, setPanning] = useState(false);

  const paintSimulation = useCallback(() => {
    const current = simulation.current;
    for (const node of current.nodes.values()) {
      const element = nodeElements.current.get(node.id);
      if (!element) continue;
      element.setAttribute(
        "transform",
        `translate(${String(node.x)} ${String(node.y)})`,
      );
      element.dataset.graphX = String(node.x);
      element.dataset.graphY = String(node.y);
    }
    for (const edge of model.edges) {
      const element = edgeElements.current.get(edge.id);
      const source = current.nodes.get(edge.sourceConceptId);
      const target = current.nodes.get(edge.targetConceptId);
      if (!element || !source || !target) continue;
      element.setAttribute("x1", String(source.x));
      element.setAttribute("x2", String(target.x));
      element.setAttribute("y1", String(source.y));
      element.setAttribute("y2", String(target.y));
    }
  }, [model]);

  const paintViewport = useCallback(() => {
    stage.current?.setAttribute("viewBox", serializeViewBox(viewport.current));
    if (stage.current) {
      stage.current.dataset.graphScale = viewport.current.scale.toFixed(2);
    }
    if (zoomOutput.current) {
      zoomOutput.current.value = `${String(Math.round(viewport.current.scale * 100))}%`;
      zoomOutput.current.textContent = zoomOutput.current.value;
    }
  }, []);

  const runSimulationFrame = useCallback(
    function runFrame() {
      animationFrame.current = null;
      if (prefersReducedMotion()) {
        settleGraphSimulation(simulation.current);
        paintSimulation();
        return;
      }
      let active = false;
      for (let step = 0; step < 2; step += 1) {
        active = tickGraphSimulation(simulation.current);
        if (!active) break;
      }
      paintSimulation();
      if (active) {
        animationFrame.current = window.requestAnimationFrame(runFrame);
      }
    },
    [paintSimulation],
  );

  const scheduleSimulation = useCallback(() => {
    if (prefersReducedMotion()) {
      if (animationFrame.current !== null) {
        window.cancelAnimationFrame(animationFrame.current);
        animationFrame.current = null;
      }
      settleGraphSimulation(simulation.current);
      paintSimulation();
      return;
    }
    if (animationFrame.current !== null) return;
    if (typeof window.requestAnimationFrame !== "function") {
      settleGraphSimulation(simulation.current);
      paintSimulation();
      return;
    }
    animationFrame.current = window.requestAnimationFrame(runSimulationFrame);
  }, [paintSimulation, runSimulationFrame]);

  const scheduleViewportPaint = useCallback(() => {
    if (viewportFrame.current !== null) return;
    if (typeof window.requestAnimationFrame !== "function") {
      paintViewport();
      return;
    }
    viewportFrame.current = window.requestAnimationFrame(() => {
      viewportFrame.current = null;
      paintViewport();
    });
  }, [paintViewport]);

  useLayoutEffect(() => {
    simulation.current = model.simulation;
    viewport.current = { ...DEFAULT_GRAPH_VIEWPORT };
    gesture.current = null;
    if (
      prefersReducedMotion() ||
      typeof window.requestAnimationFrame !== "function"
    ) {
      settleGraphSimulation(simulation.current);
      paintSimulation();
    } else {
      paintSimulation();
      scheduleSimulation();
    }
    paintViewport();

    return () => {
      if (animationFrame.current !== null) {
        window.cancelAnimationFrame(animationFrame.current);
        animationFrame.current = null;
      }
      if (viewportFrame.current !== null) {
        window.cancelAnimationFrame(viewportFrame.current);
        viewportFrame.current = null;
      }
    };
  }, [model, paintSimulation, paintViewport, scheduleSimulation]);

  function graphPoint(clientX: number, clientY: number) {
    const svg = stage.current;
    if (!svg) return null;
    const bounds = svg.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    const box = viewBoxFor(viewport.current);
    const displayScale = Math.min(
      bounds.width / box.width,
      bounds.height / box.height,
    );
    const offsetX = (bounds.width - box.width * displayScale) / 2;
    const offsetY = (bounds.height - box.height * displayScale) / 2;
    return {
      x: box.x + (clientX - bounds.left - offsetX) / displayScale,
      y: box.y + (clientY - bounds.top - offsetY) / displayScale,
    };
  }

  function clearNativeSelection() {
    document.getSelection()?.removeAllRanges();
  }

  function beginNodeDrag(id: string, event: ReactPointerEvent<SVGGElement>) {
    if (!isPrimaryPointer(event)) return;
    event.preventDefault();
    event.stopPropagation();
    clearNativeSelection();
    const point = graphPoint(event.clientX, event.clientY);
    if (!point || !dragGraphNode(simulation.current, id, point.x, point.y)) {
      return;
    }
    gesture.current = {
      kind: "node",
      nodeId: id,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      maximumTravel: 0,
    };
    capturePointer(event.currentTarget, event.pointerId);
    setDraggingNode(id);
    scheduleSimulation();
  }

  function moveNode(id: string, event: ReactPointerEvent<SVGGElement>) {
    const active = gesture.current;
    if (
      active?.kind !== "node" ||
      active.nodeId !== id ||
      active.pointerId !== event.pointerId
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    active.maximumTravel = Math.max(
      active.maximumTravel,
      Math.hypot(
        event.clientX - active.startClientX,
        event.clientY - active.startClientY,
      ),
    );
    const point = graphPoint(event.clientX, event.clientY);
    if (!point) return;
    dragGraphNode(simulation.current, id, point.x, point.y);
    scheduleSimulation();
  }

  function endNodeDrag(
    id: string,
    notePath: string | null,
    event: ReactPointerEvent<SVGGElement>,
    shouldReleaseCapture: boolean,
    mayActivate: boolean,
  ) {
    const active = gesture.current;
    if (
      active?.kind !== "node" ||
      active.nodeId !== id ||
      active.pointerId !== event.pointerId
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const travel = Math.max(
      active.maximumTravel,
      Math.hypot(
        event.clientX - active.startClientX,
        event.clientY - active.startClientY,
      ),
    );
    gesture.current = null;
    releaseGraphNode(simulation.current, id);
    if (shouldReleaseCapture) {
      releasePointer(event.currentTarget, event.pointerId);
    }
    setDraggingNode(null);
    scheduleSimulation();
    if (mayActivate && travel < 5 && notePath) {
      onOpenNote?.(notePath);
    }
  }

  function beginPan(event: ReactPointerEvent<SVGSVGElement>) {
    if (!isPrimaryPointer(event)) return;
    event.preventDefault();
    clearNativeSelection();
    gesture.current = {
      kind: "pan",
      pointerId: event.pointerId,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
    };
    capturePointer(event.currentTarget, event.pointerId);
    setPanning(true);
  }

  function movePan(event: ReactPointerEvent<SVGSVGElement>) {
    const active = gesture.current;
    if (active?.kind !== "pan" || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    viewport.current = panViewportByPixels(
      viewport.current,
      {
        x: event.clientX - active.lastClientX,
        y: event.clientY - active.lastClientY,
      },
      bounds,
    );
    active.lastClientX = event.clientX;
    active.lastClientY = event.clientY;
    scheduleViewportPaint();
  }

  function endPan(
    event: ReactPointerEvent<SVGSVGElement>,
    shouldReleaseCapture: boolean,
  ) {
    const active = gesture.current;
    if (active?.kind !== "pan" || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    gesture.current = null;
    if (shouldReleaseCapture) {
      releasePointer(event.currentTarget, event.pointerId);
    }
    setPanning(false);
  }

  function zoomGraph(factor: number, anchor = { x: 0.5, y: 0.5 }) {
    viewport.current = zoomViewportAt(viewport.current, factor, anchor);
    scheduleViewportPaint();
  }

  function wheelZoom(event: ReactWheelEvent<SVGSVGElement>) {
    event.preventDefault();
    const point = graphPoint(event.clientX, event.clientY);
    const box = viewBoxFor(viewport.current);
    const anchor = point
      ? {
          x: (point.x - box.x) / box.width,
          y: (point.y - box.y) / box.height,
        }
      : { x: 0.5, y: 0.5 };
    zoomGraph(Math.exp(-event.deltaY * 0.0015), anchor);
  }

  function resetView() {
    viewport.current = { ...DEFAULT_GRAPH_VIEWPORT };
    scheduleViewportPaint();
  }

  return (
    <div className="graph-view">
      <div className="graph-heading">
        <div>
          <span className="eyebrow">LOCAL GRAPH</span>
          <h2>Your knowledge, connected</h2>
          <p>
            {concepts.length} concepts · {graphEdges.length} relationships ·
            local index
          </p>
        </div>
        <div className="graph-actions">
          <button
            aria-label="Search graph"
            className="icon-button"
            type="button"
          >
            <Search aria-hidden="true" size={15} />
          </button>
          <button
            aria-label="Filter graph"
            className="icon-button"
            type="button"
          >
            <SlidersHorizontal aria-hidden="true" size={15} />
          </button>
          <button
            aria-label="More graph actions"
            className="icon-button"
            type="button"
          >
            <MoreHorizontal aria-hidden="true" size={16} />
          </button>
        </div>
      </div>
      <div className={`graph-stage${panning ? " graph-stage-panning" : ""}`}>
        <svg
          aria-label="Knowledge graph"
          data-graph-scale="1.00"
          onPointerCancel={(event) => {
            endPan(event, false);
          }}
          onLostPointerCapture={(event) => {
            endPan(event, false);
          }}
          onPointerDown={beginPan}
          onPointerMove={movePan}
          onPointerUp={(event) => {
            endPan(event, true);
          }}
          onWheel={wheelZoom}
          ref={stage}
          role="group"
          viewBox={serializeViewBox(DEFAULT_GRAPH_VIEWPORT)}
        >
          <g className="graph-edge-layer">
            {graphEdges.map((edge) => {
              const source = model.simulation.nodes.get(edge.sourceConceptId);
              const target = model.simulation.nodes.get(edge.targetConceptId);
              if (!source || !target) return null;
              return (
                <line
                  key={edge.id}
                  ref={(element) => {
                    if (element) edgeElements.current.set(edge.id, element);
                    else edgeElements.current.delete(edge.id);
                  }}
                  x1={source.x}
                  x2={target.x}
                  y1={source.y}
                  y2={target.y}
                />
              );
            })}
          </g>
          <g className="graph-node-layer">
            {concepts.map((concept) => {
              const node = model.simulation.nodes.get(concept.id);
              if (!node) return null;
              const navigable = Boolean(concept.notePath && onOpenNote);
              const connections = model.degree.get(concept.id) ?? 0;
              const tone =
                connections >= Math.max(2, model.maxDegree * 0.6)
                  ? "hub"
                  : connections > 0
                    ? "linked"
                    : "isolated";
              return (
                <g
                  aria-label={navigable ? concept.displayName : undefined}
                  className={`graph-node graph-node-${tone}${
                    draggingNode === concept.id ? " graph-node-dragging" : ""
                  }`}
                  data-graph-node={concept.id}
                  data-graph-x={node.x}
                  data-graph-y={node.y}
                  key={concept.id}
                  onLostPointerCapture={(event) => {
                    endNodeDrag(
                      concept.id,
                      concept.notePath,
                      event,
                      false,
                      false,
                    );
                  }}
                  onPointerCancel={(event) => {
                    endNodeDrag(
                      concept.id,
                      concept.notePath,
                      event,
                      false,
                      false,
                    );
                  }}
                  onKeyDown={(event) => {
                    if (
                      !concept.notePath ||
                      !onOpenNote ||
                      event.repeat ||
                      (event.key !== "Enter" && event.key !== " ")
                    ) {
                      return;
                    }
                    event.preventDefault();
                    event.stopPropagation();
                    onOpenNote(concept.notePath);
                  }}
                  onPointerDown={(event) => {
                    beginNodeDrag(concept.id, event);
                  }}
                  onPointerMove={(event) => {
                    moveNode(concept.id, event);
                  }}
                  onPointerUp={(event) => {
                    endNodeDrag(
                      concept.id,
                      concept.notePath,
                      event,
                      true,
                      true,
                    );
                  }}
                  ref={(element) => {
                    if (element) nodeElements.current.set(concept.id, element);
                    else nodeElements.current.delete(concept.id);
                  }}
                  role={navigable ? "link" : undefined}
                  tabIndex={navigable ? 0 : undefined}
                  transform={`translate(${String(node.x)} ${String(node.y)})`}
                >
                  <circle cx={0} cy={0} r={node.radius} />
                  <text
                    aria-hidden="true"
                    textAnchor="middle"
                    x={0}
                    y={node.radius + 17}
                  >
                    {concept.displayName}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
        {concepts.length === 0 ? (
          <div className="graph-empty">
            Capture a source to grow your local graph.
          </div>
        ) : null}
        <div aria-label="Graph view controls" className="graph-view-controls">
          <button
            aria-label="Zoom out"
            className="icon-button"
            onClick={() => {
              zoomGraph(1 / 1.25);
            }}
            type="button"
          >
            <ZoomOut aria-hidden="true" size={14} />
          </button>
          <output aria-label="Graph zoom" ref={zoomOutput}>
            100%
          </output>
          <button
            aria-label="Zoom in"
            className="icon-button"
            onClick={() => {
              zoomGraph(1.25);
            }}
            type="button"
          >
            <ZoomIn aria-hidden="true" size={14} />
          </button>
          <span aria-hidden="true" className="graph-control-divider" />
          <button
            aria-label="Reset graph view"
            className="icon-button"
            onClick={resetView}
            type="button"
          >
            <RotateCcw aria-hidden="true" size={13} />
          </button>
        </div>
        <span aria-hidden="true" className="graph-navigation-hint">
          Scroll to zoom · Drag background to pan
        </span>
        <div className="graph-legend">
          <span>
            <i className="legend-dot legend-dot-hub" />
            Hub
          </span>
          <span>
            <i className="legend-dot legend-dot-linked" />
            Connected
          </span>
          <span>
            <i className="legend-dot" />
            Standalone
          </span>
        </div>
      </div>
    </div>
  );
}
