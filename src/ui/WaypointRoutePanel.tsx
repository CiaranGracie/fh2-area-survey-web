import { useRef, useState } from "react";
import { CAMERAS } from "../domain/cameras";
import { DEFAULT_WAYPOINT_PARAMS } from "../domain/defaults";
import { getActionLabel } from "../domain/actions";
import type {
  Waypoint,
  WaypointHeadingMode,
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
];

export function WaypointRoutePanel({ onWaypointsLoaded, onResultGenerated }: Props) {
  const [params, setParams] = useState<WaypointRouteParams>(DEFAULT_WAYPOINT_PARAMS);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [result, setResult] = useState<WaypointRouteResult | null>(null);
  const [kmlFile, setKmlFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Load a KML/KMZ with point features.");
  const [downloadName, setDownloadName] = useState("fh2_waypoint.kmz");
  const [expandedWp, setExpandedWp] = useState<string | null>(null);
  const popoutRef = useRef<HTMLDivElement>(null);

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
    setExpandedWp(null);
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

  return (
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
            onChange={(e) => setParams((p) => ({ ...p, cameraKey: e.target.value }))}
          >
            {Object.keys(CAMERAS).map((key) => (
              <option key={key} value={key}>{key}</option>
            ))}
          </select>
        </label>
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
            onChange={(e) => setParams((p) => ({ ...p, defaultHeight: Number(e.target.value) || 0 }))}
          />
        </label>
        <label>
          Default speed (m/s)
          <input
            type="number"
            value={params.defaultSpeed}
            onChange={(e) => setParams((p) => ({ ...p, defaultSpeed: Number(e.target.value) || 0 }))}
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
          Turn mode
          <select
            value={params.defaultTurnMode}
            onChange={(e) =>
              setParams((p) => ({ ...p, defaultTurnMode: e.target.value as WaypointTurnMode }))
            }
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
      </div>

      <div className="waypoint-list-header">
        <h3>Waypoints ({waypoints.length})</h3>
        {waypoints.length >= 3 && (
          <button
            className="btn btn-secondary"
            onClick={onOptimiseOrder}
            title="Reorder waypoints for shortest route"
            style={{ padding: "0.3rem 0.7rem", fontSize: "0.74rem" }}
          >
            Optimise Order
          </button>
        )}
      </div>
      <div className="waypoint-list">
        {waypoints.length === 0 && (
          <p className="stats-empty">No waypoints loaded.</p>
        )}
        {waypoints.map((wp, i) => {
          const isExpanded = expandedWp === wp.id;
          return (
            <div key={wp.id} className={`waypoint-card ${isExpanded ? "expanded" : ""}`}>
              <div
                className="waypoint-card-header"
                onClick={() => setExpandedWp(isExpanded ? null : wp.id)}
              >
                <span className="waypoint-index">{i + 1}</span>
                <span className="waypoint-name">{wp.name}</span>
                <span className="waypoint-actions-count">
                  {wp.actions.length > 0 && `${wp.actions.length} action${wp.actions.length > 1 ? "s" : ""}`}
                </span>
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

              {isExpanded && (
                <div className="waypoint-card-body">
                  <div className="grid2">
                    <label>
                      Height (m)
                      <input
                        type="number"
                        value={wp.height}
                        onChange={(e) => {
                          updateWaypoint(wp.id, {
                            height: Number(e.target.value) || 0,
                            useGlobalHeight: false,
                          });
                        }}
                      />
                    </label>
                    <label>
                      Speed (m/s)
                      <input
                        type="number"
                        value={wp.speed}
                        onChange={(e) => {
                          updateWaypoint(wp.id, {
                            speed: Number(e.target.value) || 0,
                            useGlobalSpeed: false,
                          });
                        }}
                      />
                    </label>
                    <label>
                      Heading mode
                      <select
                        value={wp.headingMode}
                        onChange={(e) =>
                          updateWaypoint(wp.id, {
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
                    {wp.headingMode === "fixed" && (
                      <label>
                        Heading angle
                        <input
                          type="number"
                          min={0}
                          max={360}
                          value={wp.headingAngle}
                          onChange={(e) =>
                            updateWaypoint(wp.id, {
                              headingAngle: Number(e.target.value) || 0,
                              useGlobalHeadingParam: false,
                            })
                          }
                        />
                      </label>
                    )}
                    <label>
                      Turn mode
                      <select
                        value={wp.turnMode}
                        onChange={(e) =>
                          updateWaypoint(wp.id, {
                            turnMode: e.target.value as WaypointTurnMode,
                            useGlobalTurnParam: false,
                          })
                        }
                      >
                        {TURN_MODE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="toggle-label">
                      Straight line
                      <input
                        type="checkbox"
                        checked={wp.useStraightLine}
                        onChange={(e) => updateWaypoint(wp.id, { useStraightLine: e.target.checked })}
                      />
                    </label>
                  </div>

                  {wp.actions.length > 0 && (
                    <div className="waypoint-action-summary">
                      {wp.actions.map((a, ai) => (
                        <span key={a.id} className="action-badge">
                          {ai + 1}. {getActionLabel(a.type)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {expandedWp && (() => {
        const wp = waypoints.find((w) => w.id === expandedWp);
        if (!wp) return null;
        const wpIndex = waypoints.indexOf(wp);
        return (
          <div className="action-popout" ref={popoutRef}>
            <div className="action-popout-header">
              <span className="action-popout-title">
                <span className="waypoint-index">{wpIndex + 1}</span>
                Actions: {wp.name}
              </span>
              <button
                className="btn btn-secondary action-remove-btn"
                onClick={() => setExpandedWp(null)}
                title="Close"
              >x</button>
            </div>
            <WaypointActionEditor
              actions={wp.actions}
              onChange={(actions) => updateWaypoint(wp.id, { actions })}
              payloadEnum={CAMERAS[params.cameraKey]?.payloadEnum ?? 98}
            />
          </div>
        );
      })()}

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
  );
}
