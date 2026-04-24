import type {
  Camera,
  RcLostAction,
  RcLostMode,
  SurveyParams,
  WaypointRouteParams,
} from "../domain/types";

type MissionConfigParams = Pick<
  SurveyParams | WaypointRouteParams,
  | "finishAction"
  | "takeoffHeightM"
  | "transitSpeedMps"
  | "rthHeightM"
  | "obstacleBypass"
  | "geozoneBypass"
  | "exitOnRCLost"
  | "executeRCLostAction"
  | "positioningType"
  | "payloadPositionIndex"
>;

function clampTakeoffHeight(value: number): number {
  if (!Number.isFinite(value)) return 30;
  return Math.max(1.2, Math.min(1500, value));
}

function normalizeRcLost(mode: RcLostMode, action: RcLostAction): { mode: RcLostMode; action: RcLostAction } {
  if (mode === "executeLostAction") return { mode, action };
  return { mode: "goContinue", action: "goBack" };
}

export function buildMissionConfigXml(
  params: MissionConfigParams,
  camera: Camera,
): string {
  const rerouteMode = params.obstacleBypass ? 1 : 0;
  const geozoneMode = params.geozoneBypass ? 1 : 0;
  const takeoffHeight = clampTakeoffHeight(params.takeoffHeightM);
  const rcLost = normalizeRcLost(params.exitOnRCLost, params.executeRCLostAction);
  const positioningType = params.positioningType === "GPS" && camera.isRtk
    ? "RTKBaseStation"
    : params.positioningType;
  const payloadEnumValue = camera.payloadEnum ?? 0;

  return `    <wpml:missionConfig>
      <!-- Namespace remains 1.0.6 for FH2 compatibility; spec examples often show 1.0.2 -->
      <wpml:flyToWaylineMode>pointToPoint</wpml:flyToWaylineMode>
      <wpml:finishAction>${params.finishAction}</wpml:finishAction>
      <wpml:exitOnRCLost>${rcLost.mode}</wpml:exitOnRCLost>
      <wpml:executeRCLostAction>${rcLost.action}</wpml:executeRCLostAction>
      <wpml:takeOffSecurityHeight>${takeoffHeight}</wpml:takeOffSecurityHeight>
      <wpml:globalTransitionalSpeed>${params.transitSpeedMps}</wpml:globalTransitionalSpeed>
      <wpml:globalRTHHeight>${params.rthHeightM}</wpml:globalRTHHeight>
      <wpml:waylineCoordinateSysParam>
        <wpml:positioningType>${positioningType}</wpml:positioningType>
      </wpml:waylineCoordinateSysParam>
      <wpml:droneInfo>
        <wpml:droneEnumValue>${camera.droneEnum}</wpml:droneEnumValue>
        <wpml:droneSubEnumValue>${camera.droneSubEnum}</wpml:droneSubEnumValue>
      </wpml:droneInfo>
      <wpml:autoRerouteInfo>
        <wpml:transitionalAutoRerouteMode>${rerouteMode}</wpml:transitionalAutoRerouteMode>
        <wpml:missionAutoRerouteMode>${rerouteMode}</wpml:missionAutoRerouteMode>
      </wpml:autoRerouteInfo>
      <wpml:waylineAvoidLimitAreaMode>${geozoneMode}</wpml:waylineAvoidLimitAreaMode>
      <wpml:payloadInfo>
        <wpml:payloadEnumValue>${payloadEnumValue}</wpml:payloadEnumValue>
        <wpml:payloadSubEnumValue>${camera.payloadSubEnum}</wpml:payloadSubEnumValue>
        <wpml:payloadPositionIndex>${params.payloadPositionIndex}</wpml:payloadPositionIndex>
      </wpml:payloadInfo>
    </wpml:missionConfig>`;
}
