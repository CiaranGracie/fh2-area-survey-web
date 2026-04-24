import { describe, expect, it } from "vitest";
import { CAMERAS } from "../domain/cameras";
import { DEFAULT_WAYPOINT_PARAMS } from "../domain/defaults";
import type { Waypoint } from "../domain/types";
import { createAction } from "../domain/actions";
import { buildWaypointTemplateKml, buildWaypointWaylinesWpml } from "./waypointXmlBuilders";

const camera = CAMERAS["M4D Wide (24mm)"];

function makeWaypoints(): Waypoint[] {
  return [
    {
      id: "wp-0",
      name: "Start",
      description: "",
      coordinates: [151.2, -33.9],
      height: 80,
      speed: 10,
      headingMode: "followWayline",
      headingAngle: 0,
      turnMode: "toPointAndStopWithDiscontinuityCurvature",
      turnDampingDist: 0.2,
      useStraightLine: true,
      useGlobalHeight: true,
      useGlobalSpeed: true,
      useGlobalHeadingParam: true,
      useGlobalTurnParam: true,
      actions: [createAction("takePhoto")],
    },
    {
      id: "wp-1",
      name: "Mid",
      description: "",
      coordinates: [151.2008, -33.9],
      height: 80,
      speed: 10,
      headingMode: "followWayline",
      headingAngle: 0,
      turnMode: "coordinateTurn",
      turnDampingDist: 0.2,
      useStraightLine: true,
      useGlobalHeight: false,
      useGlobalSpeed: true,
      useGlobalHeadingParam: true,
      useGlobalTurnParam: true,
      actions: [createAction("hover"), createAction("gimbalRotate")],
    },
    {
      id: "wp-2",
      name: "End",
      description: "",
      coordinates: [151.2004, -33.8996],
      height: 100,
      speed: 10,
      headingMode: "followWayline",
      headingAngle: 0,
      turnMode: "toPointAndStopWithDiscontinuityCurvature",
      turnDampingDist: 0.2,
      useStraightLine: true,
      useGlobalHeight: false,
      useGlobalSpeed: true,
      useGlobalHeadingParam: true,
      useGlobalTurnParam: true,
      actions: [],
    },
  ];
}

describe("buildWaypointTemplateKml", () => {
  it("emits waypoint template type", () => {
    const kml = buildWaypointTemplateKml(makeWaypoints(), DEFAULT_WAYPOINT_PARAMS, camera);
    expect(kml).toContain("<wpml:templateType>waypoint</wpml:templateType>");
  });

  it("includes global waypoint heading and turn params", () => {
    const kml = buildWaypointTemplateKml(makeWaypoints(), DEFAULT_WAYPOINT_PARAMS, camera);
    expect(kml).toContain("<wpml:globalWaypointHeadingParam>");
    expect(kml).toContain("<wpml:globalWaypointTurnMode>");
    expect(kml).toContain("<wpml:globalWaypointTurnMode>");
  });

  it("includes useGlobalHeight when set", () => {
    const kml = buildWaypointTemplateKml(makeWaypoints(), DEFAULT_WAYPOINT_PARAMS, camera);
    expect(kml).toContain("<wpml:useGlobalHeight>1</wpml:useGlobalHeight>");
  });

  it("omits useGlobalHeight when overridden", () => {
    const wps = makeWaypoints();
    const kml = buildWaypointTemplateKml(wps, DEFAULT_WAYPOINT_PARAMS, camera);
    const placemarks = kml.split("<Placemark>");
    const wp2 = placemarks[2];
    expect(wp2).not.toContain("useGlobalHeight");
  });

  it("includes payloadParam", () => {
    const kml = buildWaypointTemplateKml(makeWaypoints(), DEFAULT_WAYPOINT_PARAMS, camera);
    expect(kml).toContain("<wpml:payloadParam>");
    expect(kml).toContain("<wpml:imageFormat>visible</wpml:imageFormat>");
  });

  it("includes missionConfig", () => {
    const kml = buildWaypointTemplateKml(makeWaypoints(), DEFAULT_WAYPOINT_PARAMS, camera);
    expect(kml).toContain("<wpml:missionConfig>");
    expect(kml).toContain("<wpml:droneEnumValue>100</wpml:droneEnumValue>");
  });

  it("includes action groups in template.kml placemarks", () => {
    const kml = buildWaypointTemplateKml(makeWaypoints(), DEFAULT_WAYPOINT_PARAMS, camera);
    expect(kml).toContain("<wpml:actionGroup>");
    expect(kml).toContain("<wpml:actionActuatorFunc>takePhoto</wpml:actionActuatorFunc>");
    expect(kml).toContain("<wpml:actionTriggerType>reachPoint</wpml:actionTriggerType>");
  });

  it("does not include action groups for waypoints with no actions", () => {
    const kml = buildWaypointTemplateKml(makeWaypoints(), DEFAULT_WAYPOINT_PARAMS, camera);
    const placemarks = kml.split("<Placemark>");
    const lastWp = placemarks[placemarks.length - 1];
    expect(lastWp).not.toContain("<wpml:actionGroup>");
  });
});

