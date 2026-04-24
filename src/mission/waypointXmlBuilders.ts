import type { Camera, Waypoint, WaypointAction, WaypointHeadingMode, WaypointRouteParams } from "../domain/types";
import { buildMissionConfigXml } from "./missionConfig";

const KML_HEADER = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.dji.com/wpmz/1.0.6">
  <Document>`;
const KML_FOOTER = `  </Document>
</kml>`;

const CONTINUITY_TURNS = new Set([
  "toPointAndStopWithContinuityCurvature",
  "toPointAndPassWithContinuityCurvature",
]);

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

function toPoiPointString(poi: [number, number, number] | undefined): string {
  if (!poi) return "0.000000,0.000000,0.000000";
  return `${poi[0].toFixed(6)},${poi[1].toFixed(6)},0.000000`;
}

function waypointHeadingParamXml(
  headingMode: WaypointHeadingMode,
  headingAngle: number,
  headingPathMode: string,
  poiPoint: [number, number, number],
  poiIndex: number,
  indent: string,
): string {
  const lines: string[] = [
    `${indent}<wpml:waypointHeadingMode>${headingMode}</wpml:waypointHeadingMode>`,
    `${indent}<wpml:waypointHeadingPathMode>${headingPathMode}</wpml:waypointHeadingPathMode>`,
  ];
  if (headingMode === "fixed" || headingMode === "smoothTransition" || headingMode === "manually") {
    lines.push(`${indent}<wpml:waypointHeadingAngle>${headingAngle}</wpml:waypointHeadingAngle>`);
  } else {
    lines.push(`${indent}<wpml:waypointHeadingAngle>0</wpml:waypointHeadingAngle>`);
  }
  if (headingMode === "towardPOI") {
    lines.push(`${indent}<wpml:waypointPoiPoint>${toPoiPointString(poiPoint)}</wpml:waypointPoiPoint>`);
    lines.push(`${indent}<wpml:waypointHeadingPoiIndex>${poiIndex}</wpml:waypointHeadingPoiIndex>`);
  } else {
    lines.push(`${indent}<wpml:waypointPoiPoint>0.000000,0.000000,0.000000</wpml:waypointPoiPoint>`);
    lines.push(`${indent}<wpml:waypointHeadingPoiIndex>0</wpml:waypointHeadingPoiIndex>`);
  }
  return lines.join("\n");
}

function mapHeightModeToTemplateHeightMode(mode: WaypointRouteParams["heightMode"]): string {
  if (mode === "aboveGroundLevel") return "EGM96";
  return mode;
}

export function mapHeightModeToExecuteMode(mode: WaypointRouteParams["heightMode"]): string {
  switch (mode) {
    case "relativeToStartPoint":
      return "relativeToStartPoint";
    case "realTimeFollowSurface":
      return "realTimeFollowSurface";
    case "EGM96":
    case "aboveGroundLevel":
    default:
      return "WGS84";
  }
}

function getXmlActuatorFunc(action: WaypointAction): string {
  if (action.type === "timedIntervalShot" || action.type === "distanceIntervalShot") {
    return "takePhoto";
  }
  if (action.type === "gimbalEvenlyRotate") return "gimbalEvenlyRotate";
  if (action.type === "accurateShoot") return "orientedShoot";
  return action.type;
}

function getXmlParams(action: WaypointAction): Record<string, string | number | boolean | undefined> {
  const params = { ...action.params } as Record<string, string | number | boolean | undefined>;
  if (action.type === "orientedShoot" || action.type === "accurateShoot") {
    if (!params.actionUUID) params.actionUUID = generateUuid();
    if (!params.orientedFilePath) params.orientedFilePath = generateUuid();
    if (params.orientedFileMD5 === undefined) params.orientedFileMD5 = "";
    if (params.orientedFileSize === undefined) params.orientedFileSize = 0;
  }
  if (action.type === "panoShot" && !params.actionUUID) {
    params.actionUUID = generateUuid();
  }
  if (action.type === "recordPointCloud" && params.operation === undefined) {
    params.operation = "startRecord";
  }
  return params;
}

interface ExpandedAction {
  actuatorFunc: string;
  params: Record<string, string | number | boolean | undefined>;
}

function expandAction(action: WaypointAction): ExpandedAction[] {
  const lens = action.params.payloadLensIndex;
  const actuatorFunc = getXmlActuatorFunc(action);
  const baseParams = getXmlParams(action);
  if (lens === "both") {
    return [
      {
        actuatorFunc,
        params: { ...baseParams, payloadLensIndex: "visable", useGlobalPayloadLensIndex: 0 },
      },
      {
        actuatorFunc,
        params: { ...baseParams, payloadLensIndex: "ir", useGlobalPayloadLensIndex: 0 },
      },
    ];
  }
  return [{ actuatorFunc, params: baseParams }];
}

function buildActionXml(
  actionId: number,
  actuatorFunc: string,
  params: Record<string, string | number | boolean | undefined>,
): string {
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
  startIndex: number,
  endIndex: number,
  triggerType: string,
  triggerParam: number | undefined,
  actionsXml: string[],
): string {
  const triggerParamTag = triggerParam != null
    ? `\n            <wpml:actionTriggerParam>${triggerParam}</wpml:actionTriggerParam>`
    : "";
  return `        <wpml:actionGroup>
          <wpml:actionGroupId>${agId}</wpml:actionGroupId>
          <wpml:actionGroupStartIndex>${startIndex}</wpml:actionGroupStartIndex>
          <wpml:actionGroupEndIndex>${endIndex}</wpml:actionGroupEndIndex>
          <wpml:actionGroupMode>sequence</wpml:actionGroupMode>
          <wpml:actionTrigger>
            <wpml:actionTriggerType>${triggerType}</wpml:actionTriggerType>${triggerParamTag}
          </wpml:actionTrigger>
