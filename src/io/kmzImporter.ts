import JSZip from "jszip";
import type { AppMode, LonLat, Waypoint, WaypointAction } from "../domain/types";

export interface ImportedMission {
  mode: AppMode;
  polygon?: LonLat[];
  waypoints?: Waypoint[];
  riskyWaypointIndexes: number[];
}

function parseXml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error("Invalid XML inside KMZ.");
  }
  return doc;
}

function firstTextBySuffix(root: ParentNode, suffix: string): string | null {
  const all = Array.from(root.querySelectorAll("*"));
  const found = all.find((node) => node.nodeName.toLowerCase().endsWith(suffix.toLowerCase()));
  return found?.textContent?.trim() ?? null;
}

function allBySuffix(root: ParentNode, suffix: string): Element[] {
  return Array.from(root.querySelectorAll("*")).filter((node) =>
    node.nodeName.toLowerCase().endsWith(suffix.toLowerCase()),
  ) as Element[];
}

function hasAncestorWithSuffix(node: Element, suffix: string): boolean {
  let current = node.parentElement;
  while (current) {
    if (current.nodeName.toLowerCase().endsWith(suffix.toLowerCase())) return true;
    current = current.parentElement;
  }
  return false;
}

function parseCoordinatesText(text: string): LonLat[] {
  return text
    .trim()
    .split(/\s+/)
    .map((row) => row.split(","))
    .map(([lon, lat]) => [Number(lon), Number(lat)] as LonLat)
    .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));
}

function parseTemplatePolygon(doc: Document): LonLat[] | undefined {
  const coordNode = allBySuffix(doc, "coordinates").find((node) =>
    node.parentElement?.nodeName.toLowerCase().endsWith("linearring"),
  );
  if (!coordNode?.textContent) return undefined;
  const coords = parseCoordinatesText(coordNode.textContent);
  return coords.length >= 3 ? coords : undefined;
}

function parseActionsFromGroup(group: Element, idPrefix: string): WaypointAction[] {
  const actions: WaypointAction[] = [];
  const triggerType = firstTextBySuffix(group, "actiontriggertype") ?? "reachPoint";
  const triggerParamRaw = firstTextBySuffix(group, "actiontriggerparam");
  const triggerParam = triggerParamRaw ? Number(triggerParamRaw) : undefined;
  const actionNodes = allBySuffix(group, "action").filter((node) =>
    allBySuffix(node, "actionactuatorfunc").length > 0,
  );
  actionNodes.forEach((actionNode, ai) => {
    const funcRaw = firstTextBySuffix(actionNode, "actionactuatorfunc") ?? "hover";
    const type = funcRaw === "accurateShoot" ? "orientedShoot" : funcRaw;
    const paramsNode = allBySuffix(actionNode, "actionactuatorfuncparam")[0];
    const params: Record<string, string | number | boolean> = {};
    if (paramsNode) {
      for (const child of Array.from(paramsNode.children)) {
        const key = child.nodeName.replace(/^.*:/, "");
        const valueText = child.textContent?.trim() ?? "";
        params[key] = Number.isFinite(Number(valueText)) && valueText !== ""
          ? Number(valueText)
          : valueText;
      }
    }
    actions.push({
      id: `${idPrefix}-${ai}`,
      type: type as WaypointAction["type"],
      params,
      triggerType: triggerType as WaypointAction["triggerType"],
      triggerParam,
    });
  });
  return actions;
}

function parseFolderLevelActionGroups(waylinesDoc: Document): Map<number, WaypointAction[]> {
  const actionsByWaypoint = new Map<number, WaypointAction[]>();
  const folders = allBySuffix(waylinesDoc, "folder");
  folders.forEach((folder, folderIndex) => {
    const groups = allBySuffix(folder, "actiongroup").filter((group) => !hasAncestorWithSuffix(group, "placemark"));
    groups.forEach((group, groupIndex) => {
      const startRaw = firstTextBySuffix(group, "actiongroupstartindex");
      const endRaw = firstTextBySuffix(group, "actiongroupendindex");
      if (startRaw == null) return;
      const start = Number(startRaw);
      const end = endRaw == null ? start : Number(endRaw);
      if (!Number.isFinite(start) || !Number.isFinite(end)) return;

      const parsedActions = parseActionsFromGroup(group, `imported-action-f${folderIndex}-g${groupIndex}`);
      if (parsedActions.length === 0) return;

      // FH2 often stores groups at folder level; attach to start index for editor semantics.
      const waypointIndex = start;
      const existing = actionsByWaypoint.get(waypointIndex) ?? [];
      actionsByWaypoint.set(waypointIndex, [...existing, ...parsedActions]);
    });
  });
  return actionsByWaypoint;
}

function parsePlacemarkActions(placemark: Element, idPrefix: string): WaypointAction[] {
  const groups = allBySuffix(placemark, "actiongroup");
  const actions: WaypointAction[] = [];
  groups.forEach((group, groupIndex) => {
    actions.push(...parseActionsFromGroup(group, `${idPrefix}-g${groupIndex}`));
  });
  return actions;
}

