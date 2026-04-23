import { DEFAULT_CAMERA_KEY } from "./cameras";
import type { SurveyParams, WaypointRouteParams } from "./types";

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
  obliqueForwardOverlapPct: 80,
  obliqueSideOverlapPct: 70,
  courseDeg: 0,
  speedMps: 12,
  obliqueSpeedMps: 15,
  marginM: 0,
  minLines: 0,
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

export const DEFAULT_WAYPOINT_PARAMS: WaypointRouteParams = {
  heightMode: "aboveGroundLevel",
  defaultHeight: 80,
  defaultSpeed: 10,
  defaultHeadingMode: "followWayline",
  defaultTurnMode: "toPointAndStopWithDiscontinuityCurvature",
  takeoffHeightM: 80,
  rthHeightM: 100,
  transitSpeedMps: 15,
  finishAction: "goHome",
  geozoneBypass: true,
  obstacleBypass: true,
  cameraKey: DEFAULT_CAMERA_KEY,
};