${actionsXml.join("\n")}
        </wpml:actionGroup>`;
}

function buildActionGroupsForWaypoint(
  wp: Waypoint,
  wpIndex: number,
  agIdCounter: { value: number },
): string {
  const groups: { triggerType: string; triggerParam?: number; start: number; end: number; actions: WaypointAction[] }[] = [];
  const reachPointActions: WaypointAction[] = [];
  for (const action of wp.actions) {
    if (action.type === "endIntervalShot") continue;
    const triggerType = action.triggerType ?? "reachPoint";
    if (triggerType === "reachPoint") {
      reachPointActions.push(action);
      continue;
    }
    groups.push({
      triggerType,
      triggerParam: action.triggerParam,
      start: wpIndex,
      end: triggerType === "betweenAdjacentPoints" ? wpIndex + 1 : wpIndex,
      actions: [action],
    });
  }
  if (reachPointActions.length > 0) {
    groups.unshift({
      triggerType: "reachPoint",
      start: wpIndex,
      end: wpIndex,
      actions: reachPointActions,
    });
  }

  const groupXml = groups.map((group) => {
    const actionXml: string[] = [];
    let actionId = 0;
    for (const action of group.actions) {
      const expanded = expandAction(action);
      for (const entry of expanded) {
        actionXml.push(buildActionXml(actionId++, entry.actuatorFunc, entry.params));
      }
    }
    const agId = agIdCounter.value++;
    return buildActionGroupXml(
      agId,
      group.start,
      group.end,
      group.triggerType,
      group.triggerParam,
      actionXml,
    );
  });

  if (groupXml.length === 0) return "";
  return `${groupXml.join("\n")}\n`;
}

function validateTurnDamping(waypoints: Waypoint[]): Waypoint[] {
  return waypoints.map((wp, index) => {
    if (wp.turnMode !== "coordinateTurn") {
      return { ...wp, turnDampingDist: 0 };
    }
    let maxForSegment = Number.POSITIVE_INFINITY;
    const prev = waypoints[index - 1];
    const next = waypoints[index + 1];
    if (prev) {
      maxForSegment = Math.min(maxForSegment, segmentDistanceM(prev, wp) / 2);
    }
    if (next) {
      maxForSegment = Math.min(maxForSegment, segmentDistanceM(wp, next) / 2);
    }
    const positive = Math.max(0.2, wp.turnDampingDist || 0.2);
    return { ...wp, turnDampingDist: Number(Math.min(positive, maxForSegment).toFixed(3)) };
  });
}

function segmentDistanceM(a: Waypoint, b: Waypoint): number {
  const dlat = b.coordinates[1] - a.coordinates[1];
  const dlon = b.coordinates[0] - a.coordinates[0];
  const latRad = (a.coordinates[1] * Math.PI) / 180;
  const dx = dlon * (Math.PI / 180) * 6371000 * Math.cos(latRad);
  const dy = dlat * (Math.PI / 180) * 6371000;
  return Math.hypot(dx, dy);
}

function waypointTurnXml(wp: Waypoint, indent: string): string {
  const lines = [
    `${indent}<wpml:waypointTurnMode>${wp.turnMode}</wpml:waypointTurnMode>`,
  ];
  if (wp.turnMode === "coordinateTurn") {
    lines.push(`${indent}<wpml:waypointTurnDampingDist>${wp.turnDampingDist}</wpml:waypointTurnDampingDist>`);
  }
  return lines.join("\n");
}

function useStraightLineXml(turnMode: Waypoint["turnMode"], useStraightLine: boolean, indent: string): string {
  if (!CONTINUITY_TURNS.has(turnMode)) return "";
  return `${indent}<wpml:useStraightLine>${useStraightLine ? 1 : 0}</wpml:useStraightLine>`;
}

function waypointGimbalParamXml(wp: Waypoint, params: WaypointRouteParams): string {
  if (params.gimbalPitchMode !== "usePointSetting") return "";
  return `        <wpml:waypointGimbalHeadingParam>
          <wpml:waypointGimbalPitchAngle>${wp.gimbalPitchAngle ?? -90}</wpml:waypointGimbalPitchAngle>
          <wpml:waypointGimbalYawAngle>${wp.gimbalYawAngle ?? 0}</wpml:waypointGimbalYawAngle>
        </wpml:waypointGimbalHeadingParam>
