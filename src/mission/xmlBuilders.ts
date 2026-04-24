import type { Camera, LonLat, LonLatAlt, SurveyParams } from "../domain/types";
import { headingDeg, haversineDistanceM } from "../geo/math";
import { buildMissionConfigXml } from "./missionConfig";

const KML_HEADER = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.dji.com/wpmz/1.0.6">
  <Document>`;
const KML_FOOTER = `  </Document>
</kml>`;

function polygonCoordinateString(poly: LonLat[]): string {
  return poly
    .map(([lon, lat]) => `                ${lon.toFixed(12)},${lat.toFixed(12)},0`)
    .join("\n");
}

function getSurveyMode(params: SurveyParams) {
  const isOrtho = params.collectionMode === "ortho";
  const isOblique = params.collectionMode === "oblique";
  return {
    orthoPlain: isOrtho && !params.smartOblique,
    orthoSmart: isOrtho && params.smartOblique,
    obliquePlain: isOblique && !params.smartOblique,
    obliqueSmart: isOblique && params.smartOblique,
    isSmartOblique: params.smartOblique,
    usesSmartCapture: (isOrtho && params.smartOblique) || (isOblique && params.smartOblique),
    usesStandardCapture: (isOrtho && !params.smartOblique) || (isOblique && !params.smartOblique),
  };
}

// ---------------------------------------------------------------------------
// template.kml
// ---------------------------------------------------------------------------

export function buildTemplateKml(
  polygon: LonLat[],
  params: SurveyParams,
  camera: Camera,
): string {
  const now = Date.now();
  const mode = getSurveyMode(params);

  const heightModeMap: Record<SurveyParams["heightMode"], string> = {
    ALT: "relativeToStartPoint",
    ASL: "EGM96",
    AGL: params.realTimeTerrainFollow ? "realTimeFollowSurface" : "EGM96",
  };

  const templateType = params.templateType === "mappingStrip"
    ? "mappingStrip"
    : mode.obliquePlain
      ? "mapping3d"
      : "mapping2d";

  const aglLines: string[] = [];
  if (params.heightMode === "AGL") {
    aglLines.push(`        <wpml:surfaceFollowModeEnable>1</wpml:surfaceFollowModeEnable>`);
    aglLines.push(`        <wpml:isRealtimeSurfaceFollow>${params.realTimeTerrainFollow ? 1 : 0}</wpml:isRealtimeSurfaceFollow>`);
    aglLines.push(`        <wpml:surfaceRelativeHeight>${params.altitudeM}</wpml:surfaceRelativeHeight>`);
    if (!params.realTimeTerrainFollow && params.dsmFilename) {
      aglLines.push(`        <wpml:dsmFile>wpmz/res/dsm/${params.dsmFilename}</wpml:dsmFile>`);
    }
  }

  const placemarkLines: string[] = [];

  if (!mode.obliquePlain) {
    placemarkLines.push(`        <wpml:smartObliqueEnable>${mode.obliqueSmart ? 1 : 0}</wpml:smartObliqueEnable>`);
    placemarkLines.push(`        <wpml:quickOrthoMappingEnable>${mode.orthoSmart ? 1 : 0}</wpml:quickOrthoMappingEnable>`);
  }

  if (!mode.obliquePlain) {
    placemarkLines.push(`        <wpml:elevationOptimizeEnable>${params.elevationOptimize ? 1 : 0}</wpml:elevationOptimizeEnable>`);
  }

  if (mode.orthoSmart) {
    placemarkLines.push(`        <wpml:quickOrthoMappingPitch>${params.smartObliquePitch}</wpml:quickOrthoMappingPitch>`);
  }
  if (mode.obliqueSmart) {
    placemarkLines.push(`        <wpml:smartObliqueGimbalPitch>${params.obliquePitch}</wpml:smartObliqueGimbalPitch>`);
  }

  if (mode.obliquePlain) {
    placemarkLines.push(`        <wpml:inclinedGimbalPitch>${params.obliquePitch}</wpml:inclinedGimbalPitch>`);
    placemarkLines.push(`        <wpml:inclinedFlightSpeed>${params.obliqueSpeedMps}</wpml:inclinedFlightSpeed>`);
  }

  placemarkLines.push(`        <wpml:shootType>${params.shootType}</wpml:shootType>`);
  placemarkLines.push(`        <wpml:direction>${params.courseDeg}</wpml:direction>`);
  placemarkLines.push(`        <wpml:margin>${params.marginM}</wpml:margin>`);

  const overlapLines = [
    `          <wpml:orthoCameraOverlapH>${params.forwardOverlapPct}</wpml:orthoCameraOverlapH>`,
    `          <wpml:orthoCameraOverlapW>${params.sideOverlapPct}</wpml:orthoCameraOverlapW>`,
  ];
  if (mode.obliquePlain) {
    overlapLines.push(`          <wpml:inclinedCameraOverlapH>${params.obliqueForwardOverlapPct}</wpml:inclinedCameraOverlapH>`);
    overlapLines.push(`          <wpml:inclinedCameraOverlapW>${params.obliqueSideOverlapPct}</wpml:inclinedCameraOverlapW>`);
  } else {
    overlapLines.push(`          <wpml:inclinedCameraOverlapH>${params.forwardOverlapPct}</wpml:inclinedCameraOverlapH>`);
    overlapLines.push(`          <wpml:inclinedCameraOverlapW>${params.sideOverlapPct}</wpml:inclinedCameraOverlapW>`);
  }

  const payloadParam = `      <wpml:payloadParam>
        <wpml:payloadPositionIndex>${params.payloadPositionIndex}</wpml:payloadPositionIndex>
        <wpml:imageFormat>${camera.imageFormat}</wpml:imageFormat>
        <wpml:dewarpingEnable>0</wpml:dewarpingEnable>
        <wpml:returnMode>singleReturnFirst</wpml:returnMode>
        <wpml:samplingRate>0</wpml:samplingRate>
        <wpml:scanningMode>repetitive</wpml:scanningMode>
        <wpml:modelColoringEnable>0</wpml:modelColoringEnable>
