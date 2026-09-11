export type Point = { x: number; y: number };
export type Size = { width: number; height: number };

export const SVG_VIEWBOX: Size = { width: 800, height: 600 };
export const SVG_NODE_RECT_SIZE: Size = { width: 140, height: 44 };

export type ClippedLine = { start: Point; end: Point };

/**
 * Convert a measured HTML size into the coordinate system used by the SVG
 * viewBox. The canvas and SVG both use the same non-preserving aspect ratio.
 */
export function scaleSizeToViewBox(size: Size, canvas: Size, viewBox: Size = SVG_VIEWBOX): Size {
  if (canvas.width <= 0 || canvas.height <= 0) return { width: 0, height: 0 };
  return {
    width: size.width * viewBox.width / canvas.width,
    height: size.height * viewBox.height / canvas.height,
  };
}

function rayBoundaryDistance(size: Size, direction: Point): number {
  const distances: number[] = [];
  if (Math.abs(direction.x) > Number.EPSILON) {
    distances.push(Math.max(0, size.width) / 2 / Math.abs(direction.x));
  }
  if (Math.abs(direction.y) > Number.EPSILON) {
    distances.push(Math.max(0, size.height) / 2 / Math.abs(direction.y));
  }
  return Math.min(...distances);
}

/**
 * Clip a line joining two rectangle centers to the boundary of each
 * rectangle. The rectangles are axis-aligned and centered on their points.
 */
export function clipLineToRectangles(
  source: Point,
  target: Point,
  sourceSize: Size,
  targetSize: Size,
): ClippedLine {
  const direction = { x: target.x - source.x, y: target.y - source.y };
  if (Math.abs(direction.x) <= Number.EPSILON && Math.abs(direction.y) <= Number.EPSILON) {
    return { start: source, end: target };
  }

  const sourceDistance = rayBoundaryDistance(sourceSize, direction);
  const targetDistance = rayBoundaryDistance(targetSize, direction);
  return {
    start: {
      x: source.x + direction.x * sourceDistance,
      y: source.y + direction.y * sourceDistance,
    },
    end: {
      x: target.x - direction.x * targetDistance,
      y: target.y - direction.y * targetDistance,
    },
  };
}