`;
}

function buildPayloadParamXml(camera: Camera, payloadPositionIndex: number): string {
  const lidarTags = camera.isLidar
    ? `\n        <wpml:orthoLidarOverlapH>70</wpml:orthoLidarOverlapH>
        <wpml:orthoLidarOverlapW>60</wpml:orthoLidarOverlapW>
        <wpml:inclinedLidarOverlapH>70</wpml:inclinedLidarOverlapH>
        <wpml:inclinedLidarOverlapW>60</wpml:inclinedLidarOverlapW>`
    : "";
  return `      <wpml:payloadParam>
        <wpml:payloadPositionIndex>${payloadPositionIndex}</wpml:payloadPositionIndex>
        <wpml:imageFormat>${camera.imageFormat}</wpml:imageFormat>
        <wpml:dewarpingEnable>0</wpml:dewarpingEnable>
        <wpml:returnMode>singleReturnFirst</wpml:returnMode>
        <wpml:samplingRate>0</wpml:samplingRate>
        <wpml:scanningMode>repetitive</wpml:scanningMode>
        <wpml:modelColoringEnable>0</wpml:modelColoringEnable>${lidarTags}
      </wpml:payloadParam>`;
}

function waypointPlacemarkTemplateXml(wp: Waypoint, index: number, params: WaypointRouteParams, actionGroupsXml: string): string {
  const useGlobalLines: string[] = [];
  if (wp.useGlobalHeight) useGlobalLines.push("        <wpml:useGlobalHeight>1</wpml:useGlobalHeight>");
  if (wp.useGlobalSpeed) useGlobalLines.push("        <wpml:useGlobalSpeed>1</wpml:useGlobalSpeed>");
  if (wp.useGlobalHeadingParam) useGlobalLines.push("        <wpml:useGlobalHeadingParam>1</wpml:useGlobalHeadingParam>");
  if (wp.useGlobalTurnParam) useGlobalLines.push("        <wpml:useGlobalTurnParam>1</wpml:useGlobalTurnParam>");
  const useStraightLine = useStraightLineXml(wp.turnMode, wp.useStraightLine, "        ");
  const gimbalXml = waypointGimbalParamXml(wp, params);
  return `      <Placemark>
        <Point>
          <coordinates>${wp.coordinates[0].toFixed(12)},${wp.coordinates[1].toFixed(12)}</coordinates>
        </Point>
        <wpml:index>${index}</wpml:index>
        <wpml:ellipsoidHeight>${wp.height.toFixed(3)}</wpml:ellipsoidHeight>
        <wpml:height>${wp.height.toFixed(3)}</wpml:height>
        <wpml:waypointSpeed>${wp.speed}</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
