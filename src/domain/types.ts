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
  courseDeg: number;
  speedMps: number;
  marginM: number;
  shootType: "distance" | "time";
  elevationOptimize: boolean;
  takeoffHeightM: number;
  rthHeightM: number;
  transitSpeedMps: number;
  finishAction: "goHome" | "autoLand" | "goContinue";
  geozoneBypass: boolean;
  obstacleBypass: boolean;
  terrainIntervalM: number;
  cameraKey: string;
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
  passes: PassLine[];
  wpml: string;
  templateKml: string;
}

export type LonLat = [number, number];
export type LonLatAlt = [number, number, number];
export type XY = [number, number];

