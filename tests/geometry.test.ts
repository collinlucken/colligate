import assert from "node:assert/strict";
import test from "node:test";
import { clipLineToRectangles, scaleSizeToViewBox } from "../src/geometry.ts";

test("scales measured HTML dimensions into SVG coordinates", () => {
  assert.deepEqual(
    scaleSizeToViewBox({ width: 140, height: 44 }, { width: 700, height: 300 }),
    { width: 160, height: 88 },
  );
});

test("clips horizontal lines to both rectangle boundaries", () => {
  assert.deepEqual(
    clipLineToRectangles(
      { x: 100, y: 100 },
      { x: 300, y: 100 },
      { width: 80, height: 40 },
      { width: 120, height: 60 },
    ),
    {
      start: { x: 140, y: 100 },
      end: { x: 240, y: 100 },
    },
  );
});

test("clips diagonal lines against the first boundary they meet", () => {
  assert.deepEqual(
    clipLineToRectangles(
      { x: 0, y: 0 },
      { x: 100, y: 50 },
      { width: 20, height: 20 },
      { width: 40, height: 20 },
    ),
    {
      start: { x: 10, y: 5 },
      end: { x: 80, y: 40 },
    },
  );
});