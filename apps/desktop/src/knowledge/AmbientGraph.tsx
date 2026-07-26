import { useEffect, useMemo, useRef } from "react";

import { ambientDrift, sampleAmbientGraph } from "./ambientGraph";
import type { GraphView } from "./types";

/** A low frame rate is invisible at this speed and keeps the cost negligible. */
const FRAME_INTERVAL_MS = 90;

function prefersReducedMotion() {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * The knowledge graph as background texture (#35): offset toward the upper
 * right, bleeding past the viewport edge, drifting slowly enough that nothing
 * ever appears to arrive. It is decoration, not content — no pointer events,
 * no focus, nothing in the accessibility tree — and it renders nothing at all
 * for an empty or still-building index.
 */
export function AmbientGraph({ graph }: { graph: GraphView | null }) {
  const layout = useMemo(() => sampleAmbientGraph(graph), [graph]);
  const nodeElements = useRef(new Map<string, SVGCircleElement>());
  const edgeElements = useRef(new Map<string, SVGLineElement>());

  useEffect(() => {
    if (layout.nodes.length === 0) return undefined;
    function paint(elapsedMs: number) {
      const drifted = new Map<string, { x: number; y: number }>();
      for (const node of layout.nodes) {
        const offset = ambientDrift(node, elapsedMs);
        const point = { x: node.x + offset.x, y: node.y + offset.y };
        drifted.set(node.id, point);
        const element = nodeElements.current.get(node.id);
        if (!element) continue;
        element.setAttribute("cx", point.x.toFixed(2));
        element.setAttribute("cy", point.y.toFixed(2));
      }
      for (const edge of layout.edges) {
        const element = edgeElements.current.get(edge.id);
        const source = drifted.get(edge.source);
        const target = drifted.get(edge.target);
        if (!element || !source || !target) continue;
        element.setAttribute("x1", source.x.toFixed(2));
        element.setAttribute("y1", source.y.toFixed(2));
        element.setAttribute("x2", target.x.toFixed(2));
        element.setAttribute("y2", target.y.toFixed(2));
      }
    }

    paint(0);
    if (
      prefersReducedMotion() ||
      typeof window.requestAnimationFrame !== "function"
    ) {
      return undefined;
    }

    // The loop only runs while this surface is on screen and the window has
    // focus, so typing in the composer never competes with it.
    let frame: number | null = null;
    let lastPaint = 0;
    const started = performance.now();
    function step(now: number) {
      frame = window.requestAnimationFrame(step);
      if (now - lastPaint < FRAME_INTERVAL_MS) return;
      lastPaint = now;
      paint(now - started);
    }
    function start() {
      if (frame === null && document.hasFocus()) {
        frame = window.requestAnimationFrame(step);
      }
    }
    function stop() {
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
        frame = null;
      }
    }

    function onVisibilityChange() {
      if (document.hidden) stop();
      else start();
    }

    start();
    window.addEventListener("focus", start);
    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stop();
      window.removeEventListener("focus", start);
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [layout]);

  if (layout.nodes.length === 0) return null;
  return (
    <svg
      aria-hidden="true"
      className="ambient-graph"
      focusable="false"
      viewBox={`0 0 ${String(layout.width)} ${String(layout.height)}`}
    >
      <g className="ambient-graph-edges">
        {layout.edges.map((edge) => (
          <line
            key={edge.id}
            ref={(element) => {
              if (element) edgeElements.current.set(edge.id, element);
              else edgeElements.current.delete(edge.id);
            }}
          />
        ))}
      </g>
      <g className="ambient-graph-nodes">
        {layout.nodes.map((node) => (
          <circle
            key={node.id}
            r={node.radius}
            ref={(element) => {
              if (element) nodeElements.current.set(node.id, element);
              else nodeElements.current.delete(node.id);
            }}
          />
        ))}
      </g>
    </svg>
  );
}
