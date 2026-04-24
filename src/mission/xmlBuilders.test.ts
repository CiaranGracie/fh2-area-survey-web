import { describe, expect, it } from "vitest";
import { CAMERAS } from "../domain/cameras";
import { DEFAULT_PARAMS } from "../domain/defaults";
import type { LonLat, SurveyParams } from "../domain/types";
import { buildTemplateKml, buildWaylinesWpml } from "./xmlBuilders";
import type { WaylineFolderInput } from "./xmlBuilders";

const camera = CAMERAS["M4D Wide (24mm)"];
const polygon: LonLat[] = [
  [151.2, -33.9],
  [151.2008, -33.9],
  [151.2008, -33.8992],
  [151.2, -33.8992],
];

function makeParams(overrides: Partial<SurveyParams> = {}): SurveyParams {
  return { ...DEFAULT_PARAMS, ...overrides };
}

describe("buildTemplateKml", () => {
  it("emits mapping2d for ortho plain", () => {
    const kml = buildTemplateKml(polygon, makeParams({ collectionMode: "ortho", smartOblique: false }), camera);
    expect(kml).toContain("<wpml:templateType>mapping2d</wpml:templateType>");
    expect(kml).toContain("<wpml:smartObliqueEnable>0</wpml:smartObliqueEnable>");
    expect(kml).toContain("<wpml:quickOrthoMappingEnable>0</wpml:quickOrthoMappingEnable>");
    expect(kml).toContain("<wpml:payloadParam>");
    expect(kml).toContain("<wpml:imageFormat>visible</wpml:imageFormat>");
  });

  it("emits mapping2d with quickOrthoMappingEnable for ortho+smart", () => {
    const kml = buildTemplateKml(polygon, makeParams({ collectionMode: "ortho", smartOblique: true }), camera);
    expect(kml).toContain("<wpml:templateType>mapping2d</wpml:templateType>");
    expect(kml).toContain("<wpml:quickOrthoMappingEnable>1</wpml:quickOrthoMappingEnable>");
    expect(kml).toContain("<wpml:quickOrthoMappingPitch>");
  });

  it("emits mapping3d for oblique 5-pass and omits smartOblique tags", () => {
    const kml = buildTemplateKml(polygon, makeParams({ collectionMode: "oblique", smartOblique: false }), camera);
    expect(kml).toContain("<wpml:templateType>mapping3d</wpml:templateType>");
    expect(kml).not.toContain("smartObliqueEnable");
    expect(kml).not.toContain("quickOrthoMappingEnable");
    expect(kml).toContain("<wpml:inclinedGimbalPitch>");
    expect(kml).toContain("<wpml:inclinedFlightSpeed>");
    expect(kml).toContain("inclinedCameraOverlapH");
  });

  it("emits mapping2d with smartObliqueEnable for oblique+smart", () => {
    const kml = buildTemplateKml(polygon, makeParams({ collectionMode: "oblique", smartOblique: true }), camera);
    expect(kml).toContain("<wpml:templateType>mapping2d</wpml:templateType>");
    expect(kml).toContain("<wpml:smartObliqueEnable>1</wpml:smartObliqueEnable>");
    expect(kml).toContain("<wpml:smartObliqueGimbalPitch>");
  });

  it("includes AGL surface follow elements", () => {
    const kml = buildTemplateKml(
      polygon,
      makeParams({ heightMode: "AGL", realTimeTerrainFollow: false, dsmFilename: "test.tif" }),
      camera,
    );
    expect(kml).toContain("<wpml:surfaceFollowModeEnable>1</wpml:surfaceFollowModeEnable>");
    expect(kml).toContain("<wpml:isRealtimeSurfaceFollow>0</wpml:isRealtimeSurfaceFollow>");
    expect(kml).toContain("<wpml:dsmFile>wpmz/res/dsm/test.tif</wpml:dsmFile>");
  });

  it("includes RTTF elements for real-time terrain follow", () => {
    const kml = buildTemplateKml(
      polygon,
      makeParams({ heightMode: "AGL", realTimeTerrainFollow: true }),
      camera,
    );
    expect(kml).toContain("<wpml:heightMode>realTimeFollowSurface</wpml:heightMode>");
    expect(kml).toContain("<wpml:isRealtimeSurfaceFollow>1</wpml:isRealtimeSurfaceFollow>");
  });
});

