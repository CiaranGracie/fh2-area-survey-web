import proj4 from "proj4";
import type { LonLat, XY } from "../domain/types";

export interface EpsgInfo {
  epsg: number;
  name: string;
  zone: number;
  south: boolean;
}

export interface Projector {
  info: EpsgInfo;
  forward: (point: LonLat) => XY;
  backward: (point: XY) => LonLat;
}

export function detectEpsg(lon: number, lat: number): EpsgInfo {
  if (lon >= 108 && lon < 156 && lat >= -45 && lat <= -10) {
    const zone = Math.trunc((lon - 108) / 6) + 49;
    return { epsg: 7800 + zone, name: `GDA2020 MGA Z${zone}`, zone, south: true };
  }
  const zone = Math.trunc((lon + 180) / 6) + 1;
  if (lat >= 0) {
    return { epsg: 32600 + zone, name: `UTM ${zone}N`, zone, south: false };
  }
  return { epsg: 32700 + zone, name: `UTM ${zone}S`, zone, south: true };
}

export function projectorForLonLat(lon: number, lat: number): Projector {
  const info = detectEpsg(lon, lat);
  const utmDef = info.south
    ? `+proj=utm +zone=${info.zone} +south +datum=WGS84 +units=m +no_defs`
    : `+proj=utm +zone=${info.zone} +datum=WGS84 +units=m +no_defs`;

  const forward = (point: LonLat): XY =>
    proj4("EPSG:4326", utmDef, point) as XY;
  const backward = (point: XY): LonLat =>
    proj4(utmDef, "EPSG:4326", point) as LonLat;

  return { info, forward, backward };
}