function parseWaypoints(templateDoc: Document, waylinesDoc?: Document): Waypoint[] {
  const placemarks = allBySuffix(templateDoc, "placemark");
  const waylinePlacemarks = waylinesDoc ? allBySuffix(waylinesDoc, "placemark") : [];
  const folderActions = waylinesDoc ? parseFolderLevelActionGroups(waylinesDoc) : new Map<number, WaypointAction[]>();
  return placemarks
    .map((placemark, i) => {
      const coordText = firstTextBySuffix(placemark, "coordinates");
      if (!coordText) return null;
      const [lonStr, latStr] = coordText.split(",");
      const lon = Number(lonStr);
      const lat = Number(latStr);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
      const riskyText = firstTextBySuffix(placemark, "isRisky") ?? "0";
      const actionsFromPlacemark = waylinePlacemarks[i]
        ? parsePlacemarkActions(waylinePlacemarks[i], `imported-action-p${i}`)
        : [];
      const actions = [...(folderActions.get(i) ?? []), ...actionsFromPlacemark];
      return {
        id: `imported-wp-${i}`,
        name: `Waypoint ${i + 1}`,
        description: "",
        coordinates: [lon, lat] as LonLat,
        height: Number(firstTextBySuffix(placemark, "height") ?? 80),
        speed: Number(firstTextBySuffix(placemark, "waypointSpeed") ?? 10),
        headingMode: (firstTextBySuffix(placemark, "waypointHeadingMode") ?? "followWayline") as Waypoint["headingMode"],
        headingAngle: Number(firstTextBySuffix(placemark, "waypointHeadingAngle") ?? 0),
        headingPathMode: (firstTextBySuffix(placemark, "waypointHeadingPathMode") ?? "followBadArc") as Waypoint["headingPathMode"],
        poiPoint: [0, 0, 0],
        poiIndex: Number(firstTextBySuffix(placemark, "waypointHeadingPoiIndex") ?? 0),
        turnMode: (firstTextBySuffix(placemark, "waypointTurnMode") ?? "toPointAndStopWithDiscontinuityCurvature") as Waypoint["turnMode"],
        turnDampingDist: Number(firstTextBySuffix(placemark, "waypointTurnDampingDist") ?? 0.2),
        useStraightLine: (firstTextBySuffix(placemark, "useStraightLine") ?? "1") === "1",
        payloadPositionIndex: 0,
        gimbalPitchAngle: Number(firstTextBySuffix(placemark, "waypointGimbalPitchAngle") ?? -90),
        gimbalYawAngle: Number(firstTextBySuffix(placemark, "waypointGimbalYawAngle") ?? 0),
        useGlobalHeight: (firstTextBySuffix(placemark, "useGlobalHeight") ?? "0") === "1",
        useGlobalSpeed: (firstTextBySuffix(placemark, "useGlobalSpeed") ?? "0") === "1",
        useGlobalHeadingParam: (firstTextBySuffix(placemark, "useGlobalHeadingParam") ?? "0") === "1",
        useGlobalTurnParam: (firstTextBySuffix(placemark, "useGlobalTurnParam") ?? "0") === "1",
        actions,
        __risky: riskyText === "1",
      } as Waypoint & { __risky: boolean };
    })
    .filter(Boolean) as Waypoint[];
}

export async function importKmzMission(file: File): Promise<ImportedMission> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const templateEntry = zip.file("wpmz/template.kml") ?? Object.values(zip.files).find((f) => f.name.endsWith("template.kml"));
  const waylinesEntry = zip.file("wpmz/waylines.wpml") ?? Object.values(zip.files).find((f) => f.name.endsWith("waylines.wpml"));
  if (!templateEntry) throw new Error("KMZ does not include wpmz/template.kml");
  const templateDoc = parseXml(await templateEntry.async("string"));
  const waylinesDoc = waylinesEntry ? parseXml(await waylinesEntry.async("string")) : undefined;
  const templateType = firstTextBySuffix(templateDoc, "templateType");

  if (templateType === "waypoint") {
    const waypoints = parseWaypoints(templateDoc, waylinesDoc);
    const riskyWaypointIndexes = waypoints
      .map((wp, i) => ({ i, risky: (wp as Waypoint & { __risky?: boolean }).__risky }))
      .filter((x) => x.risky)
      .map((x) => x.i);
    return {
      mode: "waypointRoute",
      waypoints: waypoints.map((wp) => {
        const copy = { ...wp } as Waypoint & { __risky?: boolean };
        delete copy.__risky;
        return copy;
      }),
      riskyWaypointIndexes,
    };
  }

  const polygon = parseTemplatePolygon(templateDoc);
  if (!polygon) throw new Error("No polygon found in template.kml");
  return {
    mode: templateType === "mappingStrip" ? "mappingStrip" : "areaSurvey",
    polygon,
    riskyWaypointIndexes: [],
  };
}

