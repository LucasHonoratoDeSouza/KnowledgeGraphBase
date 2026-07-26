# Fluid Knowledge Graph Specification

## Problem

The knowledge graph is rendered from a fully settled, synchronous layout. Dragging
rewrites only the selected node through React state, so connected nodes remain
frozen and larger graphs block the renderer. Native SVG text selection also leaks
through pointer drags, which produces Ubuntu's orange selection highlight.

## Goals

- Make direct manipulation feel light but weighted: a dragged node approaches the
  pointer with damping while connected and nearby nodes smoothly clear its path.
- Support cursor-anchored wheel zoom, explicit zoom controls, background pan and
  one-action viewport reset.
- Keep the interaction frame-driven and responsive up to the backend's 500-node
  graph ceiling without adding a runtime dependency.
- Prevent native selection/touch gestures from competing with graph interaction.

## Assumptions

| Decision | Chosen default | Rationale |
| --- | --- | --- |
| Zoom bounds | `0.35x` through `4x` | Useful overview/detail range without losing the graph irretrievably |
| Pointer support | Mouse, trackpad wheel and single-pointer pan/drag | Covers the Ubuntu desktop use case; pinch is a separate gesture feature |
| Position lifetime | Current mounted graph only | Persistence was not requested and would add a storage/state contract |
| Rendering | Existing SVG with imperative frame paints | Avoids React rerenders per tick and honors AD-012 (no new runtime dependencies) |
| Dense graph geometry | Scale visible node radii and collision clearance as node count grows | Keeps the 800×520 simulation physically feasible at the 500-node ceiling while retaining larger hubs |
| Reduced motion | Settle before paint, without an animated loop | Preserves the final readable layout while avoiding visible motion |

All remaining implicit-requirement dimensions are N/A: this is local renderer
interaction with no external calls, auth, durable data, retries or shared-state
concurrency.

## Acceptance Criteria

### FG-01 — Native interaction safety (P1)

1. WHEN a primary pointer starts dragging a node or the graph background THEN the
   graph SHALL prevent the browser's native selection/drag gesture.
2. WHEN the pointer is cancelled or capture is lost THEN the graph SHALL clear the
   active drag so no node or pan gesture remains stuck.
3. WHEN a graph label is dragged across on Ubuntu/Chromium THEN the document
   selection SHALL remain empty.

### FG-02 — Live connected motion (P1)

1. WHEN a node receives a new drag target THEN its first simulation tick SHALL
   advance toward that target without teleporting there, and a stationary target
   SHALL be reached within 12 ticks to create a damped sense of weight.
2. WHEN that node has an edge THEN at least its connected neighbor SHALL respond to
   the spring force during subsequent animation frames.
3. WHEN a dragged node approaches another node inside the local repulsion radius
   THEN the nearby node SHALL move away before their visible circles overlap, so
   nodes smoothly clear the dragged node's path.
4. WHEN the node is released THEN it SHALL be unpinned and the simulation SHALL
   reach rest within 360 ticks on the 500-node/500-edge verification workload,
   preserve stage bounds and leave every circle pair separated by at least the
   sum of its radii (within `0.01` graph units); the next tick SHALL remain idle.
5. WHEN graph input includes a missing endpoint or drag targets an unknown node
   THEN the simulation SHALL ignore it without producing non-finite coordinates.

### FG-03 — Pan and zoom (P1)

1. WHEN the wheel is scrolled over the graph THEN zoom SHALL change around the
   cursor and clamp to the inclusive range `0.35x`–`4x`.
2. WHEN Zoom in or Zoom out is activated THEN zoom SHALL change by one `1.25x`
   or reciprocal `0.8x` step around the viewport center.
3. WHEN the background is dragged THEN the viewport SHALL pan by the corresponding
   graph-space distance without moving a node.
4. WHEN Reset view is activated THEN the viewport SHALL return exactly to
   `{ x: 0, y: 0, scale: 1 }`.

### FG-04 — Frame-budgeted rendering (P1)

1. WHEN a graph opens THEN nodes SHALL be seeded in bounded deterministic positions
   without running the existing all-pairs settled layout in React's render path.
2. WHEN physics is active THEN DOM positions SHALL be painted at most once per
   animation frame and React state SHALL NOT be rewritten for each physics tick.
3. WHEN the simulation reaches its rest threshold THEN it SHALL stop requesting
   animation frames until an interaction reheats it; rest means alpha is at most
   `0.002`, every movable node is below `0.025` graph units per tick and no visible
   circle pair overlaps.

### FG-05 — Existing states and accessibility (P2)

1. WHEN reduced motion is requested THEN initial layout and every later drag or
   release SHALL settle synchronously without requesting an animation frame.
2. WHEN the graph is empty THEN the existing empty-state message SHALL remain.
3. WHEN pointer zoom is unavailable THEN named Zoom in, Zoom out and Reset view
   buttons SHALL expose the same camera controls.

## Out of Scope

- Persisting manual positions or camera state across graph refreshes/restarts.
- Pinch-to-zoom, node multi-selection, search/filter implementation or opening a
  note from a node.
- Canvas/WebGL migration and adaptive label visibility.

## Verification

- Pure unit tests for force response, decay, collision/bounds, invalid edges and
  camera anchoring/clamps, including literal `0.35x`/`4x` limits and the
  500-node/500-edge rest workload.
- Component tests for named controls, exact zoom steps, viewport-only pan, lost
  pointer capture, frame batching/cessation and reduced-motion interaction.
- Chromium E2E for connected-node response, pan/zoom and empty native selection
  when dragging both a node and a label.
- Desktop lint, typecheck, full unit suite, production build and targeted E2E pass.
