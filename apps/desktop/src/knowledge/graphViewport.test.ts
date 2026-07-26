import { describe, expect, it } from "vitest";

import {
  DEFAULT_GRAPH_VIEWPORT,
  GRAPH_VIEW_BOX,
  panViewportByPixels,
  viewBoxFor,
  zoomViewportAt,
} from "./graphViewport";

describe("graph viewport", () => {
  it("keeps the graph point under the cursor fixed while zooming", () => {
    const anchor = { x: 0.25, y: 0.75 };
    const beforePoint = {
      x: DEFAULT_GRAPH_VIEWPORT.x + anchor.x * GRAPH_VIEW_BOX.width,
      y: DEFAULT_GRAPH_VIEWPORT.y + anchor.y * GRAPH_VIEW_BOX.height,
    };

    const zoomed = zoomViewportAt(DEFAULT_GRAPH_VIEWPORT, 2, anchor);
    const afterPoint = {
      x: zoomed.x + anchor.x * (GRAPH_VIEW_BOX.width / zoomed.scale),
      y: zoomed.y + anchor.y * (GRAPH_VIEW_BOX.height / zoomed.scale),
    };

    expect(zoomed.scale).toBe(2);
    expect(afterPoint).toEqual(beforePoint);
    expect(viewBoxFor(zoomed)).toEqual({
      x: DEFAULT_GRAPH_VIEWPORT.x + anchor.x * (GRAPH_VIEW_BOX.width / 2),
      y: DEFAULT_GRAPH_VIEWPORT.y + anchor.y * (GRAPH_VIEW_BOX.height / 2),
      width: GRAPH_VIEW_BOX.width / 2,
      height: GRAPH_VIEW_BOX.height / 2,
    });
  });

  it("clamps zoom inclusively at both specified limits", () => {
    expect(
      zoomViewportAt(DEFAULT_GRAPH_VIEWPORT, 100, { x: 0.5, y: 0.5 }).scale,
    ).toBe(4);
    expect(
      zoomViewportAt(DEFAULT_GRAPH_VIEWPORT, 0.001, { x: 0.5, y: 0.5 }).scale,
    ).toBe(0.35);
  });

  it("converts a background pointer delta into graph-space pan", () => {
    // At scale 2 the view box is half the default, so a surface of that size
    // maps one screen pixel to one graph unit.
    const panned = panViewportByPixels(
      { x: 100, y: 50, scale: 2 },
      { x: 40, y: -20 },
      {
        width: GRAPH_VIEW_BOX.width / 2,
        height: GRAPH_VIEW_BOX.height / 2,
      },
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
    // The stage is half as tall as the view box, so height sets the meet
    // scale and one screen pixel is two graph units.
    const surface = {
      width: GRAPH_VIEW_BOX.width,
      height: GRAPH_VIEW_BOX.height / 2,
    };

    expect(
      panViewportByPixels(DEFAULT_GRAPH_VIEWPORT, { x: 40, y: 20 }, surface),
    ).toEqual({
      x: DEFAULT_GRAPH_VIEWPORT.x - 80,
      y: DEFAULT_GRAPH_VIEWPORT.y - 40,
      scale: 1,
    });
  });
});
