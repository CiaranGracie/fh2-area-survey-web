// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { parseKmlText, parseKmlTextMulti } from "./kml";

const POLYGON_KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
              151.2,-33.9,0 151.2008,-33.9,0 151.2008,-33.8992,0 151.2,-33.8992,0 151.2,-33.9,0
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
  </Document>
</kml>`;

const POINTS_KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>WP1</name>
      <description>First point</description>
      <Point><coordinates>151.2,-33.9,0</coordinates></Point>
    </Placemark>
    <Placemark>
      <name>WP2</name>
      <Point><coordinates>151.2008,-33.9,0</coordinates></Point>
    </Placemark>
    <Placemark>
      <name>WP3</name>
      <Point><coordinates>151.2004,-33.8996,0</coordinates></Point>
    </Placemark>
  </Document>
</kml>`;

const LINESTRING_KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <LineString>
        <coordinates>
          151.2,-33.9,0 151.2008,-33.9,0 151.2004,-33.8996,0
        </coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`;

const BOTH_KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
              151.2,-33.9,0 151.2008,-33.9,0 151.2008,-33.8992,0 151.2,-33.8992,0 151.2,-33.9,0
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
    <Placemark>
      <name>Station A</name>
      <Point><coordinates>151.2,-33.9,0</coordinates></Point>
    </Placemark>
  </Document>
</kml>`;

describe("parseKmlText", () => {
  it("extracts polygon coordinates", () => {
    const coords = parseKmlText(POLYGON_KML);
    expect(coords.length).toBeGreaterThanOrEqual(4);
    expect(coords[0][0]).toBeCloseTo(151.2, 4);
    expect(coords[0][1]).toBeCloseTo(-33.9, 4);
  });

  it("throws for points-only KML", () => {
    expect(() => parseKmlText(POINTS_KML)).toThrow();
  });
});

describe("parseKmlTextMulti", () => {
  it("detects polygon-only KML", () => {
    const result = parseKmlTextMulti(POLYGON_KML);
    expect(result.type).toBe("polygon");
    if (result.type === "polygon") {
      expect(result.polygon.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("detects points-only KML", () => {
    const result = parseKmlTextMulti(POINTS_KML);
    expect(result.type).toBe("points");
    if (result.type === "points") {
      expect(result.points).toHaveLength(3);
      expect(result.points[0].name).toBe("WP1");
      expect(result.points[0].description).toBe("First point");
      expect(result.points[1].name).toBe("WP2");
      expect(result.points[0].coordinates[0]).toBeCloseTo(151.2, 4);
    }
  });

  it("detects KML with both polygon and points", () => {
    const result = parseKmlTextMulti(BOTH_KML);
    expect(result.type).toBe("both");
    if (result.type === "both") {
      expect(result.polygon.length).toBeGreaterThanOrEqual(4);
      expect(result.points).toHaveLength(1);
      expect(result.points[0].name).toBe("Station A");
    }
  });

  it("converts LineString vertices to points", () => {
    const result = parseKmlTextMulti(LINESTRING_KML);
    expect(result.type).toBe("points");
    if (result.type === "points") {
      expect(result.points).toHaveLength(3);
      expect(result.points[0].name).toContain("Vertex");
    }
  });

  it("throws for empty KML", () => {
    const emptyKml = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document></Document></kml>`;
    expect(() => parseKmlTextMulti(emptyKml)).toThrow();
  });
});
