import { fromArrayBuffer } from "geotiff";
import type { LonLat } from "../domain/types";

export interface DsmSampler {
  sample: (points: LonLat[]) => Promise<number[]>;
  isWgs84: boolean;
}

export async function createDsmSampler(file: File): Promise<DsmSampler> {
  const tiff = await fromArrayBuffer(await file.arrayBuffer());
  const image = await tiff.getImage();
  const [originX, originY] = image.getOrigin();
  const [resX, resY] = image.getResolution();
  const width = image.getWidth();
  const height = image.getHeight();
  const noData = image.getGDALNoData();
  const geoKeys = (image.getGeoKeys() ?? {}) as Record<string, number>;

  const isWgs84 =
    geoKeys["GeographicTypeGeoKey"] === 4326 ||
    geoKeys["GTModelTypeGeoKey"] === 2 ||
    geoKeys["ProjectedCSTypeGeoKey"] === 4326;

  const sample = async (points: LonLat[]): Promise<number[]> => {
    if (!isWgs84) {
      throw new Error(
        "This DSM is not in EPSG:4326. Reproject to WGS84 for browser mode.",
      );
    }
    const out: number[] = [];
    for (const [lon, lat] of points) {
      const px = Math.floor((lon - originX) / resX);
      const py = Math.floor((lat - originY) / resY);
      const clampedX = Math.max(0, Math.min(width - 1, px));
      const clampedY = Math.max(0, Math.min(height - 1, py));

      const rasters = await image.readRasters({
        window: [clampedX, clampedY, clampedX + 1, clampedY + 1],
        samples: [0],
        interleave: true,
      });
      const value = Number(rasters[0]);
      if (!Number.isFinite(value) || (noData !== null && value === noData)) {
        out.push(0);
      } else {
        out.push(value);
      }
    }
    return out;
  };

  return { sample, isWgs84 };
}