describe("buildWaypointWaylinesWpml", () => {
  it("generates wpml with action groups for waypoint actions", () => {
    const { wpml } = buildWaypointWaylinesWpml(makeWaypoints(), DEFAULT_WAYPOINT_PARAMS, camera);
    expect(wpml).toContain("<wpml:actionActuatorFunc>takePhoto</wpml:actionActuatorFunc>");
    expect(wpml).toContain("<wpml:actionActuatorFunc>hover</wpml:actionActuatorFunc>");
    expect(wpml).toContain("<wpml:actionActuatorFunc>gimbalRotate</wpml:actionActuatorFunc>");
  });

  it("uses reachPoint trigger for waypoint actions", () => {
    const { wpml } = buildWaypointWaylinesWpml(makeWaypoints(), DEFAULT_WAYPOINT_PARAMS, camera);
    expect(wpml).toContain("<wpml:actionTriggerType>reachPoint</wpml:actionTriggerType>");
  });

  it("computes totalDistanceM > 0", () => {
    const { totalDistanceM } = buildWaypointWaylinesWpml(makeWaypoints(), DEFAULT_WAYPOINT_PARAMS, camera);
    expect(totalDistanceM).toBeGreaterThan(0);
  });

  it("generates no action groups for waypoints with no actions", () => {
    const { wpml } = buildWaypointWaylinesWpml(makeWaypoints(), DEFAULT_WAYPOINT_PARAMS, camera);
    const placemarks = wpml.split("<Placemark>");
    const lastWp = placemarks[placemarks.length - 1];
    expect(lastWp).not.toContain("<wpml:actionGroup>");
  });

  it("includes missionConfig in wpml", () => {
    const { wpml } = buildWaypointWaylinesWpml(makeWaypoints(), DEFAULT_WAYPOINT_PARAMS, camera);
    expect(wpml).toContain("<wpml:missionConfig>");
    expect(wpml).toContain("<wpml:finishAction>goHome</wpml:finishAction>");
  });
});

describe("reachPoint action grouping", () => {
  it("groups multiple reachPoint actions into one actionGroup per waypoint", () => {
    const wps: Waypoint[] = [{
      id: "wp-0",
      name: "Test",
      description: "",
      coordinates: [151.2, -33.9],
      height: 80,
      speed: 10,
      headingMode: "followWayline",
      headingAngle: 0,
      turnMode: "toPointAndStopWithDiscontinuityCurvature",
      turnDampingDist: 0.2,
      useStraightLine: true,
      useGlobalHeight: true,
      useGlobalSpeed: true,
      useGlobalHeadingParam: true,
      useGlobalTurnParam: true,
      actions: [
        createAction("takePhoto"),
        createAction("hover"),
        createAction("gimbalRotate"),
      ],
    }];

    const { wpml } = buildWaypointWaylinesWpml(wps, DEFAULT_WAYPOINT_PARAMS, camera);
    const actionGroupMatches = wpml.match(/<wpml:actionGroup>/g) ?? [];
    expect(actionGroupMatches).toHaveLength(1);

    expect(wpml).toContain("<wpml:actionId>0</wpml:actionId>");
    expect(wpml).toContain("<wpml:actionId>1</wpml:actionId>");
    expect(wpml).toContain("<wpml:actionId>2</wpml:actionId>");

    expect(wpml).toContain("<wpml:actionTriggerType>reachPoint</wpml:actionTriggerType>");
    expect(wpml).not.toContain("<wpml:actionTriggerParam>");
  });
});

