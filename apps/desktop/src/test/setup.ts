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
