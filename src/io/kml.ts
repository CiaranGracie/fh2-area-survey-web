import JSZip from "jszip";
import type { LonLat } from "../domain/types";

export interface KmlPoint {
  name: string;
  description: string;
  coordinates: LonLat;
}

export type KmlParseResult =
  | { type: "polygon"; polygon: LonLat[] }
  | { type: "points"; points: KmlPoint[] }
  | { type: "linestring"; line: LonLat[] }
  | { type: "both"; polygon: LonLat[]; points: KmlPoint[] };

function parseCoordinateText(text: string): LonLat[] {
  const coords = text
    .trim()
    .split(/\s+/)
    .map((part) => {
      const [lonText, latText] = part.split(",");
      return [Number(lonText), Number(latText)] as LonLat;
    })
    .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));

  if (coords.length < 3) {
    throw new Error("No polygon with at least 3 coordinates found.");
  }
  return coords;
}

function getChildText(el: Element, tagSuffix: string): string {
  for (const child of Array.from(el.children)) {
    if (child.tagName.toLowerCase().endsWith(tagSuffix.toLowerCase())) {
      return child.textContent?.trim() ?? "";
    }
  }
  return "";
}

function extractPointPlacemarks(doc: Document): KmlPoint[] {
  const placemarks = Array.from(doc.getElementsByTagName("Placemark"));
  const points: KmlPoint[] = [];

  for (const pm of placemarks) {
    const pointEls = pm.getElementsByTagName("Point");
    if (pointEls.length === 0) continue;

    const coordEl = pointEls[0].getElementsByTagName("coordinates")[0];
    if (!coordEl?.textContent) continue;

    const parts = coordEl.textContent.trim().split(",");
    const lon = Number(parts[0]);
    const lat = Number(parts[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;

    const name = getChildText(pm, "name") || `Point ${points.length + 1}`;
    const description = getChildText(pm, "description");

    points.push({ name, description, coordinates: [lon, lat] });
  }
  return points;
}

function isInsideElement(node: Element, tagName: string): boolean {
  let el: Element | null = node;
  while (el) {
    if (el.tagName === tagName) return true;
    el = el.parentElement;
  }
  return false;
}

function extractPolygonCoordinates(doc: Document): LonLat[] | null {
  const coordNodes = Array.from(doc.getElementsByTagName("coordinates"));
  for (const node of coordNodes) {
    if (!isInsideElement(node, "Polygon") && !isInsideElement(node, "LinearRing")) {
      continue;
    }
    try {
      const coords = parseCoordinateText(node.textContent ?? "");
      if (coords.length >= 3) return coords;
    } catch {
      continue;
    }
  }

  for (const node of coordNodes) {
    if (isInsideElement(node, "LineString") || isInsideElement(node, "Point")) {
      continue;
    }
    if (node.textContent?.trim()) {
      try {
        const coords = parseCoordinateText(node.textContent);
        if (coords.length >= 3) return coords;
      } catch {
        continue;
      }
    }
  }
  return null;
}

function extractLineStringVertices(doc: Document): KmlPoint[] {
  const lineStrings = Array.from(doc.getElementsByTagName("LineString"));
  const points: KmlPoint[] = [];
  for (const ls of lineStrings) {
    const coordEl = ls.getElementsByTagName("coordinates")[0];
    if (!coordEl?.textContent) continue;
    const vertices = coordEl.textContent
      .trim()
      .split(/\s+/)
      .map((part) => {
        const [lonStr, latStr] = part.split(",");
        return [Number(lonStr), Number(latStr)] as LonLat;
      })
      .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));

    for (let i = 0; i < vertices.length; i++) {
      points.push({
        name: `Vertex ${points.length + 1}`,
        description: "",
        coordinates: vertices[i],
      });
    }
  }
  return points;
}

function extractLineString(doc: Document): LonLat[] | null {
  const lineStrings = Array.from(doc.getElementsByTagName("LineString"));
  for (const ls of lineStrings) {
    const coordEl = ls.getElementsByTagName("coordinates")[0];
    if (!coordEl?.textContent) continue;
    const vertices = coordEl.textContent
      .trim()
      .split(/\s+/)
      .map((part) => {
        const [lonStr, latStr] = part.split(",");
        return [Number(lonStr), Number(latStr)] as LonLat;
      })
      .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));
    if (vertices.length >= 2) return vertices;
  }
  return null;
}

export function parseKmlTextMulti(kmlText: string): KmlParseResult {
  const doc = new DOMParser().parseFromString(kmlText, "application/xml");
  const parserError = doc.querySelector("parsererror");
  if (parserError) throw new Error("Invalid KML XML.");

  const polygon = extractPolygonCoordinates(doc);
  const line = extractLineString(doc);
  let points = extractPointPlacemarks(doc);

  if (points.length === 0 && !line) {
    points = extractLineStringVertices(doc);
  }

  if (polygon && points.length > 0) {
    return { type: "both", polygon, points };
  }
  if (polygon) {
    return { type: "polygon", polygon };
  }
  if (line) {
    return { type: "linestring", line };
  }
  if (points.length > 0) {
    return { type: "points", points };
  }
  throw new Error("No polygon or point features found in KML/KMZ.");
}

export function parseKmlText(kmlText: string): LonLat[] {
  const result = parseKmlTextMulti(kmlText);
  if (result.type === "points") {
    throw new Error("KML contains points but no polygon. Use Waypoint Route mode.");
  }
  if (result.type === "linestring") {
    throw new Error("KML contains a line but no polygon. Use Mapping Strip mode.");
  }
  return result.type === "polygon" ? result.polygon : result.polygon;
}

async function readKmlTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".kml")) {
    return file.text();
  }
  if (name.endsWith(".kmz")) {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const kmlEntry = Object.values(zip.files).find((entry) =>
      entry.name.toLowerCase().endsWith(".kml"),
    );
    if (!kmlEntry) throw new Error("KMZ does not contain a KML file.");
    return kmlEntry.async("string");
  }
  throw new Error("Unsupported file type. Use .kml or .kmz");
}

export async function parseKmlOrKmzFile(file: File): Promise<LonLat[]> {
  const text = await readKmlTextFromFile(file);
  return parseKmlText(text);
}

export async function parseKmlOrKmzFileMulti(file: File): Promise<KmlParseResult> {
  const text = await readKmlTextFromFile(file);
  return parseKmlTextMulti(text);
}
