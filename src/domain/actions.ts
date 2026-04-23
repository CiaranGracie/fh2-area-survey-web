import type { WaypointAction, WaypointActionType, WaypointActionParam } from "./types";

export type ActionCategory = "capture" | "camera" | "aircraft" | "file";

export interface ActionCatalogueEntry {
  type: WaypointActionType;
  label: string;
  category: ActionCategory;
  hasLens: boolean;
  defaultParams: WaypointActionParam;
  defaultTriggerType?: "multipleTiming" | "multipleDistance";
  defaultTriggerParam?: number;
}

export const ACTION_CATALOGUE: ActionCatalogueEntry[] = [
  // -- Capture --
  {
    type: "takePhoto",
    label: "Take Photo",
    category: "capture",
    hasLens: true,
    defaultParams: {
      fileSuffix: "",
      payloadPositionIndex: 0,
      useGlobalPayloadLensIndex: 0,
      payloadLensIndex: "visable",
    },
  },
  {
    type: "startRecord",
    label: "Start Recording",
    category: "capture",
    hasLens: true,
    defaultParams: {
      payloadPositionIndex: 0,
      useGlobalPayloadLensIndex: 0,
      payloadLensIndex: "visable",
    },
  },
  {
    type: "stopRecord",
    label: "Stop Recording",
    category: "capture",
    hasLens: false,
    defaultParams: {
      payloadPositionIndex: 0,
    },
  },
  {
    type: "timedIntervalShot",
    label: "Start Timed Interval Shot",
    category: "capture",
    hasLens: true,
    defaultParams: {
      payloadPositionIndex: 0,
      useGlobalPayloadLensIndex: 0,
      payloadLensIndex: "visable",
    },
    defaultTriggerType: "multipleTiming",
    defaultTriggerParam: 3,
  },
  {
    type: "distanceIntervalShot",
    label: "Start Distance Interval Shot",
    category: "capture",
    hasLens: true,
    defaultParams: {
      payloadPositionIndex: 0,
      useGlobalPayloadLensIndex: 0,
      payloadLensIndex: "visable",
    },
    defaultTriggerType: "multipleDistance",
    defaultTriggerParam: 10,
  },
  {
    type: "endIntervalShot",
    label: "End Interval Shot",
    category: "capture",
    hasLens: false,
    defaultParams: {},
  },

  // -- Camera --
  {
    type: "gimbalRotate",
    label: "Gimbal Tilt",
    category: "camera",
    hasLens: false,
    defaultParams: {
      gimbalHeadingYawBase: "north",
      gimbalRotateMode: "absoluteAngle",
      gimbalPitchRotateEnable: 1,
      gimbalPitchRotateAngle: -45,
      gimbalRollRotateEnable: 0,
      gimbalRollRotateAngle: 0,
      gimbalYawRotateEnable: 0,
      gimbalYawRotateAngle: 0,
      gimbalRotateTimeEnable: 0,
      gimbalRotateTime: 0,
      payloadPositionIndex: 0,
    },
  },
  {
    type: "zoom",
    label: "Camera Zoom",
    category: "camera",
    hasLens: false,
    defaultParams: {
      focalLength: 24,
      isUseFocalFactor: 0,
      payloadPositionIndex: 0,
    },
  },
  {
    type: "orientedShoot",
    label: "Take Photo (Fixed Angle)",
    category: "camera",
    hasLens: true,
    defaultParams: {
      gimbalPitchRotateAngle: -45,
      gimbalRollRotateAngle: 0,
      gimbalYawRotateAngle: 0,
      focusX: 0,
      focusY: 0,
      focusRegionWidth: 0,
      focusRegionHeight: 0,
      focalLength: 24,
      aircraftHeading: 0,
      accurateFrameValid: 0,
      payloadPositionIndex: 0,
      useGlobalPayloadLensIndex: 0,
      payloadLensIndex: "visable",
      targetAngle: 0,
      imageWidth: 0,
      imageHeight: 0,
      AFPos: 0,
      gimbalPort: 0,
      orientedCameraType: 99,
      orientedPhotoMode: "normalPhoto",
    },
  },
  {
    type: "panoShot",
    label: "Pano",
    category: "camera",
    hasLens: true,
    defaultParams: {
      payloadPositionIndex: 0,
      useGlobalPayloadLensIndex: 0,
      payloadLensIndex: "wide",
      panoShotSubMode: "panoShot_360",
    },
  },

  // -- Aircraft --
  {
    type: "rotateYaw",
    label: "Aircraft Yaw",
    category: "aircraft",
    hasLens: false,
    defaultParams: {
      aircraftHeading: 0,
      aircraftPathMode: "clockwise",
    },
  },
  {
    type: "hover",
    label: "Hover",
    category: "aircraft",
    hasLens: false,
    defaultParams: {
      hoverTime: 3,
    },
  },

  // -- File --
  {
    type: "customDirName",
    label: "Create Folder",
    category: "file",
    hasLens: false,
    defaultParams: {
      payloadPositionIndex: 0,
    },
  },
  {
    type: "recordCurrentAttitude",
    label: "Record Current Attitude",
    category: "file",
    hasLens: false,
    defaultParams: {},
  },
];

export const PALETTE_CATEGORIES: { key: ActionCategory; label: string }[] = [
  { key: "capture", label: "Capture" },
  { key: "camera", label: "Camera" },
  { key: "aircraft", label: "Aircraft" },
  { key: "file", label: "File" },
];

let actionIdCounter = 0;

export function createAction(type: WaypointActionType, overrides?: WaypointActionParam): WaypointAction {
  const entry = ACTION_CATALOGUE.find((a) => a.type === type);
  if (!entry) throw new Error(`Unknown action type: ${type}`);
  actionIdCounter++;
  return {
    id: `action-${actionIdCounter}-${Date.now()}`,
    type,
    params: { ...entry.defaultParams, ...overrides },
    triggerType: entry.defaultTriggerType,
    triggerParam: entry.defaultTriggerParam,
  };
}

export function getActionLabel(type: WaypointActionType): string {
  return ACTION_CATALOGUE.find((a) => a.type === type)?.label ?? type;
}

export function getActionEntry(type: WaypointActionType): ActionCatalogueEntry | undefined {
  return ACTION_CATALOGUE.find((a) => a.type === type);
}
