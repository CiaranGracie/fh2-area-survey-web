export type HeightMode = "ASL" | "ALT" | "AGL";
export type CollectionMode = "ortho" | "oblique";
export type SurveyTemplateType = "mapping2d" | "mapping3d" | "mappingStrip";
export type PositioningType = "GPS" | "RTKBaseStation" | "QianXun" | "Custom";
export type RcLostMode = "goContinue" | "executeLostAction";
export type RcLostAction = "goBack" | "landing" | "hover";

export interface Camera {
  name: string;
  sensorWidthMm: number;
  sensorHeightMm: number;
  focalLengthMm: number;
  imageWidthPx: number;
  imageHeightPx: number;
  droneEnum: number;
  droneSubEnum: number;
  payloadEnum: number | null;
  payloadSubEnum: number;
  imageFormat: string;
  orientedCameraType: number;
  payloadPositionIndex: 0 | 1 | 2;
  supportsPayloadSwap: boolean;
  isLidar: boolean;
  isRtk: boolean;
}

export interface PayloadPreset {
  name: string;
  payloadEnum: number;
  payloadSubEnum: number;
  orientedCameraType?: number;
  isLidar?: boolean;
}

export interface SurveyParams {
  templateType: SurveyTemplateType;
  altitudeM: number;
  heightMode: HeightMode;
  positioningType: PositioningType;
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
  exitOnRCLost: RcLostMode;
  executeRCLostAction: RcLostAction;
  geozoneBypass: boolean;
  obstacleBypass: boolean;
  terrainIntervalM: number;
  mappingHeadingMode: "followWayline" | "fixed";
  mappingHeadingAngle: number;
  payloadPositionIndex: 0 | 1 | 2;
  selectedPayloadKey?: string;
  cameraKey: string;
  dsmFilename?: string;
  singleLineEnable: boolean;
  cuttingDistance: number;
  boundaryOptimEnable: boolean;
  leftExtend: number;
  rightExtend: number;
  includeCenterEnable: boolean;
  stripUseTemplateAltitude: boolean;
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

export type WaypointHeadingMode =
  | "followWayline"
  | "fixed"
  | "manually"
  | "smoothTransition"
  | "towardPOI";
export type WaypointHeadingPathMode = "followBadArc" | "clockwise" | "counterClockwise";

export type WaypointTurnMode =
  | "toPointAndStopWithDiscontinuityCurvature"
  | "coordinateTurn"
  | "toPointAndStopWithContinuityCurvature"
  | "toPointAndPassWithContinuityCurvature";

export type WaypointHeightMode =
  | "relativeToStartPoint"
  | "EGM96"
  | "aboveGroundLevel"
  | "realTimeFollowSurface";
export type WaypointGimbalPitchMode = "manual" | "usePointSetting";

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
  | "recordCurrentAttitude"
  | "gimbalEvenlyRotate"
  | "recordPointCloud"
  | "accurateShoot";

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
  triggerType?: "reachPoint" | "multipleTiming" | "multipleDistance" | "betweenAdjacentPoints";
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
  headingPathMode?: WaypointHeadingPathMode;
  poiPoint?: [number, number, number];
  poiIndex?: number;
  turnMode: WaypointTurnMode;
  turnDampingDist: number;
  useStraightLine: boolean;
  payloadPositionIndex?: 0 | 1 | 2;
  gimbalPitchAngle?: number;
  gimbalYawAngle?: number;
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
  defaultHeadingPathMode: WaypointHeadingPathMode;
  defaultTurnMode: WaypointTurnMode;
  gimbalPitchMode: WaypointGimbalPitchMode;
  positioningType: PositioningType;
  payloadPositionIndex: 0 | 1 | 2;
  selectedPayloadKey?: string;
  takeoffHeightM: number;
  rthHeightM: number;
  transitSpeedMps: number;
  finishAction: "goHome" | "autoLand" | "goContinue" | "noAction";
  exitOnRCLost: RcLostMode;
  executeRCLostAction: RcLostAction;
  geozoneBypass: boolean;
  obstacleBypass: boolean;
  cameraKey: string;
  startActionGroupEnabled: boolean;
  startActionGroupPitch: number;
  startActionGroupHoverSec: number;
}

export interface WaypointRouteResult {
  waypoints: Waypoint[];
  params: WaypointRouteParams;
  wpml: string;
  templateKml: string;
}

export type AppMode = "areaSurvey" | "waypointRoute" | "mappingStrip";

