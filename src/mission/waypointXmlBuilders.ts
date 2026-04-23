import type { Camera, Waypoint, WaypointAction, WaypointRouteParams } from "../domain/types";
import { buildMissionConfigXml } from "./missionConfig";

const KML_HEADER = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.dji.com/wpmz/1.0.6">
  <Document>`;
const KML_FOOTER = `  </Document>
</kml>`;

function heightModeToXml(mode: WaypointRouteParams["heightMode"]): string {
  return mode;
}

function actionParamXml(params: Record<string, string | number | boolean | undefined>, indent: string): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    lines.push(`${indent}<wpml:${key}>${value}</wpml:${key}>`);
  }
  return lines.join("\n");
}

function generateUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ---------------------------------------------------------------------------
// template.kml for waypoint routes
// ---------------------------------------------------------------------------

function buildActionGroupsForWaypoint(
  wp: Waypoint,
  wpIndex: number,
  agIdCounter: { value: number },
): string {
  const reachPointActions: WaypointAction[] = [];
  const intervalActions: WaypointAction[] = [];

  for (const action of wp.actions) {
    if (action.type === "endIntervalShot" || action.type === "recordCurrentAttitude") {
      continue;
    }
    if (action.triggerType === "multipleTiming" || action.triggerType === "multipleDistance") {
      intervalActions.push(action);
    } else {
      reachPointActions.push(action);
    }
  }

  const agChunks: string[] = [];

  if (reachPointActions.length > 0) {
    const actionXmls: string[] = [];
    let actionId = 0;
    for (const action of reachPointActions) {
      const expanded = expandAction(action);
      for (const ea of expanded) {
        actionXmls.push(buildActionXml(actionId++, ea.actuatorFunc, ea.params));
      }
    }
    agChunks.push(buildActionGroupXml(agIdCounter.value++, wpIndex, "reachPoint", undefined, actionXmls));
  }

  for (const action of intervalActions) {
    const expanded = expandAction(action);
    const actionXmls: string[] = [];
    let actionId = 0;
    for (const ea of expanded) {
      actionXmls.push(buildActionXml(actionId++, ea.actuatorFunc, ea.params));
    }
    agChunks.push(buildActionGroupXml(
      agIdCounter.value++,
      wpIndex,
      action.triggerType!,
      action.triggerParam,
      actionXmls,
    ));
  }

  return agChunks.length > 0 ? agChunks.join("\n") + "\n" : "";
}

function waypointPlacemarkTemplateXml(wp: Waypoint, index: number, actionGroupsXml: string): string {
  const useGlobalLines: string[] = [];
  if (wp.useGlobalHeight) {
    useGlobalLines.push(`        <wpml:useGlobalHeight>1</wpml:useGlobalHeight>`);
  }
  if (wp.useGlobalSpeed) {
    useGlobalLines.push(`        <wpml:useGlobalSpeed>1</wpml:useGlobalSpeed>`);
  }
  if (wp.useGlobalHeadingParam) {
    useGlobalLines.push(`        <wpml:useGlobalHeadingParam>1</wpml:useGlobalHeadingParam>`);
  }
  if (wp.useGlobalTurnParam) {
    useGlobalLines.push(`        <wpml:useGlobalTurnParam>1</wpml:useGlobalTurnParam>`);
  }

  return `      <Placemark>
        <Point>
          <coordinates>${wp.coordinates[0].toFixed(12)},${wp.coordinates[1].toFixed(12)}</coordinates>
        </Point>
        <wpml:index>${index}</wpml:index>
        <wpml:ellipsoidHeight>${wp.height.toFixed(3)}</wpml:ellipsoidHeight>
        <wpml:height>${wp.height.toFixed(3)}</wpml:height>
        <wpml:waypointSpeed>${wp.speed}</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>${wp.headingMode}</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngle>${wp.headingAngle}</wpml:waypointHeadingAngle>
          <wpml:waypointPoiPoint>0.000000,0.000000,0.000000</wpml:waypointPoiPoint>
          <wpml:waypointHeadingPathMode>followBadArc</wpml:waypointHeadingPathMode>
          <wpml:waypointHeadingPoiIndex>0</wpml:waypointHeadingPoiIndex>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam>
          <wpml:waypointTurnMode>${wp.turnMode}</wpml:waypointTurnMode>
          <wpml:waypointTurnDampingDist>${wp.turnDampingDist}</wpml:waypointTurnDampingDist>
        </wpml:waypointTurnParam>
${useGlobalLines.join("\n")}
        <wpml:useStraightLine>${wp.useStraightLine ? 1 : 0}</wpml:useStraightLine>
