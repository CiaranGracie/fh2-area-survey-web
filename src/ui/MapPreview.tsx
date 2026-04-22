import { useEffect, useRef } from "react";
import L, { Map as LeafletMap } from "leaflet";
import type { LonLat, PassLine } from "../domain/types";

interface MapPreviewProps {
  polygon: LonLat[] | null;
  passes: PassLine[];
}

const PASS_STYLES = {
  polygon: { color: "#2dd4bf", weight: 2 },
};

export function MapPreview({ polygon, passes }: MapPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: true,
      center: [0, 0],
      zoom: 2,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = group;
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    if (polygon && polygon.length >= 3) {
      const latLngPolygon = polygon.map(([lon, lat]) => [lat, lon] as [number, number]);
      const polygonLayer = L.polygon(latLngPolygon, PASS_STYLES.polygon).addTo(group);
      map.fitBounds(polygonLayer.getBounds(), { padding: [24, 24] });
    }

    passes.forEach((pass) => {
      pass.lines.forEach((line) => {
        if (line.length < 2) return;
        const latLngLine = line.map(([lon, lat]) => [lat, lon] as [number, number]);
        L.polyline(latLngLine, {
          color: pass.color,
          weight: 2,
          opacity: 0.9,
        }).addTo(group);
      });
    });
  }, [polygon, passes]);

  return <div className="map-container" ref={containerRef} />;
}

