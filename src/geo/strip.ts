import type { LonLat, XY } from "../domain/types";
import type { Projector } from "./projection";

function normalize(x: number, y: number): XY {
  const len = Math.hypot(x, y) || 1;
  return [x / len, y / len];
}

function averageNormal(prev: XY | null, next: XY | null): XY {
  if (!prev && !next) return [0, 1];
  if (!prev) return next as XY;
  if (!next) return prev;
  const [x, y] = normalize(prev[0] + next[0], prev[1] + next[1]);
  return [x, y];
}

export function corridorPolygonFromLine(
  line: LonLat[],
  projector: Projector,
  leftExtend: number,
  rightExtend: number,
): LonLat[] {
  if (line.length < 2) return [];
  const xy = line.map((p) => projector.forward(p));
  const normals: XY[] = xy.map((pt, i) => {
    const prev = i > 0 ? xy[i - 1] : null;
    const next = i < xy.length - 1 ? xy[i + 1] : null;
    const prevNormal = prev ? normalize(-(pt[1] - prev[1]), pt[0] - prev[0]) : null;
    const nextNormal = next ? normalize(-(next[1] - pt[1]), next[0] - pt[0]) : null;
    return averageNormal(prevNormal, nextNormal);
  });

  const leftSide = xy.map((pt, i) => [pt[0] + normals[i][0] * leftExtend, pt[1] + normals[i][1] * leftExtend] as XY);
  const rightSide = [...xy]
    .reverse()
    .map((pt, reverseIndex) => {
      const i = xy.length - 1 - reverseIndex;
      return [pt[0] - normals[i][0] * rightExtend, pt[1] - normals[i][1] * rightExtend] as XY;
    });
  const polygonXY = [...leftSide, ...rightSide];
  return polygonXY.map((pt) => projector.backward(pt));
}