describe("buildWaylinesWpml", () => {
  function makeFolderInput(overrides: Partial<WaylineFolderInput> = {}): WaylineFolderInput {
    return {
      waypoints: [
        [151.2, -33.9, 120],
        [151.2008, -33.9, 120],
        [151.2008, -33.8992, 120],
        [151.2, -33.8992, 120],
      ],
      pitchDeg: -90,
      speedMps: 12,
      photoIntervalM: 25,
      imageFormat: "visible",
      isSmartOblique: false,
      lineBreaks: [1],
      ...overrides,
    };
  }

  it("generates standard capture with startActionGroup and action groups", () => {
    const { wpml } = buildWaylinesWpml([makeFolderInput()], makeParams(), camera);
    expect(wpml).toContain("<wpml:startActionGroup>");
    expect(wpml).toContain("<wpml:actionActuatorFunc>gimbalRotate</wpml:actionActuatorFunc>");
    expect(wpml).toContain("<wpml:actionActuatorFunc>setFocusType</wpml:actionActuatorFunc>");
    expect(wpml).toContain("<wpml:actionActuatorFunc>focus</wpml:actionActuatorFunc>");
    expect(wpml).toContain("<wpml:actionActuatorFunc>gimbalAngleLock</wpml:actionActuatorFunc>");
    expect(wpml).toContain("<wpml:actionTriggerType>multipleDistance</wpml:actionTriggerType>");
    expect(wpml).toContain("<wpml:actionActuatorFunc>startContinuousShooting</wpml:actionActuatorFunc>");
    expect(wpml).toContain("<wpml:actionActuatorFunc>stopContinuousShooting</wpml:actionActuatorFunc>");
    expect(wpml).toContain("<wpml:actionActuatorFunc>gimbalAngleUnlock</wpml:actionActuatorFunc>");
  });

  it("generates smart oblique capture with start/stop smart oblique", () => {
    const { wpml } = buildWaylinesWpml(
      [makeFolderInput({ isSmartOblique: true })],
      makeParams(),
      camera,
    );
    expect(wpml).toContain("<wpml:actionActuatorFunc>startSmartOblique</wpml:actionActuatorFunc>");
    expect(wpml).toContain("<wpml:actionActuatorFunc>stopSmartOblique</wpml:actionActuatorFunc>");
    expect(wpml).not.toContain("<wpml:actionActuatorFunc>startContinuousShooting</wpml:actionActuatorFunc>");
  });

  it("uses correct turn modes for first and last waypoints", () => {
    const { wpml } = buildWaylinesWpml([makeFolderInput()], makeParams(), camera);
    const placemarks = wpml.split("<Placemark>");
    const firstWp = placemarks[1];
    const lastWp = placemarks[placemarks.length - 1];
    expect(firstWp).toContain("toPointAndStopWithDiscontinuityCurvature");
    expect(lastWp).toContain("toPointAndStopWithDiscontinuityCurvature");
  });

  it("uses coordinateTurn for mid-line waypoints in standard mode", () => {
    const { wpml } = buildWaylinesWpml([makeFolderInput()], makeParams(), camera);
    const placemarks = wpml.split("<Placemark>");
    const midWp = placemarks[2];
    expect(midWp).toContain("coordinateTurn");
  });

  it("includes missionConfig in wpml", () => {
    const { wpml } = buildWaylinesWpml([makeFolderInput()], makeParams(), camera);
    expect(wpml).toContain("<wpml:missionConfig>");
    expect(wpml).toContain("<wpml:droneEnumValue>100</wpml:droneEnumValue>");
    expect(wpml).toContain("<wpml:payloadEnumValue>98</wpml:payloadEnumValue>");
  });

  it("generates multiple folders for oblique 5-pass inputs", () => {
    const folders = Array.from({ length: 5 }, (_, i) =>
      makeFolderInput({ pitchDeg: i === 0 ? -90 : -45 }),
    );
    const { wpml } = buildWaylinesWpml(folders, makeParams(), camera);
    const folderCount = (wpml.match(/<Folder>/g) ?? []).length;
    expect(folderCount).toBe(5);
  });
});