describe("interval trigger action groups", () => {
  it("emits timedIntervalShot as separate actionGroup with multipleTiming trigger", () => {
    const wps: Waypoint[] = [{
      id: "wp-0",
      name: "Test",
      description: "",
      coordinates: [151.2, -33.9],
      height: 80,
      speed: 10,
      headingMode: "followWayline",
      headingAngle: 0,
      turnMode: "toPointAndStopWithDiscontinuityCurvature",
      turnDampingDist: 0.2,
      useStraightLine: true,
      useGlobalHeight: true,
      useGlobalSpeed: true,
      useGlobalHeadingParam: true,
      useGlobalTurnParam: true,
      actions: [
        createAction("takePhoto"),
        createAction("timedIntervalShot"),
      ],
    }];

    const { wpml } = buildWaypointWaylinesWpml(wps, DEFAULT_WAYPOINT_PARAMS, camera);
    const actionGroupMatches = wpml.match(/<wpml:actionGroup>/g) ?? [];
    expect(actionGroupMatches).toHaveLength(2);

    expect(wpml).toContain("<wpml:actionTriggerType>reachPoint</wpml:actionTriggerType>");
    expect(wpml).toContain("<wpml:actionTriggerType>multipleTiming</wpml:actionTriggerType>");
    expect(wpml).toContain("<wpml:actionTriggerParam>3</wpml:actionTriggerParam>");
  });

  it("emits distanceIntervalShot as separate actionGroup with multipleDistance trigger", () => {
    const wps: Waypoint[] = [{
      id: "wp-0",
      name: "Test",
      description: "",
      coordinates: [151.2, -33.9],
      height: 80,
      speed: 10,
      headingMode: "followWayline",
      headingAngle: 0,
      turnMode: "toPointAndStopWithDiscontinuityCurvature",
      turnDampingDist: 0.2,
      useStraightLine: true,
      useGlobalHeight: true,
      useGlobalSpeed: true,
      useGlobalHeadingParam: true,
      useGlobalTurnParam: true,
      actions: [
        createAction("distanceIntervalShot"),
      ],
    }];

    const { wpml } = buildWaypointWaylinesWpml(wps, DEFAULT_WAYPOINT_PARAMS, camera);
    expect(wpml).toContain("<wpml:actionTriggerType>multipleDistance</wpml:actionTriggerType>");
    expect(wpml).toContain("<wpml:actionTriggerParam>10</wpml:actionTriggerParam>");
    expect(wpml).toContain("<wpml:actionActuatorFunc>takePhoto</wpml:actionActuatorFunc>");
  });

  it("does not emit XML for endIntervalShot", () => {
    const wps: Waypoint[] = [{
      id: "wp-0",
      name: "Test",
      description: "",
      coordinates: [151.2, -33.9],
      height: 80,
      speed: 10,
      headingMode: "followWayline",
      headingAngle: 0,
      turnMode: "toPointAndStopWithDiscontinuityCurvature",
      turnDampingDist: 0.2,
      useStraightLine: true,
      useGlobalHeight: true,
      useGlobalSpeed: true,
      useGlobalHeadingParam: true,
      useGlobalTurnParam: true,
      actions: [
        createAction("endIntervalShot"),
      ],
    }];

    const { wpml } = buildWaypointWaylinesWpml(wps, DEFAULT_WAYPOINT_PARAMS, camera);
    const actionGroupMatches = wpml.match(/<wpml:actionGroup>/g) ?? [];
    expect(actionGroupMatches).toHaveLength(0);
  });
});

