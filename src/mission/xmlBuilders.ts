import type { Camera, LonLat, LonLatAlt, SurveyParams } from "../domain/types";
import { headingDeg, haversineDistanceM } from "../geo/math";

function polygonCoordinateString(poly: LonLat[]): string {
  return poly
    .map(([lon, lat]) => `                ${lon.toFixed(12)},${lat.toFixed(12)},0`)
    .join("\n");
}

function waypointXml(
  index: number,
  waypoint: LonLatAlt,
  speedMps: number,
  heading: number,
): string {
  const [lon, lat, height] = waypoint;
  return `      <Placemark>
        <Point><coordinates>${lon.toFixed(12)},${lat.toFixed(12)}</coordinates></Point>
        <wpml:index>${index}</wpml:index>
        <wpml:executeHeight>${height.toFixed(3)}</wpml:executeHeight>
        <wpml:waypointSpeed>${speedMps}</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngle>${heading.toFixed(4)}</wpml:waypointHeadingAngle>
          <wpml:waypointHeadingPathMode>followBadArc</wpml:waypointHeadingPathMode>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam>
          <wpml:waypointTurnMode>coordinateTurn</wpml:waypointTurnMode>
          <wpml:waypointTurnDampingDist>10</wpml:waypointTurnDampingDist>
        </wpml:waypointTurnParam>
        <wpml:useStraightLine>1</wpml:useStraightLine>
      </Placemark>`;
}

function waylineFolderXml(
  waylineId: number,
  waypoints: LonLatAlt[],
  speedMps: number,
): { xml: string; distanceM: number } {
  let distanceM = 0;
  const waypointXmlChunks: string[] = [];
  for (let i = 0; i < waypoints.length; i += 1) {
    const current = waypoints[i];
    const next = waypoints[i + 1] ?? waypoints[i - 1];
    const heading = next
      ? headingDeg([current[0], current[1]], [next[0], next[1]])
      : 0;
    if (i < waypoints.length - 1) {
      distanceM += haversineDistanceM(
        [current[0], current[1]],
        [waypoints[i + 1][0], waypoints[i + 1][1]],
      );
    }
    waypointXmlChunks.push(waypointXml(i, current, speedMps, heading));
  }

  const xml = `    <Folder>
      <wpml:templateId>0</wpml:templateId>
      <wpml:executeHeightMode>WGS84</wpml:executeHeightMode>
      <wpml:waylineId>${waylineId}</wpml:waylineId>
      <wpml:distance>${distanceM.toFixed(6)}</wpml:distance>
      <wpml:duration>${(distanceM / speedMps).toFixed(6)}</wpml:duration>
      <wpml:autoFlightSpeed>${speedMps}</wpml:autoFlightSpeed>
${waypointXmlChunks.join("\n")}
    </Folder>`;
  return { xml, distanceM };
}

