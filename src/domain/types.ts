export type HeightMode = "ASL" | "ALT" | "AGL";
export type CollectionMode = "ortho" | "oblique";

export interface Camera {
  name: string;
  sensorWidthMm: number;
  sensorHeightMm: number;
  focalLengthMm: number;
  imageWidthPx: number;
  imageHeightPx: number;
  droneEnum: number;
  droneSubEnum: number;
  payloadEnum: number;
  payloadSubEnum: number;
  imageFormat: string;
}

export interface SurveyParams {
  altitudeM: number;
  heightMode: HeightMode;
  terrainFollow: boolean;
  realTimeTerrainFollow: boolean;
  collectionMode: CollectionMode;
  smartOblique: boolean;
  smartObliquePitch: number;
  obliquePitch: number;
  forwardOverlapPct: number;
  sideOverlapPct: number;
  obliqueForwardOverlapPct: number;
  obliqueSideOverlapPct: number;
  courseDeg: number;
  speedMps: number;
  obliqueSpeedMps: number;
  marginM: number;
  minLines: number;
  shootType: "distance" | "time";
  elevationOptimize: boolean;
  takeoffHeightM: number;
  rthHeightM: number;
  transitSpeedMps: number;
  finishAction: "goHome" | "autoLand" | "goContinue" | "noAction";
  geozoneBypass: boolean;
  obstacleBypass: boolean;
  terrainIntervalM: number;
  cameraKey: string;
  dsmFilename?: string;
}

export interface SurveyStats {
  nLines: number;
  nWaypoints: number;
  totalDistanceM: number;
  durationMin: number;
  nPhotosEstimate: number;
  lineSpacingM: number;
  photoIntervalM: number;
  gsdCm: number;
  altitudeM: number;
  crsName: string;
  epsg: number;
}

export interface PassLine {
  label: string;
  color: string;
  lines: LonLat[][];
  pitchDeg: number;
}

export interface SurveyResult {
  stats: SurveyStats;
  polygon: LonLat[];
  surveyPolygon: LonLat[];
  passes: PassLine[];
  wpml: string;
  templateKml: string;
}

export type LonLat = [number, number];
export type LonLatAlt = [number, number, number];
export type XY = [number, number];

// ---------------------------------------------------------------------------
// Waypoint Route types
// ---------------------------------------------------------------------------

export type WaypointHeadingMode = "followWayline" | "fixed" | "manually";

export type WaypointTurnMode =
  | "toPointAndStopWithDiscontinuityCurvature"
  | "coordinateTurn"
  | "toPointAndStopWithContinuityCurvature"
  | "toPointAndPassWithContinuityCurvature";

export type WaypointHeightMode = "relativeToStartPoint" | "EGM96" | "aboveGroundLevel";

export interface WaypointActionParam {
  [key: string]: string | number | boolean | undefined;
}

export type WaypointActionType =
  | "rotateYaw"
  | "gimbalRotate"
  | "zoom"
  | "takePhoto"
  | "startRecord"
  | "stopRecord"
  | "hover"
  | "panoShot"
  | "orientedShoot"
  | "customDirName"
  | "timedIntervalShot"
  | "distanceIntervalShot"
  | "endIntervalShot"
  | "recordCurrentAttitude";

export type InternalActionType =
  | "gimbalAngleLock"
  | "gimbalAngleUnlock"
  | "startContinuousShooting"
  | "stopContinuousShooting"
  | "startSmartOblique"
  | "stopSmartOblique"
  | "setFocusType"
  | "focus";

export interface WaypointAction {
  id: string;
  type: WaypointActionType;
  params: WaypointActionParam;
  triggerType?: "reachPoint" | "multipleTiming" | "multipleDistance";
  triggerParam?: number;
}

export interface Waypoint {
  id: string;
  name: string;
  description: string;
  coordinates: LonLat;
  height: number;
  speed: number;
  headingMode: WaypointHeadingMode;
  headingAngle: number;
  turnMode: WaypointTurnMode;
  turnDampingDist: number;
  useStraightLine: boolean;
  useGlobalHeight: boolean;
  useGlobalSpeed: boolean;
  useGlobalHeadingParam: boolean;
  useGlobalTurnParam: boolean;
  actions: WaypointAction[];
}

export interface WaypointRouteParams {
  heightMode: WaypointHeightMode;
  defaultHeight: number;
  defaultSpeed: number;
  defaultHeadingMode: WaypointHeadingMode;
  defaultTurnMode: WaypointTurnMode;
  takeoffHeightM: number;
  rthHeightM: number;
  transitSpeedMps: number;
  finishAction: "goHome" | "autoLand" | "goContinue" | "noAction";
  geozoneBypass: boolean;
  obstacleBypass: boolean;
  cameraKey: string;
}

export interface WaypointRouteResult {
  waypoints: Waypoint[];
  params: WaypointRouteParams;
  wpml: string;
  templateKml: string;
}

export type AppMode = "areaSurvey" | "waypointRoute";

