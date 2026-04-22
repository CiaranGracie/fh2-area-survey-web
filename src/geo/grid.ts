import type { LonLat, XY } from "../domain/types";
import type { Projector } from "./projection";

function centroid(points: XY[]): XY {
  const sum = points.reduce(
    (acc, pt) => [acc[0] + pt[0], acc[1] + pt[1]] as XY,
    [0, 0] as XY,
  );
  return [sum[0] / points.length, sum[1] / points.length];
}

function rotatePoint(point: XY, origin: XY, angleRad: number): XY {
  const dx = point[0] - origin[0];
  const dy = point[1] - origin[1];
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);
  return [
    origin[0] + dx * cosA - dy * sinA,
    origin[1] + dx * sinA + dy * cosA,
  ];
}

function ensureClosed(points: XY[]): XY[] {
  if (points.length < 3) return points;
  const first = points[0];
  const last = points[points.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return points;
  return [...points, first];
}

function scanlineIntersections(polygonClosed: XY[], y: number): number[] {
  const xs: number[] = [];
  for (let i = 0; i < polygonClosed.length - 1; i += 1) {
    const [x1, y1] = polygonClosed[i];
    const [x2, y2] = polygonClosed[i + 1];
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    if (y < minY || y > maxY) continue;
    if (y1 === y2) continue;
    if (y === maxY) continue;
    const t = (y - y1) / (y2 - y1);
    const x = x1 + t * (x2 - x1);
    xs.push(x);
  }
  xs.sort((a, b) => a - b);
  return xs;
}

export function generateLines(
  polygonLonLat: LonLat[],
  bearingDeg: number,
  spacingM: number,
  projector: Projector,
  offsetM = 0,
  offsetBearingDeg = 0,
): LonLat[][] {
  const projected = polygonLonLat.map((pt) => projector.forward(pt));
  if (projected.length < 3) return [];

  const offsetDx = offsetM * Math.sin((offsetBearingDeg * Math.PI) / 180);
  const offsetDy = offsetM * Math.cos((offsetBearingDeg * Math.PI) / 180);
  const shifted = projected.map(([x, y]) => [x + offsetDx, y + offsetDy] as XY);
  const center = centroid(shifted);

  const angleRad = ((bearingDeg - 90) * Math.PI) / 180;
  const rotatedPoly = shifted.map((pt) => rotatePoint(pt, center, angleRad));
  const closed = ensureClosed(rotatedPoly);

  const ys = rotatedPoly.map((pt) => pt[1]);
  const minY = Math.min(...ys) - spacingM;
  const maxY = Math.max(...ys) + spacingM;

  const result: LonLat[][] = [];
  for (let y = minY + spacingM / 2; y <= maxY; y += spacingM) {
    const intersections = scanlineIntersections(closed, y);
    for (let i = 0; i + 1 < intersections.length; i += 2) {
      const startRot: XY = [intersections[i], y];
      const endRot: XY = [intersections[i + 1], y];
      const backStart = rotatePoint(startRot, center, -angleRad);
      const backEnd = rotatePoint(endRot, center, -angleRad);
      result.push([projector.backward(backStart), projector.backward(backEnd)]);
    }
  }

  for (let i = 1; i < result.length; i += 2) {
    result[i] = [...result[i]].reverse();
  }
  return result;
}

export function addTerrainWaypoints(
  lines: LonLat[][],
  intervalM: number,
  projector: Projector,
): LonLat[][] {
  if (intervalM <= 0) return lines;
  return lines.map((line) => {
    const projected = line.map((pt) => projector.forward(pt));
    const densified: XY[] = [projected[0]];
    for (let i = 0; i < projected.length - 1; i += 1) {
      const p1 = projected[i];
      const p2 = projected[i + 1];
      const dx = p2[0] - p1[0];
      const dy = p2[1] - p1[1];
      const distance = Math.hypot(dx, dy);
      if (distance > intervalM) {
        const n = Math.ceil(distance / intervalM);
        for (let j = 1; j < n; j += 1) {
          densified.push([p1[0] + (j / n) * dx, p1[1] + (j / n) * dy]);
        }
      }
      densified.push(p2);
    }
    return densified.map((pt) => projector.backward(pt));
  });
}