${camera.isLidar ? `        <wpml:orthoLidarOverlapH>${params.forwardOverlapPct}</wpml:orthoLidarOverlapH>
        <wpml:orthoLidarOverlapW>${params.sideOverlapPct}</wpml:orthoLidarOverlapW>
        <wpml:inclinedLidarOverlapH>${params.obliqueForwardOverlapPct}</wpml:inclinedLidarOverlapH>
        <wpml:inclinedLidarOverlapW>${params.obliqueSideOverlapPct}</wpml:inclinedLidarOverlapW>` : ""}
      </wpml:payloadParam>`;
  const mappingHeadingParam = `        <wpml:mappingHeadingParam>
          <wpml:mappingHeadingMode>${params.mappingHeadingMode}</wpml:mappingHeadingMode>
${params.mappingHeadingMode === "fixed" ? `          <wpml:mappingHeadingAngle>${params.mappingHeadingAngle}</wpml:mappingHeadingAngle>` : ""}
        </wpml:mappingHeadingParam>`;

  return `${KML_HEADER}
    <wpml:author>RocketDNA Survey Generator (Web)</wpml:author>
    <wpml:createTime>${now}</wpml:createTime>
    <wpml:updateTime>${now}</wpml:updateTime>
${buildMissionConfigXml(params, camera)}
    <Folder>
      <wpml:templateType>${templateType}</wpml:templateType>
      <wpml:templateId>0</wpml:templateId>
      <wpml:waylineCoordinateSysParam>
        <wpml:coordinateMode>WGS84</wpml:coordinateMode>
        <wpml:heightMode>${heightModeMap[params.heightMode]}</wpml:heightMode>
        <wpml:globalShootHeight>${params.altitudeM}</wpml:globalShootHeight>
${aglLines.length > 0 ? aglLines.join("\n") + "\n" : ""}      </wpml:waylineCoordinateSysParam>
      <wpml:autoFlightSpeed>${params.speedMps}</wpml:autoFlightSpeed>
      <Placemark>
${placemarkLines.join("\n")}
${mappingHeadingParam}
        <wpml:overlap>
${overlapLines.join("\n")}
        </wpml:overlap>
        <Polygon><outerBoundaryIs><LinearRing><coordinates>
${polygonCoordinateString(polygon)}
        </coordinates></LinearRing></outerBoundaryIs></Polygon>
      </Placemark>
