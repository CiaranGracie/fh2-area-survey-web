import JSZip from "jszip";
import type { LonLat } from "../domain/types";

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

export function parseKmlText(kmlText: string): LonLat[] {
  const doc = new DOMParser().parseFromString(kmlText, "application/xml");
  const parserError = doc.querySelector("parsererror");
  if (parserError) throw new Error("Invalid KML XML.");

  const coordinatesNodes = Array.from(doc.getElementsByTagName("*")).filter(
    (node) => node.tagName.toLowerCase().endsWith("coordinates"),
  );

  for (const node of coordinatesNodes) {
    if (node.textContent && node.textContent.trim()) {
      const parsed = parseCoordinateText(node.textContent);
      if (parsed.length >= 3) return parsed;
    }
  }
  throw new Error("No polygon coordinates found in KML/KMZ.");
}

export async function parseKmlOrKmzFile(file: File): Promise<LonLat[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".kml")) {
    return parseKmlText(await file.text());
  }
  if (name.endsWith(".kmz")) {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const kmlEntry = Object.values(zip.files).find((entry) =>
      entry.name.toLowerCase().endsWith(".kml"),
    );
    if (!kmlEntry) throw new Error("KMZ does not contain a KML file.");
    const text = await kmlEntry.async("string");
    return parseKmlText(text);
  }
  throw new Error("Unsupported file type. Use .kml or .kmz");
}

