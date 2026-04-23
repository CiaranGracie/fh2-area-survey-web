import type { LonLat } from "../domain/types";

function haversineDistance(a: LonLat, b: LonLat): number {
  const R = 6371000;
  const toRad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * toRad;
  const dLon = (b[0] - a[0]) * toRad;
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(a[1] * toRad) * Math.cos(b[1] * toRad) * sinLon * sinLon;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function buildDistanceMatrix(points: LonLat[]): number[][] {
  const n = points.length;
  const dist: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = haversineDistance(points[i], points[j]);
      dist[i][j] = d;
      dist[j][i] = d;
    }
  }
  return dist;
}

function tourDistance(tour: number[], dist: number[][]): number {
  let total = 0;
  for (let i = 0; i < tour.length - 1; i++) {
    total += dist[tour[i]][tour[i + 1]];
  }
  return total;
}

function nearestNeighborTour(n: number, dist: number[][]): number[] {
  const visited = new Set<number>();
  const tour: number[] = [0];
  visited.add(0);

  for (let step = 1; step < n; step++) {
    const last = tour[tour.length - 1];
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let j = 0; j < n; j++) {
      if (!visited.has(j) && dist[last][j] < bestDist) {
        bestDist = dist[last][j];
        bestIdx = j;
      }
    }
    tour.push(bestIdx);
    visited.add(bestIdx);
  }

  return tour;
}

function twoOptImprove(tour: number[], dist: number[][]): number[] {
  const n = tour.length;
  let improved = true;
  let best = [...tour];

  while (improved) {
    improved = false;
    for (let i = 0; i < n - 2; i++) {
      for (let j = i + 2; j < n; j++) {
        const oldDist = dist[best[i]][best[i + 1]] + (j + 1 < n ? dist[best[j]][best[j + 1]] : 0);
        const newDist = dist[best[i]][best[j]] + (j + 1 < n ? dist[best[i + 1]][best[j + 1]] : 0);
        if (newDist < oldDist - 1e-10) {
          const reversed = best.slice(i + 1, j + 1).reverse();
          best = [...best.slice(0, i + 1), ...reversed, ...best.slice(j + 1)];
          improved = true;
        }
      }
    }
  }

  return best;
}

/**
 * Returns an optimized ordering of point indices that minimizes total
 * travel distance (open path, not returning to start).
 * Uses nearest-neighbor heuristic + 2-opt improvement.
 */
export function optimizeRouteOrder(points: LonLat[]): number[] {
  const n = points.length;
  if (n <= 2) return Array.from({ length: n }, (_, i) => i);

  const dist = buildDistanceMatrix(points);
  const initial = nearestNeighborTour(n, dist);
  return twoOptImprove(initial, dist);
}

export function routeTotalDistance(points: LonLat[]): number {
  if (points.length < 2) return 0;
  const dist = buildDistanceMatrix(points);
  const tour = Array.from({ length: points.length }, (_, i) => i);
  return tourDistance(tour, dist);
}
