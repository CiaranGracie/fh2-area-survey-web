import { CAMERAS, resolveCameraPayload } from "../domain/cameras";
import type {
  LonLat,
  LonLatAlt,
  PassLine,
  SurveyParams,
  SurveyResult,
} from "../domain/types";
import { addTerrainWaypoints, expandPolygonForMinLines, generateLines } from "../geo/grid";
import { gsdCm, haversineDistanceM, lineSpacingM, photoIntervalM } from "../geo/math";
import { projectorForLonLat } from "../geo/projection";
import { buildTemplateKml, buildWaylinesWpml } from "./xmlBuilders";
import type { WaylineFolderInput } from "./xmlBuilders";
import type { DsmSampler } from "../terrain/dsm";
import { mapHeightModeToExecuteMode } from "./waypointXmlBuilders";

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

function computeLineBreaks(lines: LonLat[][]): number[] {
  const breaks: number[] = [];
  let wpIdx = 0;
  for (const line of lines) {
    wpIdx += line.length;
    breaks.push(wpIdx - 1);
  }
  if (breaks.length > 0) breaks.pop();
  return breaks;
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
  bufferM = 0,
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
    bufferM,
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
  const resolvedCamera = resolveCameraPayload(camera, params.selectedPayloadKey);
  if (polygon.length < 3) throw new Error("Polygon requires at least 3 points.");

  const centerLon = polygon.reduce((acc, pt) => acc + pt[0], 0) / polygon.length;
  const centerLat = polygon.reduce((acc, pt) => acc + pt[1], 0) / polygon.length;
  const projector = projectorForLonLat(centerLon, centerLat);

  const spacingM = lineSpacingM(params.altitudeM, params.sideOverlapPct, resolvedCamera);
  const intervalM = photoIntervalM(params.altitudeM, params.forwardOverlapPct, resolvedCamera);
  const obliqueOffset =
    params.obliquePitch !== -90
      ? params.altitudeM / Math.tan((Math.abs(params.obliquePitch) * Math.PI) / 180)
      : 0;
  const perp = (params.courseDeg + 90) % 360;

  const surveyPolygon = expandPolygonForMinLines(
    polygon, params.courseDeg, spacingM, params.minLines, projector,
  );

  const passLines: PassLine[] = [];
  const folderInputs: WaylineFolderInput[] = [];
  const executeHeightMode = mapHeightModeToExecuteMode(
    params.realTimeTerrainFollow ? "realTimeFollowSurface" : params.heightMode === "ALT" ? "relativeToStartPoint" : "EGM96",
  );

  const maybeDensify = (input: LonLat[][]): LonLat[][] =>
    params.elevationOptimize ? addTerrainWaypoints(input, params.terrainIntervalM, projector) : input;

  const isOrtho = params.collectionMode === "ortho";
  const isOblique = params.collectionMode === "oblique";
  const usesSmartOblique = params.smartOblique;

  if (isOrtho && !usesSmartOblique) {
    const lines = maybeDensify(
      generateLines(surveyPolygon, params.courseDeg, spacingM, projector, 0, 0, params.marginM),
    );
    passLines.push({ label: "Nadir (-90°)", color: PASS_COLORS.nadir, lines, pitchDeg: -90 });
    const heights = await computeHeights(lines, params, dsmSampler);
    folderInputs.push({
      waypoints: flattenLines(lines, heights),
      pitchDeg: -90,
      speedMps: params.speedMps,
      photoIntervalM: intervalM,
      imageFormat: resolvedCamera.imageFormat,
      isSmartOblique: false,
      lineBreaks: computeLineBreaks(lines),
      executeHeightMode,
    });
  } else if (isOrtho && usesSmartOblique) {
    const lines = maybeDensify(
      generateLines(surveyPolygon, params.courseDeg, spacingM, projector, 0, 0, params.marginM),
    );
    passLines.push({ label: "Nadir + Smart", color: PASS_COLORS.smart, lines, pitchDeg: -90 });
    const heights = await computeHeights(lines, params, dsmSampler);
    folderInputs.push({
      waypoints: flattenLines(lines, heights),
      pitchDeg: -90,
      speedMps: params.speedMps,
      photoIntervalM: intervalM,
      imageFormat: resolvedCamera.imageFormat,
      isSmartOblique: true,
      lineBreaks: computeLineBreaks(lines),
      executeHeightMode,
    });
  } else if (isOblique && !usesSmartOblique) {
    const passConfigs: { label: string; color: string; bearing: number; offsetBearing: number; pitch: number }[] = [
      { label: "Nadir (-90°)", color: PASS_COLORS.nadir, bearing: params.courseDeg, offsetBearing: 0, pitch: -90 },
      { label: `East (${params.obliquePitch}°)`, color: PASS_COLORS.obliqueEast, bearing: params.courseDeg, offsetBearing: 90, pitch: params.obliquePitch },
      { label: `South (${params.obliquePitch}°)`, color: PASS_COLORS.obliqueSouth, bearing: perp, offsetBearing: 180, pitch: params.obliquePitch },
      { label: `West (${params.obliquePitch}°)`, color: PASS_COLORS.obliqueWest, bearing: params.courseDeg, offsetBearing: 270, pitch: params.obliquePitch },
      { label: `North (${params.obliquePitch}°)`, color: PASS_COLORS.obliqueNorth, bearing: perp, offsetBearing: 0, pitch: params.obliquePitch },
    ];

    for (const cfg of passConfigs) {
      const offset = cfg.pitch === -90 ? 0 : obliqueOffset;
      const raw = cfg.pitch === -90
        ? generateLines(surveyPolygon, cfg.bearing, spacingM, projector, 0, 0, params.marginM)
        : withOffsetPass(surveyPolygon, cfg.bearing, spacingM, offset, cfg.offsetBearing, params.marginM);
      const lines = maybeDensify(raw);
      passLines.push({ label: cfg.label, color: cfg.color, lines, pitchDeg: cfg.pitch });
      const heights = await computeHeights(lines, params, dsmSampler);
      folderInputs.push({
        waypoints: flattenLines(lines, heights),
        pitchDeg: cfg.pitch,
        speedMps: cfg.pitch === -90 ? params.speedMps : params.obliqueSpeedMps,
        photoIntervalM: intervalM,
        imageFormat: resolvedCamera.imageFormat,
        isSmartOblique: false,
        lineBreaks: computeLineBreaks(lines),
        executeHeightMode,
      });
    }
  } else {
    const lines = maybeDensify(
      generateLines(surveyPolygon, params.courseDeg, spacingM, projector, 0, 0, params.marginM),
    );
    passLines.push({ label: "Oblique + Smart", color: PASS_COLORS.smart, lines, pitchDeg: params.obliquePitch });
    const heights = await computeHeights(lines, params, dsmSampler);
    folderInputs.push({
      waypoints: flattenLines(lines, heights),
      pitchDeg: params.obliquePitch,
      speedMps: params.speedMps,
      photoIntervalM: intervalM,
      imageFormat: resolvedCamera.imageFormat,
      isSmartOblique: true,
      lineBreaks: computeLineBreaks(lines),
      executeHeightMode,
    });
  }

  const templateKml = buildTemplateKml(surveyPolygon, params, resolvedCamera);
  const { wpml, totalDistanceM } = buildWaylinesWpml(folderInputs, params, resolvedCamera);

  const stats = {
    nLines: passLines.reduce((acc, pass) => acc + pass.lines.length, 0),
    nWaypoints: folderInputs.reduce((acc, fi) => acc + fi.waypoints.length, 0),
    totalDistanceM,
    durationMin: totalDistanceM / params.speedMps / 60,
    nPhotosEstimate: Math.max(0, Math.trunc(routeDistance(passLines.flatMap((p) => p.lines)) / intervalM)),
    lineSpacingM: spacingM,
    photoIntervalM: intervalM,
    gsdCm: gsdCm(params.altitudeM, resolvedCamera),
    altitudeM: params.altitudeM,
    crsName: projector.info.name,
    epsg: projector.info.epsg,
  };

  return {
    stats,
    polygon,
    surveyPolygon,
    passes: passLines,
    wpml,
    templateKml,
  };
}