${actionGroupsXml}        <wpml:isRisky>0</wpml:isRisky>
      </Placemark>`;
}

export function buildWaypointTemplateKml(
  waypoints: Waypoint[],
  params: WaypointRouteParams,
  camera: Camera,
): string {
  const now = Date.now();
  const templateAgIdCounter = { value: 0 };
  const placemarks = waypoints.map((wp, i) => {
    const agXml = buildActionGroupsForWaypoint(wp, i, templateAgIdCounter);
    return waypointPlacemarkTemplateXml(wp, i, agXml);
  }).join("\n");

  return `${KML_HEADER}
    <wpml:author>RocketDNA Survey Generator (Web)</wpml:author>
    <wpml:createTime>${now}</wpml:createTime>
    <wpml:updateTime>${now}</wpml:updateTime>
${buildMissionConfigXml(params, camera)}
    <Folder>
      <wpml:templateType>waypoint</wpml:templateType>
      <wpml:templateId>0</wpml:templateId>
      <wpml:waylineCoordinateSysParam>
        <wpml:coordinateMode>WGS84</wpml:coordinateMode>
        <wpml:heightMode>${heightModeToXml(params.heightMode)}</wpml:heightMode>
      </wpml:waylineCoordinateSysParam>
      <wpml:autoFlightSpeed>${params.defaultSpeed}</wpml:autoFlightSpeed>
      <wpml:globalHeight>${params.defaultHeight}</wpml:globalHeight>
      <wpml:caliFlightEnable>0</wpml:caliFlightEnable>
      <wpml:gimbalPitchMode>manual</wpml:gimbalPitchMode>
      <wpml:globalWaypointHeadingParam>
        <wpml:waypointHeadingMode>${params.defaultHeadingMode}</wpml:waypointHeadingMode>
        <wpml:waypointHeadingAngle>0</wpml:waypointHeadingAngle>
        <wpml:waypointPoiPoint>0.000000,0.000000,0.000000</wpml:waypointPoiPoint>
        <wpml:waypointHeadingPathMode>followBadArc</wpml:waypointHeadingPathMode>
        <wpml:waypointHeadingPoiIndex>0</wpml:waypointHeadingPoiIndex>
      </wpml:globalWaypointHeadingParam>
      <wpml:globalWaypointTurnMode>${params.defaultTurnMode}</wpml:globalWaypointTurnMode>
      <wpml:globalUseStraightLine>1</wpml:globalUseStraightLine>
${placemarks}
      <wpml:payloadParam>
        <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
        <wpml:imageFormat>${camera.imageFormat}</wpml:imageFormat>
        <wpml:dewarpingEnable>0</wpml:dewarpingEnable>
        <wpml:returnMode>singleReturnFirst</wpml:returnMode>
        <wpml:samplingRate>0</wpml:samplingRate>
        <wpml:scanningMode>repetitive</wpml:scanningMode>
        <wpml:modelColoringEnable>0</wpml:modelColoringEnable>
      </wpml:payloadParam>
    </Folder>
${KML_FOOTER}`;
}

// ---------------------------------------------------------------------------
// waylines.wpml for waypoint routes — action XML helpers
// ---------------------------------------------------------------------------

function getXmlActuatorFunc(action: WaypointAction): string {
  if (action.type === "timedIntervalShot" || action.type === "distanceIntervalShot") {
    return "takePhoto";
  }
  if (action.type === "recordCurrentAttitude") {
    return "recordCurrentAttitude";
  }
  return action.type;
}

function getXmlParams(action: WaypointAction): Record<string, string | number | boolean | undefined> {
  const params = { ...action.params } as Record<string, string | number | boolean | undefined>;

  if (action.type === "orientedShoot") {
    if (!params.actionUUID) params.actionUUID = generateUuid();
    if (!params.orientedFilePath) params.orientedFilePath = generateUuid();
    if (params.orientedFileMD5 === undefined) params.orientedFileMD5 = "";
    if (params.orientedFileSize === undefined) params.orientedFileSize = 0;
  }

  if (action.type === "panoShot") {
    if (!params.actionUUID) params.actionUUID = generateUuid();
  }

  return params;
}

interface ExpandedAction {
  actuatorFunc: string;
  params: Record<string, string | number | boolean | undefined>;
}

function expandAction(action: WaypointAction): ExpandedAction[] {
  const lens = action.params.payloadLensIndex;
  const func = getXmlActuatorFunc(action);
  const baseParams = getXmlParams(action);

  if (lens === "both") {
    const visParams = { ...baseParams, payloadLensIndex: "visable", useGlobalPayloadLensIndex: 0 };
    const irParams = { ...baseParams, payloadLensIndex: "ir", useGlobalPayloadLensIndex: 0 };
    return [
      { actuatorFunc: func, params: visParams },
      { actuatorFunc: func, params: irParams },
    ];
  }

  return [{ actuatorFunc: func, params: baseParams }];
}

function buildActionXml(actionId: number, actuatorFunc: string, params: Record<string, string | number | boolean | undefined>): string {
  return `          <wpml:action>
            <wpml:actionId>${actionId}</wpml:actionId>
            <wpml:actionActuatorFunc>${actuatorFunc}</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
