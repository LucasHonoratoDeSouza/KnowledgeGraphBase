import { DEFAULT_LAYOUT_OPTIONS } from "./forceLayout";

export interface GraphViewport {
  x: number;
  y: number;
  scale: number;
}

export interface NormalizedPoint {
  x: number;
  y: number;
}

export const MIN_GRAPH_SCALE = 0.35;
export const MAX_GRAPH_SCALE = 4;

export const DEFAULT_GRAPH_VIEWPORT: GraphViewport = {
  x: 0,
  y: 0,
  scale: 1,
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function viewBoxFor(viewport: GraphViewport) {
  return {
    x: viewport.x,
    y: viewport.y,
    width: DEFAULT_LAYOUT_OPTIONS.width / viewport.scale,
    height: DEFAULT_LAYOUT_OPTIONS.height / viewport.scale,
  };
}

export function zoomViewportAt(
  viewport: GraphViewport,
  factor: number,
  anchor: NormalizedPoint,
): GraphViewport {
  const scale = clamp(
    viewport.scale * factor,
    MIN_GRAPH_SCALE,
    MAX_GRAPH_SCALE,
  );
  if (scale === viewport.scale) return viewport;

  const before = viewBoxFor(viewport);
  const afterWidth = DEFAULT_LAYOUT_OPTIONS.width / scale;
  const afterHeight = DEFAULT_LAYOUT_OPTIONS.height / scale;
  const anchorX = clamp(anchor.x, 0, 1);
  const anchorY = clamp(anchor.y, 0, 1);

  return {
    x: before.x + anchorX * (before.width - afterWidth),
    y: before.y + anchorY * (before.height - afterHeight),
    scale,
  };
}

export function panViewportByPixels(
  viewport: GraphViewport,
  delta: { x: number; y: number },
  surface: { width: number; height: number },
): GraphViewport {
  if (surface.width <= 0 || surface.height <= 0) return viewport;
  const box = viewBoxFor(viewport);
  const displayScale = Math.min(
    surface.width / box.width,
    surface.height / box.height,
  );
  return {
    x: viewport.x - delta.x / displayScale,
    y: viewport.y - delta.y / displayScale,
    scale: viewport.scale,
  };
}