${waypointHeadingParamXml(
  wp.headingMode,
  wp.headingAngle,
  wp.headingPathMode ?? "followBadArc",
  wp.poiPoint ?? [0, 0, 0],
  wp.poiIndex ?? 0,
  "          ",
)}
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam>
${waypointTurnXml(wp, "          ")}
        </wpml:waypointTurnParam>
${useGlobalLines.join("\n")}
${useStraightLine ? `${useStraightLine}\n` : ""}${gimbalXml}${actionGroupsXml}        <wpml:isRisky>0</wpml:isRisky>
      </Placemark>`;
}

function startActionGroupXml(params: WaypointRouteParams): string {
  if (!params.startActionGroupEnabled) return "";
  return `      <wpml:startActionGroup>
        <wpml:action>
          <wpml:actionId>0</wpml:actionId>
          <wpml:actionActuatorFunc>gimbalRotate</wpml:actionActuatorFunc>
          <wpml:actionActuatorFuncParam>
            <wpml:gimbalHeadingYawBase>north</wpml:gimbalHeadingYawBase>
            <wpml:gimbalRotateMode>absoluteAngle</wpml:gimbalRotateMode>
            <wpml:gimbalPitchRotateEnable>1</wpml:gimbalPitchRotateEnable>
            <wpml:gimbalPitchRotateAngle>${params.startActionGroupPitch}</wpml:gimbalPitchRotateAngle>
            <wpml:gimbalRollRotateEnable>0</wpml:gimbalRollRotateEnable>
            <wpml:gimbalRollRotateAngle>0</wpml:gimbalRollRotateAngle>
            <wpml:gimbalYawRotateEnable>0</wpml:gimbalYawRotateEnable>
            <wpml:gimbalYawRotateAngle>0</wpml:gimbalYawRotateAngle>
            <wpml:gimbalRotateTimeEnable>0</wpml:gimbalRotateTimeEnable>
            <wpml:gimbalRotateTime>0</wpml:gimbalRotateTime>
            <wpml:payloadPositionIndex>${params.payloadPositionIndex}</wpml:payloadPositionIndex>
          </wpml:actionActuatorFuncParam>
        </wpml:action>
        <wpml:action>
          <wpml:actionId>1</wpml:actionId>
          <wpml:actionActuatorFunc>setFocusType</wpml:actionActuatorFunc>
          <wpml:actionActuatorFuncParam>
            <wpml:cameraFocusType>manual</wpml:cameraFocusType>
            <wpml:payloadPositionIndex>${params.payloadPositionIndex}</wpml:payloadPositionIndex>
          </wpml:actionActuatorFuncParam>
        </wpml:action>
        <wpml:action>
          <wpml:actionId>2</wpml:actionId>
          <wpml:actionActuatorFunc>focus</wpml:actionActuatorFunc>
          <wpml:actionActuatorFuncParam>
            <wpml:focusX>0</wpml:focusX>
            <wpml:focusY>0</wpml:focusY>
            <wpml:focusRegionWidth>0</wpml:focusRegionWidth>
            <wpml:focusRegionHeight>0</wpml:focusRegionHeight>
            <wpml:isPointFocus>0</wpml:isPointFocus>
            <wpml:isInfiniteFocus>1</wpml:isInfiniteFocus>
            <wpml:payloadPositionIndex>${params.payloadPositionIndex}</wpml:payloadPositionIndex>
            <wpml:isCalibrationFocus>0</wpml:isCalibrationFocus>
          </wpml:actionActuatorFuncParam>
        </wpml:action>
        <wpml:action>
          <wpml:actionId>3</wpml:actionId>
          <wpml:actionActuatorFunc>hover</wpml:actionActuatorFunc>
          <wpml:actionActuatorFuncParam>
            <wpml:hoverTime>${params.startActionGroupHoverSec}</wpml:hoverTime>
          </wpml:actionActuatorFuncParam>
        </wpml:action>
      </wpml:startActionGroup>`;
}

export function buildWaypointTemplateKml(
  waypoints: Waypoint[],
  params: WaypointRouteParams,
  camera: Camera,
): string {
  const now = Date.now();
  const normalized = validateTurnDamping(waypoints);
  const templateAgIdCounter = { value: 0 };
  const placemarks = normalized.map((wp, i) => {
    const agXml = buildActionGroupsForWaypoint(wp, i, templateAgIdCounter);
    return waypointPlacemarkTemplateXml(wp, i, params, agXml);
  }).join("\n");

  const globalUseStraightLine = CONTINUITY_TURNS.has(params.defaultTurnMode)
    ? `\n      <wpml:globalUseStraightLine>1</wpml:globalUseStraightLine>`
    : "";

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
        <wpml:heightMode>${mapHeightModeToTemplateHeightMode(params.heightMode)}</wpml:heightMode>
      </wpml:waylineCoordinateSysParam>
      <wpml:autoFlightSpeed>${params.defaultSpeed}</wpml:autoFlightSpeed>
      <wpml:globalHeight>${params.defaultHeight}</wpml:globalHeight>
      <wpml:caliFlightEnable>0</wpml:caliFlightEnable>
      <wpml:gimbalPitchMode>${params.gimbalPitchMode}</wpml:gimbalPitchMode>
      <wpml:globalWaypointHeadingParam>
${waypointHeadingParamXml(
  params.defaultHeadingMode,
  0,
  params.defaultHeadingPathMode,
  [0, 0, 0],
  0,
  "        ",
)}
      </wpml:globalWaypointHeadingParam>
      <wpml:globalWaypointTurnMode>${params.defaultTurnMode}</wpml:globalWaypointTurnMode>${globalUseStraightLine}
${placemarks}
${buildPayloadParamXml(camera, params.payloadPositionIndex)}
    </Folder>
${KML_FOOTER}`;
}

