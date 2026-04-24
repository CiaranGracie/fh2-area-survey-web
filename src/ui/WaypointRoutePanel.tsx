import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CAMERAS, getPayloadOptions, resolveCameraPayload } from "../domain/cameras";
import { DEFAULT_WAYPOINT_PARAMS } from "../domain/defaults";
import { getActionLabel } from "../domain/actions";
import type {
  Waypoint,
  WaypointHeadingMode,
  WaypointHeadingPathMode,
  WaypointRouteParams,
  WaypointRouteResult,
  WaypointTurnMode,
} from "../domain/types";
import { parseKmlOrKmzFileMulti } from "../io/kml";
import type { KmlPoint } from "../io/kml";
import { createWaypointsFromPoints, generateWaypointRoute } from "../mission/generateWaypointRoute";
import { buildKmzBlob, triggerBlobDownload } from "../io/kmzWriter";
import { optimizeRouteOrder } from "../geo/tsp";
import { WaypointActionEditor } from "./WaypointActionEditor";

interface Props {
  onWaypointsLoaded: (waypoints: Waypoint[]) => void;
  onResultGenerated: (result: WaypointRouteResult) => void;
  selectedWpId: string | null;
  onSelectedWpChange: (id: string | null) => void;
  detailPortalTarget: HTMLDivElement | null;
  importedWaypoints?: Waypoint[] | null;
}

const TURN_MODE_OPTIONS: { value: WaypointTurnMode; label: string }[] = [
  { value: "toPointAndStopWithDiscontinuityCurvature", label: "Stop, sharp corners" },
  { value: "coordinateTurn", label: "Coordinated turn" },
  { value: "toPointAndStopWithContinuityCurvature", label: "Stop, smooth curves" },
  { value: "toPointAndPassWithContinuityCurvature", label: "Fly-through, smooth" },
];

const HEADING_MODE_OPTIONS: { value: WaypointHeadingMode; label: string }[] = [
  { value: "followWayline", label: "Along Route" },
  { value: "fixed", label: "Fixed heading" },
  { value: "manually", label: "Manual control" },
  { value: "smoothTransition", label: "Smooth transition" },
  { value: "towardPOI", label: "Toward POI" },
];

const HEADING_PATH_OPTIONS: { value: WaypointHeadingPathMode; label: string }[] = [
  { value: "followBadArc", label: "Follow (DJI default)" },
  { value: "clockwise", label: "Clockwise" },
  { value: "counterClockwise", label: "Counter-clockwise" },
];

