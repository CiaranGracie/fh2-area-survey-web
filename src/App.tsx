import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { CAMERAS } from "./domain/cameras";
import { DEFAULT_PARAMS } from "./domain/defaults";
import type { LonLat, SurveyParams, SurveyResult } from "./domain/types";
import { altitudeFromGsd, gsdCm } from "./geo/math";
import { buildKmzBlob, triggerBlobDownload } from "./io/kmzWriter";
import { parseKmlOrKmzFile } from "./io/kml";
import { generateSurvey } from "./mission/generate";
import { createDsmSampler } from "./terrain/dsm";
import { MapPreview } from "./ui/MapPreview";

type NumberParamKey =
  | "altitudeM"
  | "forwardOverlapPct"
  | "sideOverlapPct"
  | "marginM"
  | "courseDeg"
  | "speedMps"
  | "smartObliquePitch"
  | "obliquePitch"
  | "terrainIntervalM"
  | "takeoffHeightM"
  | "rthHeightM"
  | "transitSpeedMps";

function App() {
  const [params, setParams] = useState<SurveyParams>(DEFAULT_PARAMS);
  const [polygon, setPolygon] = useState<LonLat[] | null>(null);
  const [surveyResult, setSurveyResult] = useState<SurveyResult | null>(null);
  const [kmlFile, setKmlFile] = useState<File | null>(null);
  const [dsmFile, setDsmFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>("Load a KML/KMZ to begin.");
  const [downloadName, setDownloadName] = useState("fh2_route.kmz");
  const [gsdInput, setGsdInput] = useState(() =>
    gsdCm(DEFAULT_PARAMS.altitudeM, CAMERAS[DEFAULT_PARAMS.cameraKey]).toFixed(2),
  );
  const syncingFromGsdRef = useRef(false);

  const passLabels = useMemo(
    () => surveyResult?.passes.map((p) => p.label).join(" | ") ?? "No passes yet",
    [surveyResult],
  );

  const updateNumber = (key: NumberParamKey, value: string) => {
    const num = Number(value);
    setParams((prev) => ({ ...prev, [key]: Number.isFinite(num) ? num : 0 }));
  };

  const updateString = <K extends keyof SurveyParams>(key: K, value: SurveyParams[K]) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  };

  const updateHeightMode = (value: SurveyParams["heightMode"]) => {
    setParams((prev) => ({
      ...prev,
      heightMode: value,
      realTimeTerrainFollow: value === "AGL" ? prev.realTimeTerrainFollow : false,
      terrainFollow: value === "AGL" ? !prev.realTimeTerrainFollow : false,
    }));
  };

  const updateRealTimeTerrainFollow = (checked: boolean) => {
    setParams((prev) => ({
      ...prev,
      realTimeTerrainFollow: checked,
      terrainFollow: prev.heightMode === "AGL" ? !checked : false,
    }));
  };

  useEffect(() => {
    const camera = CAMERAS[params.cameraKey];
    if (!camera) return;
    const nextGsd = gsdCm(params.altitudeM, camera).toFixed(2);
    setGsdInput(nextGsd);
    syncingFromGsdRef.current = false;
  }, [params.altitudeM, params.cameraKey]);

  const onChangeGsd = (value: string) => {
    setGsdInput(value);
    const next = Number(value);
    const camera = CAMERAS[params.cameraKey];
    if (!camera || !Number.isFinite(next) || next <= 0) return;
    syncingFromGsdRef.current = true;
    const nextAltitude = altitudeFromGsd(next, camera);
    setParams((prev) => ({ ...prev, altitudeM: Math.max(0.01, Number(nextAltitude.toFixed(2))) }));
  };

  const nudgeGsd = (delta: number) => {
    const base = Number(gsdInput);
    const camera = CAMERAS[params.cameraKey];
    if (!camera) return;
    const current = Number.isFinite(base) && base > 0 ? base : gsdCm(params.altitudeM, camera);
    const next = Math.max(0.01, Number((current + delta).toFixed(2)));
    onChangeGsd(next.toFixed(2));
  };

  const onLoadPolygon = async () => {
    if (!kmlFile) {
      setMessage("Select a KML or KMZ file first.");
      return;
    }
    try {
      setBusy(true);
      const poly = await parseKmlOrKmzFile(kmlFile);
      setPolygon(poly);
      setSurveyResult(null);
      setMessage(`Loaded polygon with ${poly.length} vertices.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to parse KML/KMZ.");
    } finally {
      setBusy(false);
    }
  };

  const onGenerate = async () => {
    if (!polygon) {
      setMessage("Load polygon data before generating.");
      return;
    }
    try {
      setBusy(true);
      const dsmSampler = dsmFile ? await createDsmSampler(dsmFile) : undefined;
      if (dsmSampler && !dsmSampler.isWgs84) {
        setMessage("DSM loaded, but it is not EPSG:4326. Reproject for browser use.");
      }
      const result = await generateSurvey(polygon, params, dsmSampler);
      setSurveyResult(result);
      setMessage(
        `Generated ${result.stats.nLines} lines and ${result.stats.nWaypoints} waypoints.`,
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setBusy(false);
    }
  };

  const onDownloadKmz = async () => {
    if (!surveyResult) {
      setMessage("Generate a route first.");
      return;
    }
    const blob = await buildKmzBlob(surveyResult.templateKml, surveyResult.wpml);
    triggerBlobDownload(blob, downloadName || "fh2_route.kmz");
    setMessage(`Downloaded ${downloadName || "fh2_route.kmz"}.`);
  };

  return (
    <main className="app">
      <header className="panel header">
        <h1>FH2 Area Survey Generator</h1>
        <p>
          Upload KML/KMZ, preview lines,
          then export `KMZ` mission files.
        </p>
      </header>

      <section className="layout">
        <aside className="panel controls">
          <h2>Inputs</h2>
          <label>
            Polygon KML/KMZ
            <input
              type="file"
              accept=".kml,.kmz"
              onChange={(e) => setKmlFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <label>
            Optional DSM GeoTIFF
            <input
              type="file"
              accept=".tif,.tiff"
              onChange={(e) => setDsmFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <button className="btn btn-primary btn-cta" onClick={onLoadPolygon} disabled={busy}>
            Load Polygon
          </button>

          <h3>Acquisition</h3>
          <div className="control-group">
            <label>
              Camera
              <select
                value={params.cameraKey}
                onChange={(e) => updateString("cameraKey", e.target.value)}
              >
                {Object.keys(CAMERAS).map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Mode
              <select
                value={params.collectionMode}
                onChange={(e) =>
                  updateString("collectionMode", e.target.value as SurveyParams["collectionMode"])
                }
              >
                <option value="ortho">Ortho</option>
                <option value="oblique">Oblique</option>
              </select>
            </label>
            <label>
              Photo mode
              <select
                value={params.shootType}
                onChange={(e) =>
                  updateString("shootType", e.target.value as SurveyParams["shootType"])
                }
              >
                <option value="distance">Distance</option>
                <option value="time">Time</option>
              </select>
            </label>
            <label className="toggle-label">
              Smart oblique
              <input
                type="checkbox"
                checked={params.smartOblique}
                onChange={(e) => updateString("smartOblique", e.target.checked)}
              />
            </label>
          </div>

          <h3>Flight</h3>
          <div className="control-group grid2">
            <label>
              Height mode
              <select
                value={params.heightMode}
                onChange={(e) => updateHeightMode(e.target.value as SurveyParams["heightMode"])}
              >
                <option value="ASL">ASL</option>
                <option value="ALT">ALT</option>
                <option value="AGL">AGL</option>
              </select>
            </label>
            <label className="toggle-label">
              Real-time terrain follow
              <input
                type="checkbox"
                checked={params.realTimeTerrainFollow}
                disabled={params.heightMode !== "AGL"}
                onChange={(e) => updateRealTimeTerrainFollow(e.target.checked)}
              />
            </label>
            <label>
              Altitude (m)
              <input
                type="number"
                value={params.altitudeM}
                onChange={(e) => updateNumber("altitudeM", e.target.value)}
              />
            </label>
            <label>
              Speed (m/s)
              <input
                type="number"
                value={params.speedMps}
                onChange={(e) => updateNumber("speedMps", e.target.value)}
              />
            </label>
            <label>
              Course (deg)
              <input
                type="number"
                value={params.courseDeg}
                onChange={(e) => updateNumber("courseDeg", e.target.value)}
              />
            </label>
            <label className="toggle-label">
              Elevation optimization
              <input
                type="checkbox"
                checked={params.elevationOptimize}
                onChange={(e) => updateString("elevationOptimize", e.target.checked)}
              />
            </label>
          </div>

          <h3>Coverage</h3>
          <div className="control-group">
            <label>
              GSD
              <div className="gsd-row">
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={gsdInput}
                  onChange={(e) => onChangeGsd(e.target.value)}
                  onBlur={() => {
                    const parsed = Number(gsdInput);
                    if (Number.isFinite(parsed) && parsed > 0) {
                      setGsdInput(parsed.toFixed(2));
                    } else {
                      const camera = CAMERAS[params.cameraKey];
                      if (!camera) return;
                      setGsdInput(gsdCm(params.altitudeM, camera).toFixed(2));
                    }
                  }}
                />
                <span className="gsd-unit">cm/px</span>
              </div>
              <div className="gsd-nudges">
                <button className="btn btn-secondary" type="button" onClick={() => nudgeGsd(-1)}>
                  -1
                </button>
                <button className="btn btn-secondary" type="button" onClick={() => nudgeGsd(-0.1)}>
                  -0.1
                </button>
                <button className="btn btn-secondary" type="button" onClick={() => nudgeGsd(0.1)}>
                  +0.1
                </button>
                <button className="btn btn-secondary" type="button" onClick={() => nudgeGsd(1)}>
                  +1
                </button>
              </div>
            </label>
            <div className="grid2">
              <label>
                Forward overlap (%)
                <input
                  type="number"
                  value={params.forwardOverlapPct}
                  onChange={(e) => updateNumber("forwardOverlapPct", e.target.value)}
                />
              </label>
              <label>
                Side overlap (%)
                <input
                  type="number"
                  value={params.sideOverlapPct}
                  onChange={(e) => updateNumber("sideOverlapPct", e.target.value)}
                />
              </label>
            </div>
          </div>

          <button className="btn btn-primary btn-cta" onClick={onGenerate} disabled={busy || !polygon}>
            {busy ? "Working..." : "Generate Route"}
          </button>

          <h3>Safety</h3>
          <div className="control-group grid2">
            <label className="toggle-label">
              Geozone bypass
              <input
                type="checkbox"
                checked={params.geozoneBypass}
                onChange={(e) => updateString("geozoneBypass", e.target.checked)}
              />
            </label>
            <label className="toggle-label">
              Obstacle bypass
              <input
                type="checkbox"
                checked={params.obstacleBypass}
                onChange={(e) => updateString("obstacleBypass", e.target.checked)}
              />
            </label>
          </div>

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
              disabled={!surveyResult || busy}
            >
              Download KMZ
            </button>
          </div>

          <div className="message">{message}</div>
        </aside>

        <section className="panel preview">
          <h2>Map Preview</h2>
          <MapPreview polygon={polygon} passes={surveyResult?.passes ?? []} />
          <p className="pass-labels">{passLabels}</p>
          {surveyResult ? (
            <div className="stats">
              <div>Lines: {surveyResult.stats.nLines}</div>
              <div>Waypoints: {surveyResult.stats.nWaypoints}</div>
              <div>Distance: {surveyResult.stats.totalDistanceM.toFixed(0)} m</div>
              <div>Duration: {surveyResult.stats.durationMin.toFixed(1)} min</div>
              <div>Photos: ~{surveyResult.stats.nPhotosEstimate}</div>
              <div>GSD: {surveyResult.stats.gsdCm.toFixed(2)} cm/px</div>
              <div>Spacing: {surveyResult.stats.lineSpacingM.toFixed(1)} m</div>
              <div>Interval: {surveyResult.stats.photoIntervalM.toFixed(1)} m</div>
              <div>
                CRS: {surveyResult.stats.crsName} (EPSG:{surveyResult.stats.epsg})
              </div>
            </div>
          ) : (
            <p className="stats-empty">No mission generated yet.</p>
          )}
        </section>
      </section>
    </main>
  );
}

export default App;

