import { describe, expect, it } from "vitest";
import { CAMERAS } from "../domain/cameras";
import { generateLines } from "./grid";
import { detectEpsg, projectorForLonLat } from "./projection";
import { gsdCm, lineSpacingM, photoIntervalM } from "./math";

describe("math helpers", () => {
  const camera = CAMERAS["M4D Wide (24mm)"];

  it("computes stable gsd and spacing values", () => {
    expect(gsdCm(120, camera)).toBeCloseTo(3.247, 3);
    expect(lineSpacingM(120, 70, camera)).toBeCloseTo(51.429, 3);
    expect(photoIntervalM(120, 80, camera)).toBeCloseTo(25.714, 3);
  });

  it("detects expected epsg zones", () => {
    expect(detectEpsg(151.21, -33.86).epsg).toBe(7856);
    expect(detectEpsg(-122.42, 37.77).epsg).toBe(32610);
  });

  it("generates at least one sweep line for a small rectangle", () => {
    const polygon: [number, number][] = [
      [151.2, -33.9],
      [151.2008, -33.9],
      [151.2008, -33.8992],
      [151.2, -33.8992],
    ];
    const projector = projectorForLonLat(151.2, -33.9);
    const lines = generateLines(polygon, 0, 20, projector);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0].length).toBe(2);
  });
});