export function WaypointRoutePanel({
  onWaypointsLoaded,
  onResultGenerated,
  selectedWpId,
  onSelectedWpChange,
  detailPortalTarget,
  importedWaypoints,
}: Props) {
  const [params, setParams] = useState<WaypointRouteParams>(DEFAULT_WAYPOINT_PARAMS);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [result, setResult] = useState<WaypointRouteResult | null>(null);
  const [kmlFile, setKmlFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Load a KML/KMZ with point features.");
  const [downloadName, setDownloadName] = useState("fh2_waypoint.kmz");
  const selectedCamera = CAMERAS[params.cameraKey];
  const effectiveCamera = selectedCamera
    ? resolveCameraPayload(selectedCamera, params.selectedPayloadKey)
    : undefined;
  const payloadOptions = selectedCamera ? getPayloadOptions(selectedCamera) : [];

  useEffect(() => {
    if (!importedWaypoints) return;
    setWaypoints(importedWaypoints);
    setResult(null);
    setMessage(`Loaded ${importedWaypoints.length} imported waypoints.`);
    onSelectedWpChange(importedWaypoints.length > 0 ? importedWaypoints[0].id : null);
  }, [importedWaypoints, onSelectedWpChange]);

  const onLoadPoints = async () => {
    if (!kmlFile) {
      setMessage("Select a KML or KMZ file first.");
      return;
    }
    try {
      setBusy(true);
      const parsed = await parseKmlOrKmzFileMulti(kmlFile);
      let points: KmlPoint[];
      if (parsed.type === "points") {
        points = parsed.points;
      } else if (parsed.type === "both") {
        points = parsed.points;
      } else {
        setMessage("This KML contains a polygon but no waypoints. Use Area Survey mode.");
        return;
      }

      const wps = createWaypointsFromPoints(points, params);
      setWaypoints(wps);
      setResult(null);
      onSelectedWpChange(null);
      onWaypointsLoaded(wps);
      setMessage(`Loaded ${wps.length} waypoints.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to parse KML/KMZ.");
    } finally {
      setBusy(false);
    }
  };

  const updateWaypoint = (id: string, patch: Partial<Waypoint>) => {
    setWaypoints((prev) =>
      prev.map((wp) => (wp.id === id ? { ...wp, ...patch } : wp)),
    );
  };

  const moveWaypoint = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= waypoints.length) return;
    setWaypoints((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const removeWaypoint = (index: number) => {
    setWaypoints((prev) => prev.filter((_, i) => i !== index));
  };

  const onOptimiseOrder = () => {
    if (waypoints.length < 3) return;
    const coords = waypoints.map((wp) => wp.coordinates);
    const order = optimizeRouteOrder(coords);
    const reordered = order.map((i) => waypoints[i]);
    setWaypoints(reordered);
    onSelectedWpChange(null);
    setResult(null);
    onWaypointsLoaded(reordered);
    setMessage(`Route optimised — ${reordered.length} waypoints reordered.`);
  };

  const onGenerate = () => {
    if (waypoints.length === 0) {
      setMessage("Load waypoints first.");
      return;
    }
    try {
      setBusy(true);
      const res = generateWaypointRoute(waypoints, params);
      setResult(res);
      onResultGenerated(res);
      setMessage(`Generated route with ${waypoints.length} waypoints.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setBusy(false);
    }
  };

  const onDownloadKmz = async () => {
    if (!result) {
      setMessage("Generate a route first.");
      return;
    }
    const blob = await buildKmzBlob(result.templateKml, result.wpml);
    triggerBlobDownload(blob, downloadName || "fh2_waypoint.kmz");
    setMessage(`Downloaded ${downloadName || "fh2_waypoint.kmz"}.`);
  };

  const selectedWp = waypoints.find((w) => w.id === selectedWpId) ?? null;
  const selectedWpIndex = selectedWp ? waypoints.indexOf(selectedWp) : -1;

  return (
    <>
      <aside className="panel controls">
        <h2>Waypoint Route</h2>

        <label>
          Waypoint KML/KMZ
          <input
            type="file"
            accept=".kml,.kmz"
            onChange={(e) => setKmlFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <button className="btn btn-primary btn-cta" onClick={onLoadPoints} disabled={busy}>
          Load Waypoints
        </button>

        <h3>Settings</h3>
        <div className="control-group grid2">
          <label>
            Camera
            <select
              value={params.cameraKey}
              onChange={(e) =>
                setParams((p) => {
                  const nextCamera = CAMERAS[e.target.value];
                  const nextPayload = nextCamera && nextCamera.supportsPayloadSwap
                    ? (getPayloadOptions(nextCamera)[0]?.name ?? p.selectedPayloadKey)
                    : undefined;
                  return { ...p, cameraKey: e.target.value, selectedPayloadKey: nextPayload };
                })
              }
            >
              {Object.keys(CAMERAS).map((key) => (
                <option key={key} value={key}>{key}</option>
              ))}
            </select>
          </label>
          {selectedCamera?.supportsPayloadSwap && (
            <label>
              Payload
              <select
                value={params.selectedPayloadKey ?? payloadOptions[0]?.name ?? ""}
                onChange={(e) => setParams((p) => ({ ...p, selectedPayloadKey: e.target.value }))}
              >
                {payloadOptions.map((option) => (
                  <option key={option.name} value={option.name}>{option.name}</option>
                ))}
              </select>
            </label>
          )}
          <label>
            Height mode
            <select
              value={params.heightMode}
              onChange={(e) =>
                setParams((p) => ({ ...p, heightMode: e.target.value as WaypointRouteParams["heightMode"] }))
              }
            >
              <option value="aboveGroundLevel">AGL</option>
              <option value="EGM96">ASL</option>
              <option value="relativeToStartPoint">ALT</option>
            </select>
          </label>
          <label>
            Default height (m)
            <input
              type="number"
              value={params.defaultHeight}
              onChange={(e) => {
                const v = Number(e.target.value) || 0;
                setParams((p) => ({ ...p, defaultHeight: v }));
                setWaypoints((prev) =>
                  prev.map((wp) => wp.useGlobalHeight ? { ...wp, height: v } : wp),
                );
              }}
            />
          </label>
          <label>
            Default speed (m/s)
            <input
              type="number"
              value={params.defaultSpeed}
              onChange={(e) => {
                const v = Number(e.target.value) || 0;
                setParams((p) => ({ ...p, defaultSpeed: v }));
                setWaypoints((prev) =>
                  prev.map((wp) => wp.useGlobalSpeed ? { ...wp, speed: v } : wp),
                );
              }}
            />
          </label>
          <label>
            Heading mode
            <select
              value={params.defaultHeadingMode}
              onChange={(e) =>
                setParams((p) => ({ ...p, defaultHeadingMode: e.target.value as WaypointHeadingMode }))
              }
            >
              {HEADING_MODE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label>
            Heading path
            <select
              value={params.defaultHeadingPathMode}
              onChange={(e) =>
                setParams((p) => ({ ...p, defaultHeadingPathMode: e.target.value as WaypointHeadingPathMode }))
              }
            >
              {HEADING_PATH_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label>
            Gimbal control
            <select
              value={params.gimbalPitchMode}
              onChange={(e) =>
                setParams((p) => ({ ...p, gimbalPitchMode: e.target.value as WaypointRouteParams["gimbalPitchMode"] }))
              }
            >
              <option value="manual">Manual</option>
              <option value="usePointSetting">Per-waypoint</option>
            </select>
          </label>
          <label>
            Turn mode
            <select
              value={params.defaultTurnMode}
              onChange={(e) => {
                const v = e.target.value as WaypointTurnMode;
                setParams((p) => ({ ...p, defaultTurnMode: v }));
                setWaypoints((prev) =>
                  prev.map((wp) => wp.useGlobalTurnParam ? { ...wp, turnMode: v } : wp),
                );
              }}
            >
              {TURN_MODE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        </div>

        <h3>Safety</h3>
        <div className="control-group grid2">
          <label>
            Takeoff height (m)
            <input
              type="number"
              value={params.takeoffHeightM}
              onChange={(e) => setParams((p) => ({ ...p, takeoffHeightM: Number(e.target.value) || 0 }))}
            />
          </label>
          <label>
            RTH height (m)
            <input
              type="number"
              value={params.rthHeightM}
              onChange={(e) => setParams((p) => ({ ...p, rthHeightM: Number(e.target.value) || 0 }))}
            />
          </label>
          <label>
            Upon completion
            <select
              value={params.finishAction}
              onChange={(e) =>
                setParams((p) => ({ ...p, finishAction: e.target.value as WaypointRouteParams["finishAction"] }))
              }
            >
              <option value="goHome">Go Home</option>
              <option value="autoLand">Auto Land</option>
              <option value="goContinue">Continue</option>
              <option value="noAction">No Action</option>
            </select>
          </label>
          <label>
            Transit speed (m/s)
            <input
              type="number"
              value={params.transitSpeedMps}
              onChange={(e) => setParams((p) => ({ ...p, transitSpeedMps: Number(e.target.value) || 0 }))}
            />
          </label>
          <label className="toggle-label">
            Obstacle bypass
            <input
              type="checkbox"
              checked={params.obstacleBypass}
              onChange={(e) => setParams((p) => ({ ...p, obstacleBypass: e.target.checked }))}
            />
          </label>
          <label className="toggle-label">
            Geozone bypass
            <input
              type="checkbox"
              checked={params.geozoneBypass}
              onChange={(e) => setParams((p) => ({ ...p, geozoneBypass: e.target.checked }))}
            />
          </label>
          <label>
            RC signal lost
            <select
              value={params.exitOnRCLost}
              onChange={(e) =>
                setParams((p) => ({ ...p, exitOnRCLost: e.target.value as WaypointRouteParams["exitOnRCLost"] }))
              }
            >
              <option value="goContinue">Continue Mission</option>
              <option value="executeLostAction">Execute Lost Action</option>
            </select>
          </label>
          {params.exitOnRCLost === "executeLostAction" && (
            <label>
              Lost action
              <select
                value={params.executeRCLostAction}
                onChange={(e) =>
                  setParams((p) => ({
                    ...p,
                    executeRCLostAction: e.target.value as WaypointRouteParams["executeRCLostAction"],
                  }))
                }
              >
                <option value="goBack">Go Back</option>
                <option value="landing">Land</option>
                <option value="hover">Hover</option>
              </select>
            </label>
          )}
        </div>

        <button className="btn btn-primary btn-cta" onClick={onGenerate} disabled={busy || waypoints.length === 0}>
          {busy ? "Working..." : "Generate Route"}
        </button>

        <h3>Export</h3>
        <div className="control-group">
          <label>
            Output filename
            <input
              value={downloadName}
              onChange={(e) => setDownloadName(e.target.value)}
            />
          </label>
          <button
            className="btn btn-primary btn-cta"
            onClick={onDownloadKmz}
            disabled={!result || busy}
          >
            Download KMZ
          </button>
        </div>

        <div className="message">{message}</div>
      </aside>

      {detailPortalTarget && createPortal(
        <section className="wp-workspace controls">
          <div className="wp-workspace-header">
            <h3>Waypoints ({waypoints.length})</h3>
            {waypoints.length >= 3 && (
              <button
                className="btn btn-secondary btn-optimise"
                onClick={onOptimiseOrder}
              >
                Optimise Order
              </button>
            )}
          </div>

          <div className="wp-workspace-body">
            <div className="wp-workspace-list-col">
              <div className="waypoint-list">
                {waypoints.length === 0 && (
                  <p className="stats-empty">No waypoints loaded.</p>
                )}
                {waypoints.map((wp, i) => {
                  const isSelected = selectedWpId === wp.id;
                  return (
                    <div key={wp.id} className={`waypoint-card ${isSelected ? "expanded" : ""}`}>
                      <div
                        className="waypoint-card-header"
                        onClick={() => onSelectedWpChange(isSelected ? null : wp.id)}
                      >
                        <span className="waypoint-index">{i + 1}</span>
                        <span className="waypoint-name">{wp.name}</span>
                        {wp.actions.length > 0 && (
                          <span className="waypoint-actions-count">
                            {wp.actions.length} action{wp.actions.length > 1 ? "s" : ""}
                          </span>
                        )}
                        <div className="waypoint-card-controls">
                          <button
                            className="btn btn-secondary action-move-btn"
                            onClick={(e) => { e.stopPropagation(); moveWaypoint(i, -1); }}
                            disabled={i === 0}
                          >^</button>
                          <button
                            className="btn btn-secondary action-move-btn"
                            onClick={(e) => { e.stopPropagation(); moveWaypoint(i, 1); }}
                            disabled={i === waypoints.length - 1}
                          >v</button>
                          <button
                            className="btn btn-secondary action-remove-btn"
                            onClick={(e) => { e.stopPropagation(); removeWaypoint(i); }}
                          >x</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {selectedWp ? (
              <div className="wp-workspace-detail-col" key={selectedWp.id}>
                <div className="wp-detail-header">
                  <span className="wp-detail-title">
                    <span className="waypoint-index">{selectedWpIndex + 1}</span>
                    {selectedWp.name}
                  </span>
                  <button
                    className="btn btn-secondary action-remove-btn"
                    onClick={() => onSelectedWpChange(null)}
                    title="Close"
                  >x</button>
                </div>

                <div className="wp-detail-columns">
                  <div className="wp-detail-settings">
                    <h4>Flight Settings</h4>
                    <div className="grid2">
                      <label>
                        Heading mode
                        <select
                          value={selectedWp.headingMode}
                          onChange={(e) =>
                            updateWaypoint(selectedWp.id, {
                              headingMode: e.target.value as WaypointHeadingMode,
                              useGlobalHeadingParam: false,
                            })
                          }
                        >
                          {HEADING_MODE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </label>
                      {(selectedWp.headingMode === "fixed" || selectedWp.headingMode === "smoothTransition") && (
                        <label>
                          Heading angle
                          <input
                            type="number"
                            min={0}
                            max={360}
                            value={selectedWp.headingAngle}
                            onChange={(e) =>
                              updateWaypoint(selectedWp.id, {
                                headingAngle: Number(e.target.value) || 0,
                                useGlobalHeadingParam: false,
                              })
                            }
                          />
                        </label>
                      )}
                      {(selectedWp.headingMode === "fixed" || selectedWp.headingMode === "smoothTransition") && (
                        <label>
                          Heading path
                          <select
                            value={selectedWp.headingPathMode ?? params.defaultHeadingPathMode}
                            onChange={(e) =>
                              updateWaypoint(selectedWp.id, {
                                headingPathMode: e.target.value as WaypointHeadingPathMode,
                                useGlobalHeadingParam: false,
                              })
                            }
                          >
                            {HEADING_PATH_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        </label>
                      )}
                      {selectedWp.headingMode === "towardPOI" && (
                        <>
                          <label>
                            POI latitude
                            <input
                              type="number"
                              value={selectedWp.poiPoint?.[0] ?? 0}
                              onChange={(e) => {
                                const lat = Number(e.target.value) || 0;
                                const poi = selectedWp.poiPoint ?? [0, 0, 0];
                                updateWaypoint(selectedWp.id, {
                                  poiPoint: [lat, poi[1], poi[2]],
                                  headingPathMode: selectedWp.headingPathMode ?? params.defaultHeadingPathMode,
                                });
                              }}
                            />
                          </label>
                          <label>
                            POI longitude
                            <input
                              type="number"
                              value={selectedWp.poiPoint?.[1] ?? 0}
                              onChange={(e) => {
                                const lon = Number(e.target.value) || 0;
                                const poi = selectedWp.poiPoint ?? [0, 0, 0];
                                updateWaypoint(selectedWp.id, {
                                  poiPoint: [poi[0], lon, poi[2]],
                                  headingPathMode: selectedWp.headingPathMode ?? params.defaultHeadingPathMode,
                                });
                              }}
                            />
                          </label>
                        </>
                      )}
                      <label className="toggle-label">
                        Straight line
                        <input
                          type="checkbox"
                          checked={selectedWp.useStraightLine}
                          onChange={(e) => updateWaypoint(selectedWp.id, { useStraightLine: e.target.checked })}
                        />
                      </label>
                    </div>

                    <div className="wp-overrides">
                      <div className="wp-override-row">
                        <label className="toggle-label">
                          Custom height
                          <input
                            type="checkbox"
                            checked={!selectedWp.useGlobalHeight}
                            onChange={(e) => {
                              if (e.target.checked) {
                                updateWaypoint(selectedWp.id, { useGlobalHeight: false });
                              } else {
                                updateWaypoint(selectedWp.id, {
                                  height: params.defaultHeight,
                                  useGlobalHeight: true,
                                });
                              }
                            }}
                          />
                        </label>
                        {selectedWp.useGlobalHeight ? (
                          <span className="wp-override-default">{params.defaultHeight} m (default)</span>
                        ) : (
                          <input
                            type="number"
                            className="wp-override-input"
                            value={selectedWp.height}
                            onChange={(e) =>
                              updateWaypoint(selectedWp.id, {
                                height: Number(e.target.value) || 0,
                                useGlobalHeight: false,
                              })
                            }
                          />
                        )}
                      </div>

                      <div className="wp-override-row">
                        <label className="toggle-label">
                          Custom speed
                          <input
                            type="checkbox"
                            checked={!selectedWp.useGlobalSpeed}
                            onChange={(e) => {
                              if (e.target.checked) {
                                updateWaypoint(selectedWp.id, { useGlobalSpeed: false });
                              } else {
                                updateWaypoint(selectedWp.id, {
                                  speed: params.defaultSpeed,
                                  useGlobalSpeed: true,
                                });
                              }
                            }}
                          />
                        </label>
                        {selectedWp.useGlobalSpeed ? (
                          <span className="wp-override-default">{params.defaultSpeed} m/s (default)</span>
                        ) : (
                          <input
                            type="number"
                            className="wp-override-input"
                            value={selectedWp.speed}
                            onChange={(e) =>
                              updateWaypoint(selectedWp.id, {
                                speed: Number(e.target.value) || 0,
                                useGlobalSpeed: false,
                              })
                            }
                          />
                        )}
                      </div>

                      <div className="wp-override-row">
                        <label className="toggle-label">
                          Custom turn mode
                          <input
                            type="checkbox"
                            checked={!selectedWp.useGlobalTurnParam}
                            onChange={(e) => {
                              if (e.target.checked) {
                                updateWaypoint(selectedWp.id, { useGlobalTurnParam: false });
                              } else {
                                updateWaypoint(selectedWp.id, {
                                  turnMode: params.defaultTurnMode,
                                  useGlobalTurnParam: true,
                                });
                              }
                            }}
                          />
                        </label>
                        {selectedWp.useGlobalTurnParam ? (
                          <span className="wp-override-default">
                            {TURN_MODE_OPTIONS.find((o) => o.value === params.defaultTurnMode)?.label ?? params.defaultTurnMode} (default)
                          </span>
                        ) : (
                          <>
                            <select
                              className="wp-override-input"
                              value={selectedWp.turnMode}
                              onChange={(e) =>
                                updateWaypoint(selectedWp.id, {
                                  turnMode: e.target.value as WaypointTurnMode,
                                  useGlobalTurnParam: false,
                                })
                              }
                            >
                              {TURN_MODE_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                            {selectedWp.turnMode === "coordinateTurn" && (
                              <input
                                type="number"
                                className="wp-override-input"
                                min={0.2}
                                step={0.1}
                                value={selectedWp.turnDampingDist}
                                onChange={(e) =>
                                  updateWaypoint(selectedWp.id, {
                                    turnDampingDist: Number(e.target.value) || 0.2,
                                    useGlobalTurnParam: false,
                                  })
                                }
                                placeholder="Damping (m)"
                              />
                            )}
                          </>
                        )}
                      </div>
                      {selectedWp.turnMode === "coordinateTurn" && selectedWpIndex >= 0 && selectedWpIndex < waypoints.length - 1 && (
                        <p className="stats-empty">
                          {(() => {
                            const next = waypoints[selectedWpIndex + 1];
                            if (!next) return "Coordinate turn enabled.";
                            const dLat = next.coordinates[1] - selectedWp.coordinates[1];
                            const dLon = next.coordinates[0] - selectedWp.coordinates[0];
                            const latRad = (selectedWp.coordinates[1] * Math.PI) / 180;
                            const distance = Math.hypot(
                              dLon * (Math.PI / 180) * 6371000 * Math.cos(latRad),
                              dLat * (Math.PI / 180) * 6371000,
                            );
                            return distance <= selectedWp.turnDampingDist * 2
                              ? "Warning: segment distance may be too short for this damping value."
                              : "Coordinate turn damping is valid for next segment.";
                          })()}
                        </p>
                      )}
                      {params.gimbalPitchMode === "usePointSetting" && (
                        <div className="grid2">
                          <label>
                            Gimbal pitch
                            <input
                              type="number"
                              value={selectedWp.gimbalPitchAngle ?? -90}
                              onChange={(e) =>
                                updateWaypoint(selectedWp.id, {
                                  gimbalPitchAngle: Number(e.target.value) || -90,
                                })
                              }
                            />
                          </label>
                          <label>
                            Gimbal yaw
                            <input
                              type="number"
                              value={selectedWp.gimbalYawAngle ?? 0}
                              onChange={(e) =>
                                updateWaypoint(selectedWp.id, {
                                  gimbalYawAngle: Number(e.target.value) || 0,
                                })
                              }
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="wp-detail-actions">
                    <h4>Actions</h4>
                    {selectedWp.actions.length > 0 && (
                      <div className="waypoint-action-summary">
                        {selectedWp.actions.map((a, ai) => (
                          <span key={a.id} className="action-badge">
                            {ai + 1}. {getActionLabel(a.type)}
                          </span>
                        ))}
                      </div>
                    )}
                    <WaypointActionEditor
                      actions={selectedWp.actions}
                      onChange={(actions) => updateWaypoint(selectedWp.id, { actions })}
                      payloadEnum={effectiveCamera?.payloadEnum ?? 98}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="wp-workspace-empty-col">
                <div className="wp-workspace-empty-icon">&#9673;</div>
                <p>Select a waypoint to configure</p>
              </div>
            )}
          </div>
        </section>,
        detailPortalTarget,
      )}
    </>
  );
}
