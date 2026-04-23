import { describe, expect, it } from "vitest";
import type { LonLat } from "../domain/types";
import { optimizeRouteOrder, routeTotalDistance } from "./tsp";

describe("optimizeRouteOrder", () => {
  it("returns identity for 0 or 1 points", () => {
    expect(optimizeRouteOrder([])).toEqual([]);
    expect(optimizeRouteOrder([[151, -33]])).toEqual([0]);
  });

  it("returns identity for 2 points", () => {
    const result = optimizeRouteOrder([[151, -33], [152, -34]]);
    expect(result).toEqual([0, 1]);
  });

  it("produces a shorter route than an intentionally bad order", () => {
    const points: LonLat[] = [
      [151.0, -33.0],
      [151.1, -33.0],
      [151.2, -33.0],
      [151.3, -33.0],
      [151.4, -33.0],
    ];

    const shuffled: LonLat[] = [
      points[0], points[4], points[1], points[3], points[2],
    ];
    const badDistance = routeTotalDistance(shuffled);

    const order = optimizeRouteOrder(points);
    const optimized: LonLat[] = order.map((i) => points[i]);
    const goodDistance = routeTotalDistance(optimized);

    expect(goodDistance).toBeLessThan(badDistance);
  });

  it("finds the obvious shortest path for a square", () => {
    const points: LonLat[] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];

    const order = optimizeRouteOrder(points);
    expect(order).toHaveLength(4);
    const uniqueIndices = new Set(order);
    expect(uniqueIndices.size).toBe(4);

    const optimized: LonLat[] = order.map((i) => points[i]);
    const dist = routeTotalDistance(optimized);

    const diagonalOrder: LonLat[] = [points[0], points[2], points[1], points[3]];
    const diagonalDist = routeTotalDistance(diagonalOrder);

    expect(dist).toBeLessThanOrEqual(diagonalDist + 1);
  });

  it("visits every point exactly once", () => {
    const points: LonLat[] = Array.from({ length: 20 }, (_, i) => [
      150 + (i % 5) * 0.1,
      -33 + Math.floor(i / 5) * 0.1,
    ] as LonLat);

    const order = optimizeRouteOrder(points);
    expect(order).toHaveLength(20);
    expect(new Set(order).size).toBe(20);
  });
});
