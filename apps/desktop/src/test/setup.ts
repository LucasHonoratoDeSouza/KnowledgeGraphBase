import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});

Object.defineProperties(Range.prototype, {
  getBoundingClientRect: {
    value: () => ({
      bottom: 0,
      height: 0,
      left: 0,
      right: 0,
      toJSON: () => ({}),
      top: 0,
      width: 0,
      x: 0,
      y: 0,
    }),
  },
  getClientRects: {
    value: () => ({
      item: () => null,
      length: 0,
      [Symbol.iterator]: function* iterator() {},
    }),
  },
});

// jsdom exposes PointerEvent but not the capture methods used by desktop drag
// surfaces. Browser/E2E tests exercise real capture; unit tests only need the
// contract to exist so pointer sequences can finish without unhandled errors.
if (typeof Element.prototype.setPointerCapture !== "function") {
  Object.defineProperties(Element.prototype, {
    hasPointerCapture: {
      configurable: true,
      value: () => true,
    },
    releasePointerCapture: {
      configurable: true,
      value: () => undefined,
    },
    setPointerCapture: {
      configurable: true,
      value: () => undefined,
    },
  });
}
