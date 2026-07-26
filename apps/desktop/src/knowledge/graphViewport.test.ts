import { describe, expect, it } from "vitest";

import {
  DEFAULT_GRAPH_VIEWPORT,
  MAX_GRAPH_SCALE,
  MIN_GRAPH_SCALE,
  panViewportByPixels,
  viewBoxFor,
  zoomViewportAt,
} from "./graphViewport";

describe("graph viewport", () => {
  it("keeps the graph point under the cursor fixed while zooming", () => {
    const anchor = { x: 0.25, y: 0.75 };
    const beforePoint = {
      x: DEFAULT_GRAPH_VIEWPORT.x + anchor.x * 800,
      y: DEFAULT_GRAPH_VIEWPORT.y + anchor.y * 520,
    };

    const zoomed = zoomViewportAt(DEFAULT_GRAPH_VIEWPORT, 2, anchor);
    const afterPoint = {
      x: zoomed.x + anchor.x * (800 / zoomed.scale),
      y: zoomed.y + anchor.y * (520 / zoomed.scale),
    };

    expect(zoomed.scale).toBe(2);
    expect(afterPoint).toEqual(beforePoint);
    expect(viewBoxFor(zoomed)).toEqual({
      x: 100,
      y: 195,
      width: 400,
      height: 260,
    });
  });

  it("clamps zoom inclusively at both specified limits", () => {
    expect(
      zoomViewportAt(DEFAULT_GRAPH_VIEWPORT, 100, { x: 0.5, y: 0.5 }).scale,
    ).toBe(MAX_GRAPH_SCALE);
    expect(
      zoomViewportAt(DEFAULT_GRAPH_VIEWPORT, 0.001, { x: 0.5, y: 0.5 }).scale,
    ).toBe(MIN_GRAPH_SCALE);
  });

  it("converts a background pointer delta into graph-space pan", () => {
    const panned = panViewportByPixels(
      { x: 100, y: 50, scale: 2 },
      { x: 40, y: -20 },
      { width: 400, height: 260 },
    );

    expect(panned).toEqual({ x: 60, y: 70, scale: 2 });
    expect(
      panViewportByPixels(
        DEFAULT_GRAPH_VIEWPORT,
        { x: 10, y: 10 },
        {
          width: 0,
          height: 0,
        },
      ),
    ).toBe(DEFAULT_GRAPH_VIEWPORT);
  });

  it("uses the SVG meet scale when the stage is letterboxed", () => {
    expect(
      panViewportByPixels(
        DEFAULT_GRAPH_VIEWPORT,
        { x: 40, y: 20 },
        { width: 800, height: 260 },
      ),
    ).toEqual({ x: -80, y: -40, scale: 1 });
  });
});