${payloadParam}
    </Folder>
${KML_FOOTER}`;
}

// ---------------------------------------------------------------------------
// waylines.wpml – action group helpers
// ---------------------------------------------------------------------------

function startActionGroupXml(pitchDeg: number): string {
  return `    <wpml:startActionGroup>
      <wpml:action>
        <wpml:actionId>0</wpml:actionId>
        <wpml:actionActuatorFunc>gimbalRotate</wpml:actionActuatorFunc>
        <wpml:actionActuatorFuncParam>
          <wpml:gimbalHeadingYawBase>north</wpml:gimbalHeadingYawBase>
          <wpml:gimbalRotateMode>absoluteAngle</wpml:gimbalRotateMode>
          <wpml:gimbalPitchRotateEnable>1</wpml:gimbalPitchRotateEnable>
          <wpml:gimbalPitchRotateAngle>${pitchDeg}</wpml:gimbalPitchRotateAngle>
          <wpml:gimbalRollRotateEnable>0</wpml:gimbalRollRotateEnable>
          <wpml:gimbalRollRotateAngle>0</wpml:gimbalRollRotateAngle>
          <wpml:gimbalYawRotateEnable>0</wpml:gimbalYawRotateEnable>
          <wpml:gimbalYawRotateAngle>0</wpml:gimbalYawRotateAngle>
          <wpml:gimbalRotateTimeEnable>0</wpml:gimbalRotateTimeEnable>
          <wpml:gimbalRotateTime>0</wpml:gimbalRotateTime>
          <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
        </wpml:actionActuatorFuncParam>
      </wpml:action>
      <wpml:action>
        <wpml:actionId>1</wpml:actionId>
        <wpml:actionActuatorFunc>hover</wpml:actionActuatorFunc>
        <wpml:actionActuatorFuncParam>
          <wpml:hoverTime>0.5</wpml:hoverTime>
        </wpml:actionActuatorFuncParam>
      </wpml:action>
      <wpml:action>
        <wpml:actionId>2</wpml:actionId>
        <wpml:actionActuatorFunc>setFocusType</wpml:actionActuatorFunc>
        <wpml:actionActuatorFuncParam>
          <wpml:cameraFocusType>manual</wpml:cameraFocusType>
          <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
        </wpml:actionActuatorFuncParam>
      </wpml:action>
      <wpml:action>
        <wpml:actionId>3</wpml:actionId>
        <wpml:actionActuatorFunc>focus</wpml:actionActuatorFunc>
        <wpml:actionActuatorFuncParam>
          <wpml:focusX>0</wpml:focusX>
          <wpml:focusY>0</wpml:focusY>
          <wpml:focusRegionWidth>0</wpml:focusRegionWidth>
          <wpml:focusRegionHeight>0</wpml:focusRegionHeight>
          <wpml:isPointFocus>0</wpml:isPointFocus>
          <wpml:isInfiniteFocus>1</wpml:isInfiniteFocus>
          <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
          <wpml:isCalibrationFocus>0</wpml:isCalibrationFocus>
        </wpml:actionActuatorFuncParam>
      </wpml:action>
      <wpml:action>
        <wpml:actionId>4</wpml:actionId>
        <wpml:actionActuatorFunc>hover</wpml:actionActuatorFunc>
        <wpml:actionActuatorFuncParam>
          <wpml:hoverTime>1</wpml:hoverTime>
        </wpml:actionActuatorFuncParam>
      </wpml:action>
    </wpml:startActionGroup>`;
}

interface ActionGroupOpts {
  agId: number;
  startIdx: number;
  endIdx: number;
  triggerType: string;
  triggerParam?: number;
  actions: string[];
}

function actionGroupXml(opts: ActionGroupOpts): string {
  const triggerParamTag = opts.triggerParam != null
    ? `\n            <wpml:actionTriggerParam>${opts.triggerParam}</wpml:actionTriggerParam>`
    : "";
  return `        <wpml:actionGroup>
          <wpml:actionGroupId>${opts.agId}</wpml:actionGroupId>
          <wpml:actionGroupStartIndex>${opts.startIdx}</wpml:actionGroupStartIndex>
          <wpml:actionGroupEndIndex>${opts.endIdx}</wpml:actionGroupEndIndex>
          <wpml:actionGroupMode>sequence</wpml:actionGroupMode>
          <wpml:actionTrigger>
            <wpml:actionTriggerType>${opts.triggerType}</wpml:actionTriggerType>${triggerParamTag}
          </wpml:actionTrigger>
