import type { Camera, LonLat } from "../domain/types";

export const EARTH_RADIUS_M = 6371000;

export function gsdCm(altitudeM: number, camera: Camera): number {
  return (
    (camera.sensorWidthMm * altitudeM) /
    (camera.focalLengthMm * camera.imageWidthPx) *
    100
  );
}

export function footprintM(
  altitudeM: number,
  camera: Camera,
): { widthM: number; heightM: number } {
  const widthM =
    (camera.sensorWidthMm * altitudeM) /
    (camera.focalLengthMm * camera.imageWidthPx) *
    camera.imageWidthPx;
  const heightM =
    (camera.sensorHeightMm * altitudeM) /
    (camera.focalLengthMm * camera.imageHeightPx) *
    camera.imageHeightPx;
  return { widthM, heightM };
}

export function lineSpacingM(
  altitudeM: number,
  sideOverlapPct: number,
  camera: Camera,
): number {
  const { widthM } = footprintM(altitudeM, camera);
  return widthM * (1 - sideOverlapPct / 100);
}

export function photoIntervalM(
  altitudeM: number,
  forwardOverlapPct: number,
  camera: Camera,
): number {
  const { heightM } = footprintM(altitudeM, camera);
  return heightM * (1 - forwardOverlapPct / 100);
}

export function altitudeFromGsd(gsdCmPerPx: number, camera: Camera): number {
  return (gsdCmPerPx / 100) * (camera.focalLengthMm * camera.imageWidthPx) / camera.sensorWidthMm;
}

export function haversineDistanceM(a: LonLat, b: LonLat): number {
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLon / 2);
  const aa =
    s1 * s1 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * s2 * s2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
}

export function headingDeg(a: LonLat, b: LonLat): number {
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const dLon = toRad(lon2 - lon1);
  const p1 = toRad(lat1);
  const p2 = toRad(lat2);
  const x = Math.sin(dLon) * Math.cos(p2);
  const y =
    Math.cos(p1) * Math.sin(p2) -
    Math.sin(p1) * Math.cos(p2) * Math.cos(dLon);
  return (toDeg(Math.atan2(x, y)) + 360) % 360;
}

export function toRad(value: number): number {
  return (value * Math.PI) / 180;
}

export function toDeg(value: number): number {
  return (value * 180) / Math.PI;
}