function waypointPlacemarkWpmlXml(
  wp: Waypoint,
  index: number,
  params: WaypointRouteParams,
  actionGroupsXml: string,
): string {
  const useStraightLine = useStraightLineXml(wp.turnMode, wp.useStraightLine, "        ");
  const gimbalXml = waypointGimbalParamXml(wp, params);
  return `      <Placemark>
        <Point><coordinates>${wp.coordinates[0].toFixed(12)},${wp.coordinates[1].toFixed(12)}</coordinates></Point>
        <wpml:index>${index}</wpml:index>
        <wpml:executeHeight>${wp.height.toFixed(3)}</wpml:executeHeight>
        <wpml:waypointSpeed>${wp.speed}</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
${waypointHeadingParamXml(
  wp.headingMode,
  wp.headingAngle,
  wp.headingPathMode ?? "followBadArc",
  wp.poiPoint ?? [0, 0, 0],
  wp.poiIndex ?? 0,
  "          ",
)}
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam>
${waypointTurnXml(wp, "          ")}
        </wpml:waypointTurnParam>
${useStraightLine ? `${useStraightLine}\n` : ""}${gimbalXml}${actionGroupsXml}        <wpml:isRisky>0</wpml:isRisky>
      </Placemark>`;
}

export function buildWaypointWaylinesWpml(
  waypoints: Waypoint[],
  params: WaypointRouteParams,
  camera: Camera,
): { wpml: string; totalDistanceM: number } {
  const normalized = validateTurnDamping(waypoints);
  const wpmlAgIdCounter = { value: 0 };
  let totalDistanceM = 0;
  const wpXmlChunks: string[] = [];

  for (let i = 0; i < normalized.length; i++) {
    const wp = normalized[i];
    if (i < normalized.length - 1) {
      totalDistanceM += segmentDistanceM(wp, normalized[i + 1]);
    }
    const agXml = buildActionGroupsForWaypoint(wp, i, wpmlAgIdCounter);
    wpXmlChunks.push(waypointPlacemarkWpmlXml(wp, i, params, agXml));
  }

  if (wpmlAgIdCounter.value < 0) {
    throw new Error("Action group IDs must be monotonic.");
  }

  const speed = Math.max(0.1, params.defaultSpeed);
  const wpml = `${KML_HEADER}
${buildMissionConfigXml(params, camera)}
    <Folder>
      <wpml:templateId>0</wpml:templateId>
      <wpml:executeHeightMode>${mapHeightModeToExecuteMode(params.heightMode)}</wpml:executeHeightMode>
      <wpml:waylineId>0</wpml:waylineId>
      <wpml:distance>${totalDistanceM.toFixed(6)}</wpml:distance>
      <wpml:duration>${(totalDistanceM / speed).toFixed(6)}</wpml:duration>
      <wpml:autoFlightSpeed>${speed}</wpml:autoFlightSpeed>
${startActionGroupXml(params)}
${wpXmlChunks.join("\n")}
    </Folder>
${KML_FOOTER}`;
  return { wpml, totalDistanceM };
}
