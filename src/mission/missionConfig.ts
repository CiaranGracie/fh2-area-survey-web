import type { Camera, SurveyParams } from "../domain/types";

export function buildMissionConfigXml(
  params: Pick<
    SurveyParams,
    | "finishAction"
    | "takeoffHeightM"
    | "transitSpeedMps"
    | "rthHeightM"
    | "obstacleBypass"
    | "geozoneBypass"
  >,
  camera: Camera,
): string {
  const rerouteMode = params.obstacleBypass ? 1 : 0;
  const geozoneMode = params.geozoneBypass ? 1 : 0;
  return `    <wpml:missionConfig>
      <wpml:flyToWaylineMode>pointToPoint</wpml:flyToWaylineMode>
      <wpml:finishAction>${params.finishAction}</wpml:finishAction>
      <wpml:exitOnRCLost>goContinue</wpml:exitOnRCLost>
      <wpml:executeRCLostAction>goBack</wpml:executeRCLostAction>
      <wpml:takeOffSecurityHeight>${params.takeoffHeightM}</wpml:takeOffSecurityHeight>
      <wpml:globalTransitionalSpeed>${params.transitSpeedMps}</wpml:globalTransitionalSpeed>
      <wpml:globalRTHHeight>${params.rthHeightM}</wpml:globalRTHHeight>
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
        <wpml:payloadEnumValue>${camera.payloadEnum}</wpml:payloadEnumValue>
        <wpml:payloadSubEnumValue>${camera.payloadSubEnum}</wpml:payloadSubEnumValue>
        <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
      </wpml:payloadInfo>
    </wpml:missionConfig>`;
}