${opts.actions.join("\n")}
        </wpml:actionGroup>`;
}

function gimbalLockAction(actionId: number): string {
  return `          <wpml:action>
            <wpml:actionId>${actionId}</wpml:actionId>
            <wpml:actionActuatorFunc>gimbalAngleLock</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>`;
}

function gimbalUnlockAction(actionId: number): string {
  return `          <wpml:action>
            <wpml:actionId>${actionId}</wpml:actionId>
            <wpml:actionActuatorFunc>gimbalAngleUnlock</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>`;
}

function gimbalRotateAction(actionId: number, pitchDeg: number): string {
  return `          <wpml:action>
            <wpml:actionId>${actionId}</wpml:actionId>
            <wpml:actionActuatorFunc>gimbalRotate</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:gimbalHeadingYawBase>north</wpml:gimbalHeadingYawBase>
              <wpml:gimbalRotateMode>absoluteAngle</wpml:gimbalRotateMode>
              <wpml:gimbalPitchRotateEnable>1</wpml:gimbalPitchRotateEnable>
              <wpml:gimbalPitchRotateAngle>${pitchDeg}</wpml:gimbalPitchRotateAngle>
              <wpml:gimbalRollRotateEnable>0</wpml:gimbalRollRotateEnable>
              <wpml:gimbalRollRotateAngle>0</wpml:gimbalRollRotateAngle>
              <wpml:gimbalYawRotateEnable>0</wpml:gimbalYawRotateEnable>
              <wpml:gimbalYawRotateAngle>0</wpml:gimbalYawRotateAngle>
              <wpml:gimbalRotateTimeEnable>0</wpml:gimbalRotateTimeEnable>
              <wpml:gimbalRotateTime>0</wpml:gimbalRotateTime>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>`;
}

function startContinuousShootingAction(actionId: number, imageFormat: string): string {
  return `          <wpml:action>
            <wpml:actionId>${actionId}</wpml:actionId>
            <wpml:actionActuatorFunc>startContinuousShooting</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
              <wpml:useGlobalPayloadLensIndex>0</wpml:useGlobalPayloadLensIndex>
              <wpml:payloadLensIndex>${imageFormat}</wpml:payloadLensIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>`;
}

function stopContinuousShootingAction(actionId: number): string {
  return `          <wpml:action>
            <wpml:actionId>${actionId}</wpml:actionId>
            <wpml:actionActuatorFunc>stopContinuousShooting</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>`;
}

function startSmartObliqueAction(actionId: number): string {
  return `          <wpml:action>
            <wpml:actionId>${actionId}</wpml:actionId>
            <wpml:actionActuatorFunc>startSmartOblique</wpml:actionActuatorFunc>
          </wpml:action>`;
}

function stopSmartObliqueAction(actionId: number): string {
  return `          <wpml:action>
            <wpml:actionId>${actionId}</wpml:actionId>
            <wpml:actionActuatorFunc>stopSmartOblique</wpml:actionActuatorFunc>
          </wpml:action>`;
}

// ---------------------------------------------------------------------------
// waylines.wpml – waypoint XML
// ---------------------------------------------------------------------------

type TurnMode =
  | "coordinateTurn"
  | "toPointAndStopWithDiscontinuityCurvature"
  | "toPointAndPassWithContinuityCurvature"
  | "toPointAndStopWithContinuityCurvature";

function waypointXml(
  index: number,
  waypoint: LonLatAlt,
  speedMps: number,
  heading: number,
  turnMode: TurnMode,
  dampingDist: number,
  actionGroupsXml: string,
): string {
  return `      <Placemark>
        <Point><coordinates>${waypoint[0].toFixed(12)},${waypoint[1].toFixed(12)}</coordinates></Point>
        <wpml:index>${index}</wpml:index>
        <wpml:executeHeight>${waypoint[2].toFixed(3)}</wpml:executeHeight>
        <wpml:waypointSpeed>${speedMps}</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngle>${heading.toFixed(4)}</wpml:waypointHeadingAngle>
          <wpml:waypointHeadingPathMode>followBadArc</wpml:waypointHeadingPathMode>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam>
          <wpml:waypointTurnMode>${turnMode}</wpml:waypointTurnMode>
          <wpml:waypointTurnDampingDist>${dampingDist}</wpml:waypointTurnDampingDist>
        </wpml:waypointTurnParam>
        <wpml:useStraightLine>1</wpml:useStraightLine>
