import { CAMERAS } from "../domain/cameras";
import type {
  LonLat,
  LonLatAlt,
  PassLine,
  SurveyParams,
  SurveyResult,
} from "../domain/types";
import { addTerrainWaypoints, generateLines } from "../geo/grid";
import { gsdCm, haversineDistanceM, lineSpacingM, photoIntervalM } from "../geo/math";
import { projectorForLonLat } from "../geo/projection";
import { buildTemplateKml, buildWaylinesWpml } from "./xmlBuilders";
import type { DsmSampler } from "../terrain/dsm";

const PASS_COLORS = {
  nadir: "#3b82f6",
  obliqueEast: "#f97316",
  obliqueSouth: "#10b981",
  obliqueWest: "#ef4444",
  obliqueNorth: "#a855f7",
  smart: "#06b6d4",
} as const;

function flattenLines(lines: LonLat[][], heights: number[]): LonLatAlt[] {
  const out: LonLatAlt[] = [];
  let idx = 0;
  for (const line of lines) {
    for (const point of line) {
      out.push([point[0], point[1], heights[idx]]);
      idx += 1;
    }
  }
  return out;
}

async function computeHeights(
  lines: LonLat[][],
  params: SurveyParams,
  dsmSampler?: DsmSampler,
): Promise<number[]> {
  const flattened = lines.flat();
  if (!dsmSampler || flattened.length === 0) {
    return new Array(flattened.length).fill(params.altitudeM);
  }
  const sampled = await dsmSampler.sample(flattened);
  return sampled.map((v) => v + params.altitudeM);
}

function withOffsetPass(
  polygon: LonLat[],
  courseDeg: number,
  lineSpacingMeters: number,
  offsetM: number,
  offsetBearingDeg: number,
) {
  const centerLon = polygon.reduce((acc, pt) => acc + pt[0], 0) / polygon.length;
  const centerLat = polygon.reduce((acc, pt) => acc + pt[1], 0) / polygon.length;
  const projector = projectorForLonLat(centerLon, centerLat);
  return generateLines(
    polygon,
    courseDeg,
    lineSpacingMeters,
    projector,
    offsetM,
    offsetBearingDeg,
  );
}

function routeDistance(lines: LonLat[][]): number {
  let distanceM = 0;
  for (const line of lines) {
    for (let i = 0; i < line.length - 1; i += 1) {
      distanceM += haversineDistanceM(line[i], line[i + 1]);
    }
  }
  return distanceM;
}

export async function generateSurvey(
  polygon: LonLat[],
  params: SurveyParams,
  dsmSampler?: DsmSampler,
): Promise<SurveyResult> {
  const camera = CAMERAS[params.cameraKey];
  if (!camera) throw new Error(`Unknown camera ${params.cameraKey}`);
  if (polygon.length < 3) throw new Error("Polygon requires at least 3 points.");

  const centerLon = polygon.reduce((acc, pt) => acc + pt[0], 0) / polygon.length;
  const centerLat = polygon.reduce((acc, pt) => acc + pt[1], 0) / polygon.length;
  const projector = projectorForLonLat(centerLon, centerLat);

  const spacingM = lineSpacingM(params.altitudeM, params.sideOverlapPct, camera);
  const intervalM = photoIntervalM(params.altitudeM, params.forwardOverlapPct, camera);
  const obliqueOffset =
    params.obliquePitch !== -90
      ? params.altitudeM / Math.tan((Math.abs(params.obliquePitch) * Math.PI) / 180)
      : 0;
  const perp = (params.courseDeg + 90) % 360;

  const passLines: PassLine[] = [];
  let waylineSet: LonLat[][][] = [];

  const maybeDensify = (input: LonLat[][]): LonLat[][] =>
    params.elevationOptimize ? addTerrainWaypoints(input, params.terrainIntervalM, projector) : input;

  if (params.collectionMode === "ortho" && !params.smartOblique) {
    const lines = maybeDensify(
      generateLines(polygon, params.courseDeg, spacingM, projector),
    );
    waylineSet = [lines];
    passLines.push({ label: "Nadir (-90°)", color: PASS_COLORS.nadir, lines, pitchDeg: -90 });
  } else if (params.collectionMode === "ortho" && params.smartOblique) {
    const lines = maybeDensify(
      generateLines(polygon, params.courseDeg, spacingM, projector),
    );
    waylineSet = [lines];
    passLines.push({ label: "Nadir + Smart", color: PASS_COLORS.smart, lines, pitchDeg: -90 });
  } else if (params.collectionMode === "oblique" && !params.smartOblique) {
    const nadir = maybeDensify(
      generateLines(polygon, params.courseDeg, spacingM, projector),
    );
    const east = maybeDensify(withOffsetPass(polygon, params.courseDeg, spacingM, obliqueOffset, 90));
    const south = maybeDensify(withOffsetPass(polygon, perp, spacingM, obliqueOffset, 180));
    const west = maybeDensify(withOffsetPass(polygon, params.courseDeg, spacingM, obliqueOffset, 270));
    const north = maybeDensify(withOffsetPass(polygon, perp, spacingM, obliqueOffset, 0));
    waylineSet = [nadir, east, south, west, north];
    passLines.push({ label: "Nadir (-90°)", color: PASS_COLORS.nadir, lines: nadir, pitchDeg: -90 });
    passLines.push({ label: `East (${params.obliquePitch}°)`, color: PASS_COLORS.obliqueEast, lines: east, pitchDeg: params.obliquePitch });
    passLines.push({ label: `South (${params.obliquePitch}°)`, color: PASS_COLORS.obliqueSouth, lines: south, pitchDeg: params.obliquePitch });
    passLines.push({ label: `West (${params.obliquePitch}°)`, color: PASS_COLORS.obliqueWest, lines: west, pitchDeg: params.obliquePitch });
    passLines.push({ label: `North (${params.obliquePitch}°)`, color: PASS_COLORS.obliqueNorth, lines: north, pitchDeg: params.obliquePitch });
  } else {
    const lines = maybeDensify(
      generateLines(polygon, params.courseDeg, spacingM, projector),
    );
    waylineSet = [lines];
    passLines.push({ label: "Oblique + Smart", color: PASS_COLORS.smart, lines, pitchDeg: params.obliquePitch });
  }

  const flattenedWaylines: LonLatAlt[][] = [];
  for (const lines of waylineSet) {
    if (!lines.length) continue;
    const heights = await computeHeights(lines, params, dsmSampler);
    flattenedWaylines.push(flattenLines(lines, heights));
  }

  const templateKml = buildTemplateKml(polygon, params, camera);
  const { wpml, totalDistanceM } = buildWaylinesWpml(flattenedWaylines, params, camera);

  const stats = {
    nLines: passLines.reduce((acc, pass) => acc + pass.lines.length, 0),
    nWaypoints: flattenedWaylines.reduce((acc, line) => acc + line.length, 0),
    totalDistanceM,
    durationMin: totalDistanceM / params.speedMps / 60,
    nPhotosEstimate: Math.max(0, Math.trunc(routeDistance(passLines.flatMap((p) => p.lines)) / intervalM)),
    lineSpacingM: spacingM,
    photoIntervalM: intervalM,
    gsdCm: gsdCm(params.altitudeM, camera),
    altitudeM: params.altitudeM,
    crsName: projector.info.name,
    epsg: projector.info.epsg,
  };

  return {
    stats,
    polygon,
    passes: passLines,
    wpml,
    templateKml,
  };
}

