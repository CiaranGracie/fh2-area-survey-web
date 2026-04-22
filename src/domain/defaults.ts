import { DEFAULT_CAMERA_KEY } from "./cameras";
import type { SurveyParams } from "./types";

export const DEFAULT_PARAMS: SurveyParams = {
  altitudeM: 120,
  heightMode: "AGL",
  terrainFollow: false,
  realTimeTerrainFollow: false,
  collectionMode: "ortho",
  smartOblique: false,
  smartObliquePitch: 30,
  obliquePitch: -45,
  forwardOverlapPct: 80,
  sideOverlapPct: 70,
  courseDeg: 0,
  speedMps: 12,
  marginM: 0,
  shootType: "distance",
  elevationOptimize: true,
  takeoffHeightM: 120,
  rthHeightM: 100,
  transitSpeedMps: 15,
  finishAction: "goHome",
  geozoneBypass: true,
  obstacleBypass: true,
  terrainIntervalM: 100,
  cameraKey: DEFAULT_CAMERA_KEY,
};