${actionGroupsXml}      </Placemark>`;
}

// ---------------------------------------------------------------------------
// waylines.wpml – folder builders
// ---------------------------------------------------------------------------

export interface WaylineFolderInput {
  waypoints: LonLatAlt[];
  pitchDeg: number;
  speedMps: number;
  photoIntervalM: number;
  imageFormat: string;
  isSmartOblique: boolean;
  lineBreaks: number[];
  executeHeightMode?: string;
}

function buildStandardCaptureFolder(
  waylineId: number,
  input: WaylineFolderInput,
): { xml: string; distanceM: number } {
  const { waypoints, pitchDeg, speedMps, photoIntervalM, imageFormat, executeHeightMode } = input;
  if (waypoints.length === 0) return { xml: "", distanceM: 0 };

  let distanceM = 0;
  let agIdCounter = 0;
  const lastIdx = waypoints.length - 1;

  const firstWpActions: string[] = [];
  firstWpActions.push(actionGroupXml({
    agId: agIdCounter++,
    startIdx: 0,
    endIdx: lastIdx,
    triggerType: "betweenAdjacentPoints",
    actions: [gimbalLockAction(0)],
  }));
  firstWpActions.push(actionGroupXml({
    agId: agIdCounter++,
    startIdx: 0,
    endIdx: lastIdx,
    triggerType: "multipleDistance",
    triggerParam: Number(photoIntervalM.toFixed(6)),
    actions: [
      gimbalRotateAction(0, pitchDeg),
      startContinuousShootingAction(1, imageFormat),
    ],
  }));

  const lastWpActions: string[] = [];
  lastWpActions.push(actionGroupXml({
    agId: agIdCounter++,
    startIdx: lastIdx,
    endIdx: lastIdx,
    triggerType: "reachPoint",
    actions: [
      stopContinuousShootingAction(0),
      gimbalUnlockAction(1),
    ],
  }));

  const waypointXmlChunks: string[] = [];
  for (let i = 0; i <= lastIdx; i++) {
    const current = waypoints[i];
    const next = waypoints[i + 1] ?? waypoints[i - 1];
    const heading = next
      ? headingDeg([current[0], current[1]], [next[0], next[1]])
      : 0;
    if (i < lastIdx) {
      distanceM += haversineDistanceM(
        [current[0], current[1]],
        [waypoints[i + 1][0], waypoints[i + 1][1]],
      );
    }

    let turnMode: TurnMode = "coordinateTurn";
    let dampingDist = 10;
    if (i === 0 || i === lastIdx) {
      turnMode = "toPointAndStopWithDiscontinuityCurvature";
      dampingDist = 0;
    }

    let agXml = "";
    if (i === 0) agXml = firstWpActions.join("\n") + "\n";
    else if (i === lastIdx) agXml = lastWpActions.join("\n") + "\n";

    waypointXmlChunks.push(waypointXml(i, current, speedMps, heading, turnMode, dampingDist, agXml));
  }

  const xml = `    <Folder>
      <wpml:templateId>0</wpml:templateId>
      <wpml:executeHeightMode>${executeHeightMode ?? "WGS84"}</wpml:executeHeightMode>
      <wpml:waylineId>${waylineId}</wpml:waylineId>
      <wpml:distance>${distanceM.toFixed(6)}</wpml:distance>
      <wpml:duration>${(distanceM / speedMps).toFixed(6)}</wpml:duration>
      <wpml:autoFlightSpeed>${speedMps}</wpml:autoFlightSpeed>
