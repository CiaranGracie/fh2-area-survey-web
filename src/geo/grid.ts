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

/**
 * Stretch a polygon in the cross-track direction (perpendicular to bearing)
 * by `extraM` metres total, split evenly to each side.
 * Works by rotating into flight-aligned space, scaling Y outward, then
 * rotating back.
 */
function stretchCrossTrack(
  polyXY: XY[],
  bearingDeg: number,
  extraM: number,
): XY[] {
  if (polyXY.length < 3 || extraM <= 0) return polyXY;

  const center = centroid(polyXY);
  const angleRad = ((bearingDeg - 90) * Math.PI) / 180;
  const rotated = polyXY.map((pt) => rotatePoint(pt, center, angleRad));

  const ys = rotated.map((pt) => pt[1]);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const currentSpan = maxY - minY;
  if (currentSpan < 1e-6) return polyXY;

  const midY = (minY + maxY) / 2;
  const scale = (currentSpan + extraM) / currentSpan;

  const stretched = rotated.map(
    (pt) => [pt[0], midY + (pt[1] - midY) * scale] as XY,
  );
  return stretched.map((pt) => rotatePoint(pt, center, -angleRad));
}

/**
 * Returns the number of scanlines the polygon would naturally produce
 * at the given bearing and spacing.
 */
export function countNaturalLines(
  polygonLonLat: LonLat[],
  bearingDeg: number,
  spacingM: number,
  projector: Projector,
): number {
  const projected = polygonLonLat.map((pt) => projector.forward(pt));
  if (projected.length < 3) return 0;
  const center = centroid(projected);
  const angleRad = ((bearingDeg - 90) * Math.PI) / 180;
  const rotated = projected.map((pt) => rotatePoint(pt, center, angleRad));
  const ys = rotated.map((pt) => pt[1]);
  const minY = Math.min(...ys) - spacingM;
  const maxY = Math.max(...ys) + spacingM;
  let count = 0;
  const closed = ensureClosed(rotated);
  for (let y = minY + spacingM / 2; y <= maxY; y += spacingM) {
    if (scanlineIntersections(closed, y).length >= 2) count++;
  }
  return count;
}

/**
 * Expand a polygon so it produces at least `minLines` flight lines for the
 * given bearing and spacing.  Stretches only in the cross-track direction
 * (perpendicular to the flight bearing) so the along-track extent stays the
 * same.  Returns the original polygon if it already produces enough lines.
 */
export function expandPolygonForMinLines(
  polygonLonLat: LonLat[],
  bearingDeg: number,
  spacingM: number,
  minLines: number,
  projector: Projector,
): LonLat[] {
  if (minLines <= 0) return polygonLonLat;

  const natural = countNaturalLines(polygonLonLat, bearingDeg, spacingM, projector);
  if (natural >= minLines) return polygonLonLat;

  const projected = polygonLonLat.map((pt) => projector.forward(pt));
  const center = centroid(projected);
  const angleRad = ((bearingDeg - 90) * Math.PI) / 180;
  const rotated = projected.map((pt) => rotatePoint(pt, center, angleRad));

  const ys = rotated.map((pt) => pt[1]);
  const currentCrossTrack = Math.max(...ys) - Math.min(...ys);

  const requiredCrossTrack = (minLines + 1) * spacingM;
  const deficit = requiredCrossTrack - currentCrossTrack;
  if (deficit <= 0) return polygonLonLat;

  const expanded = stretchCrossTrack(projected, bearingDeg, deficit);
  return expanded.map((pt) => projector.backward(pt));
}

export function generateLines(
  polygonLonLat: LonLat[],
  bearingDeg: number,
  spacingM: number,
  projector: Projector,
  offsetM = 0,
  offsetBearingDeg = 0,
  bufferM = 0,
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
      const startRot: XY = [intersections[i] - bufferM, y];
      const endRot: XY = [intersections[i + 1] + bufferM, y];
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

