import { CAMERAS, resolveCameraPayload } from "../domain/cameras";
import type { Waypoint, WaypointRouteParams, WaypointRouteResult } from "../domain/types";
import type { KmlPoint } from "../io/kml";
import { buildWaypointTemplateKml, buildWaypointWaylinesWpml } from "./waypointXmlBuilders";

export function createWaypointsFromPoints(
  points: KmlPoint[],
  params: WaypointRouteParams,
): Waypoint[] {
  return points.map((pt, i) => ({
    id: `wp-${i}-${Date.now()}`,
    name: pt.name,
    description: pt.description,
    coordinates: pt.coordinates,
    height: params.defaultHeight,
    speed: params.defaultSpeed,
    headingMode: params.defaultHeadingMode,
    headingAngle: 0,
    headingPathMode: params.defaultHeadingPathMode,
    poiPoint: [0, 0, 0],
    poiIndex: 0,
    turnMode: params.defaultTurnMode,
    turnDampingDist: 0.2,
    useStraightLine: true,
    payloadPositionIndex: params.payloadPositionIndex,
    gimbalPitchAngle: -90,
    gimbalYawAngle: 0,
    useGlobalHeight: true,
    useGlobalSpeed: true,
    useGlobalHeadingParam: true,
    useGlobalTurnParam: true,
    actions: [],
  }));
}

export function generateWaypointRoute(
  waypoints: Waypoint[],
  params: WaypointRouteParams,
): WaypointRouteResult {
  const camera = CAMERAS[params.cameraKey];
  if (!camera) throw new Error(`Unknown camera ${params.cameraKey}`);
  const resolvedCamera = resolveCameraPayload(camera, params.selectedPayloadKey);
  if (waypoints.length === 0) throw new Error("At least one waypoint is required.");

  const templateKml = buildWaypointTemplateKml(waypoints, params, resolvedCamera);
  const { wpml } = buildWaypointWaylinesWpml(waypoints, params, resolvedCamera);

  return {
    waypoints,
    params,
    wpml,
    templateKml,
  };
}