export function buildTemplateKml(
  polygon: LonLat[],
  params: SurveyParams,
  camera: Camera,
): string {
  const now = Date.now();
  const heightModeMap: Record<SurveyParams["heightMode"], string> = {
    ALT: "relativeToStartPoint",
    ASL: "EGM96",
    AGL: params.realTimeTerrainFollow ? "realTimeFollowSurface" : "EGM96",
  };
  const rerouteMode = params.obstacleBypass ? 1 : 0;
  const geozoneMode = params.geozoneBypass ? 1 : 0;
  const quickOrthoEnabled = params.collectionMode === "ortho" && params.smartOblique;
  const smartObliqueEnabled = params.collectionMode === "oblique" && params.smartOblique;
  const aglSurfaceFollow =
    params.heightMode === "AGL"
      ? `
        <wpml:surfaceFollowModeEnable>1</wpml:surfaceFollowModeEnable>
        <wpml:isRealtimeSurfaceFollow>${params.realTimeTerrainFollow ? 1 : 0}</wpml:isRealtimeSurfaceFollow>
        <wpml:surfaceRelativeHeight>${params.altitudeM}</wpml:surfaceRelativeHeight>`
      : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.dji.com/wpmz/1.0.6">
  <Document>
    <wpml:author>RocketDNA Survey Generator (Web)</wpml:author>
    <wpml:createTime>${now}</wpml:createTime>
    <wpml:updateTime>${now}</wpml:updateTime>
    <wpml:missionConfig>
      <wpml:flyToWaylineMode>pointToPoint</wpml:flyToWaylineMode>
      <wpml:finishAction>${params.finishAction}</wpml:finishAction>
      <wpml:exitOnRCLost>goContinue</wpml:exitOnRCLost>
      <wpml:executeRCLostAction>goBack</wpml:executeRCLostAction>
      <wpml:takeOffSecurityHeight>${params.takeoffHeightM}</wpml:takeOffSecurityHeight>
      <wpml:globalTransitionalSpeed>${params.transitSpeedMps}</wpml:globalTransitionalSpeed>
      <wpml:globalRTHHeight>${params.rthHeightM}</wpml:globalRTHHeight>
      <wpml:autoRerouteInfo>
        <wpml:transitionalAutoRerouteMode>${rerouteMode}</wpml:transitionalAutoRerouteMode>
        <wpml:missionAutoRerouteMode>${rerouteMode}</wpml:missionAutoRerouteMode>
      </wpml:autoRerouteInfo>
      <wpml:waylineAvoidLimitAreaMode>${geozoneMode}</wpml:waylineAvoidLimitAreaMode>
      <wpml:droneInfo>
        <wpml:droneEnumValue>${camera.droneEnum}</wpml:droneEnumValue>
        <wpml:droneSubEnumValue>${camera.droneSubEnum}</wpml:droneSubEnumValue>
      </wpml:droneInfo>
      <wpml:payloadInfo>
        <wpml:payloadEnumValue>${camera.payloadEnum}</wpml:payloadEnumValue>
        <wpml:payloadSubEnumValue>${camera.payloadSubEnum}</wpml:payloadSubEnumValue>
        <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
      </wpml:payloadInfo>
    </wpml:missionConfig>
    <Folder>
      <wpml:templateType>mapping2d</wpml:templateType>
      <wpml:templateId>0</wpml:templateId>
      <wpml:waylineCoordinateSysParam>
        <wpml:coordinateMode>WGS84</wpml:coordinateMode>
        <wpml:heightMode>${heightModeMap[params.heightMode]}</wpml:heightMode>
        <wpml:globalShootHeight>${params.altitudeM}</wpml:globalShootHeight>
${aglSurfaceFollow}
      </wpml:waylineCoordinateSysParam>
      <wpml:autoFlightSpeed>${params.speedMps}</wpml:autoFlightSpeed>
      <Placemark>
        <wpml:elevationOptimizeEnable>${params.elevationOptimize ? 1 : 0}</wpml:elevationOptimizeEnable>
        <wpml:smartObliqueEnable>${smartObliqueEnabled ? 1 : 0}</wpml:smartObliqueEnable>
        <wpml:quickOrthoMappingEnable>${quickOrthoEnabled ? 1 : 0}</wpml:quickOrthoMappingEnable>
        ${quickOrthoEnabled ? `<wpml:quickOrthoMappingPitch>${params.smartObliquePitch}</wpml:quickOrthoMappingPitch>` : ""}
        ${smartObliqueEnabled ? `<wpml:smartObliqueGimbalPitch>${params.obliquePitch}</wpml:smartObliqueGimbalPitch>` : ""}
        <wpml:shootType>${params.shootType}</wpml:shootType>
        <wpml:direction>${params.courseDeg}</wpml:direction>
        <wpml:margin>${params.marginM}</wpml:margin>
        <wpml:overlap>
          <wpml:orthoCameraOverlapH>${params.forwardOverlapPct}</wpml:orthoCameraOverlapH>
          <wpml:orthoCameraOverlapW>${params.sideOverlapPct}</wpml:orthoCameraOverlapW>
          <wpml:inclinedCameraOverlapH>${params.forwardOverlapPct}</wpml:inclinedCameraOverlapH>
          <wpml:inclinedCameraOverlapW>${params.sideOverlapPct}</wpml:inclinedCameraOverlapW>
        </wpml:overlap>
        <Polygon><outerBoundaryIs><LinearRing><coordinates>
${polygonCoordinateString(polygon)}
        </coordinates></LinearRing></outerBoundaryIs></Polygon>
      </Placemark>
    </Folder>
  </Document>
</kml>`;
}

export function buildWaylinesWpml(
  flattenedWaylines: LonLatAlt[][],
  params: SurveyParams,
  camera: Camera,
): { wpml: string; totalDistanceM: number } {
  const folders: string[] = [];
  let totalDistanceM = 0;
  flattenedWaylines.forEach((waypoints, idx) => {
    const built = waylineFolderXml(idx, waypoints, params.speedMps);
    folders.push(built.xml);
    totalDistanceM += built.distanceM;
  });
  const rerouteMode = params.obstacleBypass ? 1 : 0;
  const geozoneMode = params.geozoneBypass ? 1 : 0;

  const wpml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.dji.com/wpmz/1.0.6">
  <Document>
    <wpml:missionConfig>
      <wpml:flyToWaylineMode>pointToPoint</wpml:flyToWaylineMode>
      <wpml:finishAction>${params.finishAction}</wpml:finishAction>
      <wpml:exitOnRCLost>goContinue</wpml:exitOnRCLost>
      <wpml:executeRCLostAction>goBack</wpml:executeRCLostAction>
      <wpml:takeOffSecurityHeight>${params.takeoffHeightM}</wpml:takeOffSecurityHeight>
      <wpml:globalTransitionalSpeed>${params.transitSpeedMps}</wpml:globalTransitionalSpeed>
      <wpml:globalRTHHeight>${params.rthHeightM}</wpml:globalRTHHeight>
      <wpml:autoRerouteInfo>
        <wpml:transitionalAutoRerouteMode>${rerouteMode}</wpml:transitionalAutoRerouteMode>
        <wpml:missionAutoRerouteMode>${rerouteMode}</wpml:missionAutoRerouteMode>
      </wpml:autoRerouteInfo>
      <wpml:waylineAvoidLimitAreaMode>${geozoneMode}</wpml:waylineAvoidLimitAreaMode>
      <wpml:droneInfo>
        <wpml:droneEnumValue>${camera.droneEnum}</wpml:droneEnumValue>
        <wpml:droneSubEnumValue>${camera.droneSubEnum}</wpml:droneSubEnumValue>
      </wpml:droneInfo>
      <wpml:payloadInfo>
        <wpml:payloadEnumValue>${camera.payloadEnum}</wpml:payloadEnumValue>
        <wpml:payloadSubEnumValue>${camera.payloadSubEnum}</wpml:payloadSubEnumValue>
        <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
      </wpml:payloadInfo>
    </wpml:missionConfig>
${folders.join("\n")}
  </Document>
</kml>`;

  return { wpml, totalDistanceM };
}