${actionParamXml(params, "              ")}
            </wpml:actionActuatorFuncParam>
          </wpml:action>`;
}

function buildActionGroupXml(
  agId: number,
  wpIndex: number,
  triggerType: string,
  triggerParam: number | undefined,
  actionsXml: string[],
): string {
  const triggerParamTag = triggerParam != null
    ? `\n            <wpml:actionTriggerParam>${triggerParam}</wpml:actionTriggerParam>`
    : "";
  return `        <wpml:actionGroup>
          <wpml:actionGroupId>${agId}</wpml:actionGroupId>
          <wpml:actionGroupStartIndex>${wpIndex}</wpml:actionGroupStartIndex>
          <wpml:actionGroupEndIndex>${wpIndex}</wpml:actionGroupEndIndex>
          <wpml:actionGroupMode>sequence</wpml:actionGroupMode>
          <wpml:actionTrigger>
            <wpml:actionTriggerType>${triggerType}</wpml:actionTriggerType>${triggerParamTag}
          </wpml:actionTrigger>
${actionsXml.join("\n")}
        </wpml:actionGroup>`;
}

// ---------------------------------------------------------------------------
// waylines.wpml for waypoint routes — public API
// ---------------------------------------------------------------------------

function waypointPlacemarkWpmlXml(
  wp: Waypoint,
  index: number,
  actionGroups: string,
): string {
  return `      <Placemark>
        <Point><coordinates>${wp.coordinates[0].toFixed(12)},${wp.coordinates[1].toFixed(12)}</coordinates></Point>
        <wpml:index>${index}</wpml:index>
        <wpml:executeHeight>${wp.height.toFixed(3)}</wpml:executeHeight>
        <wpml:waypointSpeed>${wp.speed}</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>${wp.headingMode}</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngle>${wp.headingAngle}</wpml:waypointHeadingAngle>
          <wpml:waypointPoiPoint>0.000000,0.000000,0.000000</wpml:waypointPoiPoint>
          <wpml:waypointHeadingPathMode>followBadArc</wpml:waypointHeadingPathMode>
          <wpml:waypointHeadingPoiIndex>0</wpml:waypointHeadingPoiIndex>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam>
          <wpml:waypointTurnMode>${wp.turnMode}</wpml:waypointTurnMode>
          <wpml:waypointTurnDampingDist>${wp.turnDampingDist}</wpml:waypointTurnDampingDist>
        </wpml:waypointTurnParam>
        <wpml:useStraightLine>${wp.useStraightLine ? 1 : 0}</wpml:useStraightLine>
${actionGroups}      </Placemark>`;
}

export function buildWaypointWaylinesWpml(
  waypoints: Waypoint[],
  params: WaypointRouteParams,
  camera: Camera,
): { wpml: string; totalDistanceM: number } {
  const wpmlAgIdCounter = { value: 0 };
  let totalDistanceM = 0;

  const wpXmlChunks: string[] = [];

  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i];
    if (i < waypoints.length - 1) {
      const next = waypoints[i + 1];
      const dlat = next.coordinates[1] - wp.coordinates[1];
      const dlon = next.coordinates[0] - wp.coordinates[0];
      const latRad = (wp.coordinates[1] * Math.PI) / 180;
      const dx = dlon * (Math.PI / 180) * 6371000 * Math.cos(latRad);
      const dy = dlat * (Math.PI / 180) * 6371000;
      totalDistanceM += Math.hypot(dx, dy);
    }

    const agXml = buildActionGroupsForWaypoint(wp, i, wpmlAgIdCounter);
    wpXmlChunks.push(waypointPlacemarkWpmlXml(wp, i, agXml));
  }

  const speed = params.defaultSpeed;

  const wpml = `${KML_HEADER}
${buildMissionConfigXml(params, camera)}
    <Folder>
      <wpml:templateId>0</wpml:templateId>
      <wpml:executeHeightMode>WGS84</wpml:executeHeightMode>
      <wpml:waylineId>0</wpml:waylineId>
      <wpml:distance>${totalDistanceM.toFixed(6)}</wpml:distance>
      <wpml:duration>${(totalDistanceM / speed).toFixed(6)}</wpml:duration>
      <wpml:autoFlightSpeed>${speed}</wpml:autoFlightSpeed>
${wpXmlChunks.join("\n")}
    </Folder>
${KML_FOOTER}`;

  return { wpml, totalDistanceM };
}
