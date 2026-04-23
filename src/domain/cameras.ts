import type { Camera } from "./types";

export const CAMERAS: Record<string, Camera> = {
  "M4D Wide (24mm)": {
    name: "M4D Wide (24mm)",
    sensorWidthMm: 9.6,
    sensorHeightMm: 7.2,
    focalLengthMm: 6.72,
    imageWidthPx: 5280,
    imageHeightPx: 3956,
    droneEnum: 100,
    droneSubEnum: 0,
    payloadEnum: 98,
    payloadSubEnum: 0,
    imageFormat: "visable",
  },
  "M4E Wide (24mm)": {
    name: "M4E Wide (24mm)",
    sensorWidthMm: 9.6,
    sensorHeightMm: 7.2,
    focalLengthMm: 6.72,
    imageWidthPx: 5280,
    imageHeightPx: 3956,
    droneEnum: 100,
    droneSubEnum: 0,
    payloadEnum: 98,
    payloadSubEnum: 0,
    imageFormat: "visable",
  },
  "M4T (Thermal)": {
    name: "M4T (Thermal)",
    sensorWidthMm: 9.6,
    sensorHeightMm: 7.2,
    focalLengthMm: 6.72,
    imageWidthPx: 5280,
    imageHeightPx: 3956,
    droneEnum: 100,
    droneSubEnum: 1,
    payloadEnum: 99,
    payloadSubEnum: 2,
    imageFormat: "visable,ir",
  },
};

export const DEFAULT_CAMERA_KEY = "M4D Wide (24mm)";