describe("both lens expansion", () => {
  it("expands a 'both' lens takePhoto into two XML actions", () => {
    const action = createAction("takePhoto", { payloadLensIndex: "both" });
    const wps: Waypoint[] = [{
      id: "wp-0",
      name: "Test",
      description: "",
      coordinates: [151.2, -33.9],
      height: 80,
      speed: 10,
      headingMode: "followWayline",
      headingAngle: 0,
      turnMode: "toPointAndStopWithDiscontinuityCurvature",
      turnDampingDist: 0.2,
      useStraightLine: true,
      useGlobalHeight: true,
      useGlobalSpeed: true,
      useGlobalHeadingParam: true,
      useGlobalTurnParam: true,
      actions: [action],
    }];

    const { wpml } = buildWaypointWaylinesWpml(wps, DEFAULT_WAYPOINT_PARAMS, camera);
    const takePhotoMatches = wpml.match(/<wpml:actionActuatorFunc>takePhoto<\/wpml:actionActuatorFunc>/g) ?? [];
    expect(takePhotoMatches).toHaveLength(2);

    expect(wpml).toContain("<wpml:payloadLensIndex>visable</wpml:payloadLensIndex>");
    expect(wpml).toContain("<wpml:payloadLensIndex>ir</wpml:payloadLensIndex>");

    expect(wpml).toContain("<wpml:actionId>0</wpml:actionId>");
    expect(wpml).toContain("<wpml:actionId>1</wpml:actionId>");
  });

  it("expands both lens on interval shot into two XML actions", () => {
    const action = createAction("timedIntervalShot", { payloadLensIndex: "both" });
    const wps: Waypoint[] = [{
      id: "wp-0",
      name: "Test",
      description: "",
      coordinates: [151.2, -33.9],
      height: 80,
      speed: 10,
      headingMode: "followWayline",
      headingAngle: 0,
      turnMode: "toPointAndStopWithDiscontinuityCurvature",
      turnDampingDist: 0.2,
      useStraightLine: true,
      useGlobalHeight: true,
      useGlobalSpeed: true,
      useGlobalHeadingParam: true,
      useGlobalTurnParam: true,
      actions: [action],
    }];

    const { wpml } = buildWaypointWaylinesWpml(wps, DEFAULT_WAYPOINT_PARAMS, camera);
    const takePhotoMatches = wpml.match(/<wpml:actionActuatorFunc>takePhoto<\/wpml:actionActuatorFunc>/g) ?? [];
    expect(takePhotoMatches).toHaveLength(2);
    expect(wpml).toContain("<wpml:actionTriggerType>multipleTiming</wpml:actionTriggerType>");
  });
});

describe("global actionGroupId", () => {
  it("increments actionGroupId globally across all waypoints", () => {
    const wps: Waypoint[] = [
      {
        id: "wp-0",
        name: "A",
        description: "",
        coordinates: [151.2, -33.9],
        height: 80,
        speed: 10,
        headingMode: "followWayline",
        headingAngle: 0,
        turnMode: "toPointAndStopWithDiscontinuityCurvature",
        turnDampingDist: 0.2,
        useStraightLine: true,
        useGlobalHeight: true,
        useGlobalSpeed: true,
        useGlobalHeadingParam: true,
        useGlobalTurnParam: true,
        actions: [
          createAction("takePhoto"),
          createAction("timedIntervalShot"),
        ],
      },
      {
        id: "wp-1",
        name: "B",
        description: "",
        coordinates: [151.2008, -33.9],
        height: 80,
        speed: 10,
        headingMode: "followWayline",
        headingAngle: 0,
        turnMode: "coordinateTurn",
        turnDampingDist: 0.2,
        useStraightLine: true,
        useGlobalHeight: true,
        useGlobalSpeed: true,
        useGlobalHeadingParam: true,
        useGlobalTurnParam: true,
        actions: [
          createAction("hover"),
          createAction("distanceIntervalShot"),
        ],
      },
    ];

    const { wpml } = buildWaypointWaylinesWpml(wps, DEFAULT_WAYPOINT_PARAMS, camera);

    const agIds = [...wpml.matchAll(/<wpml:actionGroupId>(\d+)<\/wpml:actionGroupId>/g)]
      .map((m) => Number(m[1]));

    expect(agIds).toEqual([0, 1, 2, 3]);
  });
});
