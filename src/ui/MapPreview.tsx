import { useEffect, useRef } from "react";
import L, { Map as LeafletMap } from "leaflet";
import type { LonLat, PassLine, Waypoint } from "../domain/types";

interface MapPreviewProps {
  polygon: LonLat[] | null;
  passes: PassLine[];
  waypoints?: Waypoint[];
  selectedWaypointId?: string | null;
  onWaypointClick?: (id: string) => void;
}

const POLYGON_STYLE = { color: "#2dd4bf", weight: 2 };
const SELECTED_WP_STYLE = { radius: 8, color: "#fbbf24", fillColor: "#fbbf24", fillOpacity: 0.9, weight: 2 };
const WP_STYLE = { radius: 6, color: "#60a5fa", fillColor: "#60a5fa", fillOpacity: 0.8, weight: 1.5 };

function createArrowIcon(color: string, angle: number): L.DivIcon {
  return L.divIcon({
    html: `<svg width="12" height="12" viewBox="0 0 12 12" style="transform:rotate(${angle}deg)">
      <polygon points="6,0 12,12 6,8 0,12" fill="${color}" opacity="0.85"/>
    </svg>`,
    className: "arrow-icon",
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
}

function bearingDeg(a: LonLat, b: LonLat): number {
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const x = Math.sin(dLon) * Math.cos(lat2);
  const y = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;
}

function createNumberedIcon(index: number, selected: boolean): L.DivIcon {
  const bg = selected ? "#fbbf24" : "#60a5fa";
  const fg = selected ? "#000" : "#fff";
  return L.divIcon({
    html: `<div style="
      width:24px;height:24px;border-radius:50%;
      background:${bg};color:${fg};
      display:flex;align-items:center;justify-content:center;
      font-size:11px;font-weight:600;
      border:2px solid rgba(255,255,255,0.5);
      box-shadow:0 1px 4px rgba(0,0,0,0.4);
    ">${index + 1}</div>`,
    className: "numbered-wp-icon",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

export function MapPreview({
  polygon,
  passes,
  waypoints = [],
  selectedWaypointId,
  onWaypointClick,
}: MapPreviewProps) {
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
      const polygonLayer = L.polygon(latLngPolygon, POLYGON_STYLE).addTo(group);
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

        const mid = Math.floor(line.length / 2);
        if (mid > 0 && mid < line.length) {
          const from = line[mid - 1];
          const to = line[mid];
          const angle = bearingDeg(from, to);
          const midLat = (from[1] + to[1]) / 2;
          const midLon = (from[0] + to[0]) / 2;
          L.marker([midLat, midLon], {
            icon: createArrowIcon(pass.color, angle),
            interactive: false,
          }).addTo(group);
        }

        for (const pt of line) {
          L.circleMarker([pt[1], pt[0]], {
            radius: 2,
            color: pass.color,
            fillColor: pass.color,
            fillOpacity: 0.6,
            weight: 0,
          }).addTo(group);
        }
      });
    });

    if (waypoints.length > 0) {
      const bounds: [number, number][] = [];

      if (waypoints.length > 1) {
        const connectLine = waypoints.map((wp) => [wp.coordinates[1], wp.coordinates[0]] as [number, number]);
        L.polyline(connectLine, {
          color: "#60a5fa",
          weight: 2,
          opacity: 0.6,
          dashArray: "6 4",
        }).addTo(group);
      }

      waypoints.forEach((wp, i) => {
        const isSelected = wp.id === selectedWaypointId;
        const latLng: [number, number] = [wp.coordinates[1], wp.coordinates[0]];
        bounds.push(latLng);

        const marker = L.marker(latLng, {
          icon: createNumberedIcon(i, isSelected),
        }).addTo(group);

        marker.bindTooltip(wp.name, { direction: "top", offset: [0, -14] });

        if (onWaypointClick) {
          marker.on("click", () => onWaypointClick(wp.id));
        }
      });

      if (bounds.length > 0 && !polygon) {
        map.fitBounds(bounds, { padding: [40, 40] });
      }
    }
  }, [polygon, passes, waypoints, selectedWaypointId, onWaypointClick]);

  return <div className="map-container" ref={containerRef} />;
}