${startActionGroupXml(pitchDeg)}
${waypointXmlChunks.join("\n")}
    </Folder>`;
  return { xml, distanceM };
}

function buildSmartObliqueFolder(
  waylineId: number,
  input: WaylineFolderInput,
): { xml: string; distanceM: number } {
  const { waypoints, pitchDeg, speedMps, lineBreaks, executeHeightMode } = input;
  if (waypoints.length === 0) return { xml: "", distanceM: 0 };

  let distanceM = 0;
  let agIdCounter = 0;
  const lastIdx = waypoints.length - 1;

  const lineEndSet = new Set(lineBreaks);
  const lineStartSet = new Set<number>();
  for (const brk of lineBreaks) {
    if (brk + 1 <= lastIdx) lineStartSet.add(brk + 1);
  }
  lineStartSet.add(0);

  const waypointXmlChunks: string[] = [];
  for (let i = 0; i <= lastIdx; i++) {
    const current = waypoints[i];
    const next = waypoints[i + 1] ?? waypoints[i - 1];
    const heading = next
      ? headingDeg([current[0], current[1]], [next[0], next[1]])
      : 0;
    if (i < lastIdx) {
      distanceM += haversineDistanceM(
        [current[0], current[1]],
        [waypoints[i + 1][0], waypoints[i + 1][1]],
      );
    }

    let turnMode: TurnMode = "coordinateTurn";
    let dampingDist = 10;
    if (i === 0 || i === lastIdx) {
      turnMode = "toPointAndStopWithDiscontinuityCurvature";
      dampingDist = 0;
    } else if (lineEndSet.has(i)) {
      turnMode = "toPointAndPassWithContinuityCurvature";
      dampingDist = 10;
    }

    const agChunks: string[] = [];

    if (lineStartSet.has(i) && i < lastIdx) {
      const lineEnd = (() => {
        for (const brk of lineBreaks) {
          if (brk > i) return brk;
        }
        return lastIdx;
      })();

      agChunks.push(actionGroupXml({
        agId: agIdCounter++,
        startIdx: i,
        endIdx: lineEnd,
        triggerType: "betweenAdjacentPoints",
        actions: [
          gimbalLockAction(0),
          startSmartObliqueAction(1),
        ],
      }));
    }

    if (lineEndSet.has(i) || i === lastIdx) {
      agChunks.push(actionGroupXml({
        agId: agIdCounter++,
        startIdx: i,
        endIdx: i,
        triggerType: "reachPoint",
        actions: [
          stopSmartObliqueAction(0),
          gimbalUnlockAction(1),
        ],
      }));
    }

    const agXml = agChunks.length > 0 ? agChunks.join("\n") + "\n" : "";
    waypointXmlChunks.push(waypointXml(i, current, speedMps, heading, turnMode, dampingDist, agXml));
  }

  const xml = `    <Folder>
      <wpml:templateId>0</wpml:templateId>
      <wpml:executeHeightMode>${executeHeightMode ?? "WGS84"}</wpml:executeHeightMode>
      <wpml:waylineId>${waylineId}</wpml:waylineId>
      <wpml:distance>${distanceM.toFixed(6)}</wpml:distance>
      <wpml:duration>${(distanceM / speedMps).toFixed(6)}</wpml:duration>
      <wpml:autoFlightSpeed>${speedMps}</wpml:autoFlightSpeed>
${startActionGroupXml(pitchDeg)}
${waypointXmlChunks.join("\n")}
    </Folder>`;
  return { xml, distanceM };
}

// ---------------------------------------------------------------------------
// waylines.wpml – public API
// ---------------------------------------------------------------------------

export function buildWaylinesWpml(
  folderInputs: WaylineFolderInput[],
  params: SurveyParams,
  camera: Camera,
): { wpml: string; totalDistanceM: number } {
  const folders: string[] = [];
  let totalDistanceM = 0;
  let waylineIdCounter = 0;

  for (const input of folderInputs) {
    const builder = input.isSmartOblique
      ? buildSmartObliqueFolder
      : buildStandardCaptureFolder;
    const built = builder(waylineIdCounter, input);
    if (built.xml) {
      folders.push(built.xml);
      totalDistanceM += built.distanceM;
      waylineIdCounter++;
    }
  }

  const wpml = `${KML_HEADER}
${buildMissionConfigXml(params, camera)}
${folders.join("\n")}
${KML_FOOTER}`;

  return { wpml, totalDistanceM };
}
