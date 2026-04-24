import { useEffect, useMemo, useRef, useState } from "react";
import { CAMERAS, getPayloadOptions } from "../domain/cameras";
import { DEFAULT_PARAMS } from "../domain/defaults";
import type { LonLat, SurveyParams, SurveyResult } from "../domain/types";
import { altitudeFromGsd, gsdCm } from "../geo/math";
import { buildKmzBlob, triggerBlobDownload } from "../io/kmzWriter";
import { parseKmlOrKmzFileMulti } from "../io/kml";
import { generateSurvey } from "../mission/generate";
import { createDsmSampler } from "../terrain/dsm";
import type { DsmSampler } from "../terrain/dsm";
import { projectorForLonLat } from "../geo/projection";
import { corridorPolygonFromLine } from "../geo/strip";

type NumberParamKey =
  | "altitudeM"
  | "forwardOverlapPct"
  | "sideOverlapPct"
  | "obliqueForwardOverlapPct"
  | "obliqueSideOverlapPct"
  | "marginM"
  | "minLines"
  | "courseDeg"
  | "speedMps"
  | "obliqueSpeedMps"
  | "smartObliquePitch"
  | "obliquePitch"
  | "terrainIntervalM"
  | "takeoffHeightM"
  | "rthHeightM"
  | "transitSpeedMps"
  | "mappingHeadingAngle"
  | "leftExtend"
  | "rightExtend"
  | "cuttingDistance";

interface Props {
  onPolygonLoaded: (polygon: LonLat[]) => void;
  onResultGenerated: (result: SurveyResult) => void;
  initialTemplateType?: SurveyParams["templateType"];
}

export function AreaSurveyPanel({ onPolygonLoaded, onResultGenerated, initialTemplateType }: Props) {
  const [params, setParams] = useState<SurveyParams>(DEFAULT_PARAMS);
  const [polygon, setPolygon] = useState<LonLat[] | null>(null);
  const [surveyResult, setSurveyResult] = useState<SurveyResult | null>(null);
  const [kmlFile, setKmlFile] = useState<File | null>(null);
  const [dsmFile, setDsmFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Load a KML/KMZ to begin.");
  const [downloadName, setDownloadName] = useState("fh2_route.kmz");
  const [gsdInput, setGsdInput] = useState(() =>
    gsdCm(DEFAULT_PARAMS.altitudeM, CAMERAS[DEFAULT_PARAMS.cameraKey]).toFixed(2),
  );
  const syncingFromGsdRef = useRef(false);
  const dsmSamplerRef = useRef<DsmSampler | undefined>(undefined);
  useEffect(() => {
    if (!initialTemplateType) return;
    setParams((prev) => ({ ...prev, templateType: initialTemplateType }));
  }, [initialTemplateType]);

  const selectedCamera = CAMERAS[params.cameraKey];
  const payloadOptions = selectedCamera ? getPayloadOptions(selectedCamera) : [];

  const mode = useMemo(() => {
    const isOrtho = params.collectionMode === "ortho";
    const isOblique = params.collectionMode === "oblique";
    return {
      orthoPlain: isOrtho && !params.smartOblique,
      orthoSmart: isOrtho && params.smartOblique,
      obliquePlain: isOblique && !params.smartOblique,
      obliqueSmart: isOblique && params.smartOblique,
    };
  }, [params.collectionMode, params.smartOblique]);

  const obliqueGsdComputed = useMemo(() => {
    const camera = CAMERAS[params.cameraKey];
    if (!camera) return 0;
    const baseGsd = gsdCm(params.altitudeM, camera);
    if (mode.obliqueSmart) {
      const angleRad = (Math.abs(params.obliquePitch) * Math.PI) / 180;
      return baseGsd / Math.cos(angleRad);
    }
    return baseGsd;
  }, [params.altitudeM, params.cameraKey, params.obliquePitch, mode.obliqueSmart]);

  const showPhotoMode = mode.orthoPlain || mode.obliquePlain;
  const showElevationOpt = mode.orthoPlain || mode.orthoSmart;
  const showObliqueGsd = mode.obliquePlain || mode.obliqueSmart;
  const showGimbalControl = mode.obliquePlain || mode.obliqueSmart;
  const showObliqueOverlaps = mode.obliquePlain;
  const showObliqueSpeed = mode.obliquePlain;
  const showRttf = params.heightMode === "AGL" && !mode.obliquePlain && !mode.obliqueSmart;

  const updateNumber = (key: NumberParamKey, value: string) => {
    const num = Number(value);
    setParams((prev) => ({ ...prev, [key]: Number.isFinite(num) ? num : 0 }));
  };

  const updateString = <K extends keyof SurveyParams>(key: K, value: SurveyParams[K]) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  };

  const updateCollectionMode = (value: SurveyParams["collectionMode"]) => {
    setParams((prev) => {
      const isOrtho = value === "ortho";
      const smart = prev.smartOblique;
      let speed = prev.speedMps;
      if (isOrtho && !smart) speed = 12;
      else if (isOrtho && smart) speed = 13;
      else speed = 15;

      return {
        ...prev,
        collectionMode: value,
        speedMps: speed,
        shootType: smart ? "distance" : prev.shootType,
        elevationOptimize: (value === "oblique" && smart) ? false : prev.elevationOptimize,
      };
    });
  };

  const updateSmartOblique = (checked: boolean) => {
    setParams((prev) => {
      const isOrtho = prev.collectionMode === "ortho";
      let speed = prev.speedMps;
      if (isOrtho && !checked) speed = 12;
      else if (isOrtho && checked) speed = 13;
      else speed = 15;

      return {
        ...prev,
        smartOblique: checked,
        speedMps: speed,
        shootType: checked ? "distance" : prev.shootType,
        elevationOptimize: (!isOrtho && checked) ? false : prev.elevationOptimize,
      };
    });
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
    if (!camera || syncingFromGsdRef.current) {
      syncingFromGsdRef.current = false;
      return;
    }
    setGsdInput(gsdCm(params.altitudeM, camera).toFixed(2));
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
      const parsed = await parseKmlOrKmzFileMulti(kmlFile);
      let poly: LonLat[];
      if (parsed.type === "polygon" || parsed.type === "both") {
        poly = parsed.polygon;
      } else if (parsed.type === "linestring") {
        const center = parsed.line[Math.floor(parsed.line.length / 2)];
        const projector = projectorForLonLat(center[0], center[1]);
        poly = corridorPolygonFromLine(parsed.line, projector, params.leftExtend, params.rightExtend);
        setParams((prev) => ({ ...prev, templateType: "mappingStrip" }));
      } else {
        throw new Error("KML contains points but no polygon. Use Waypoint Route mode.");
      }
      setPolygon(poly);
      setSurveyResult(null);
      onPolygonLoaded(poly);
      setMessage(`Loaded polygon with ${poly.length} vertices.`);

      if (dsmFile) {
        const sampler = await createDsmSampler(dsmFile);
        dsmSamplerRef.current = sampler;
        if (!sampler.isWgs84) {
          setMessage("DSM loaded, but it is not EPSG:4326. Reproject for browser use.");
        }
        setParams((prev) => ({ ...prev, dsmFilename: dsmFile.name }));
      }
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
      const result = await generateSurvey(polygon, params, dsmSamplerRef.current);
      setSurveyResult(result);
      onResultGenerated(result);
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
    const blob = await buildKmzBlob(surveyResult.templateKml, surveyResult.wpml, {
      dsmArrayBuffer: dsmFile && !params.realTimeTerrainFollow
        ? await dsmFile.arrayBuffer()
        : undefined,
      dsmFilename: params.dsmFilename,
    });
    triggerBlobDownload(blob, downloadName || "fh2_route.kmz");
    setMessage(`Downloaded ${downloadName || "fh2_route.kmz"}.`);
  };

  return (
    <aside className="panel controls">
      <h2>Area Survey</h2>

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
            onChange={(e) =>
              setParams((prev) => {
                const next = CAMERAS[e.target.value];
                const nextPayload = next?.supportsPayloadSwap ? (getPayloadOptions(next)[0]?.name ?? prev.selectedPayloadKey) : undefined;
                return { ...prev, cameraKey: e.target.value, selectedPayloadKey: nextPayload };
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
              onChange={(e) => updateString("selectedPayloadKey", e.target.value)}
            >
              {payloadOptions.map((option) => (
                <option key={option.name} value={option.name}>{option.name}</option>
              ))}
            </select>
          </label>
        )}
        <label>
          Template
          <select
            value={params.templateType}
            onChange={(e) => updateString("templateType", e.target.value as SurveyParams["templateType"])}
          >
            <option value="mapping2d">Mapping 2D</option>
            <option value="mapping3d">Mapping 3D</option>
            <option value="mappingStrip">Mapping Strip</option>
          </select>
        </label>
        <label>
          Mode
          <select
            value={params.collectionMode}
            onChange={(e) => updateCollectionMode(e.target.value as SurveyParams["collectionMode"])}
          >
            <option value="ortho">Ortho</option>
            <option value="oblique">Oblique</option>
          </select>
        </label>
        {showPhotoMode && (
          <label>
            Photo mode
            <select
              value={params.shootType}
              onChange={(e) => updateString("shootType", e.target.value as SurveyParams["shootType"])}
            >
              <option value="distance">Distance</option>
              <option value="time">Time</option>
            </select>
          </label>
        )}
        <label className="toggle-label">
          Smart oblique
          <input
            type="checkbox"
            checked={params.smartOblique}
            onChange={(e) => updateSmartOblique(e.target.checked)}
          />
        </label>
      </div>

      {showGimbalControl && (
        <>
          <h3>Gimbal</h3>
          <div className="control-group">
            {mode.obliquePlain && (
              <label>
                Gimbal tilt angle (deg)
                <input
                  type="number"
                  min={-85}
                  max={-40}
                  value={params.obliquePitch}
                  onChange={(e) => updateNumber("obliquePitch", e.target.value)}
                />
              </label>
            )}
            {mode.obliqueSmart && (
              <label>
                Smart oblique angle (deg)
                <input
                  type="number"
                  min={-45}
                  max={-10}
                  value={params.obliquePitch}
                  onChange={(e) => updateNumber("obliquePitch", e.target.value)}
                />
              </label>
            )}
          </div>
        </>
      )}

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
        {showRttf && (
          <label className="toggle-label">
            Real-time terrain follow
            <input
              type="checkbox"
              checked={params.realTimeTerrainFollow}
              disabled={params.heightMode !== "AGL"}
              onChange={(e) => updateRealTimeTerrainFollow(e.target.checked)}
            />
          </label>
        )}
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
        {showObliqueSpeed && (
          <label>
            Oblique speed (m/s)
            <input
              type="number"
              value={params.obliqueSpeedMps}
              onChange={(e) => updateNumber("obliqueSpeedMps", e.target.value)}
            />
          </label>
        )}
        <label>
          Course (deg)
          <input
            type="number"
            value={params.courseDeg}
            onChange={(e) => updateNumber("courseDeg", e.target.value)}
          />
        </label>
        {showElevationOpt && (
          <label className="toggle-label">
            Elevation optimization
            <input
              type="checkbox"
              checked={params.elevationOptimize}
              onChange={(e) => updateString("elevationOptimize", e.target.checked)}
            />
          </label>
        )}
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
            <button className="btn btn-secondary" type="button" onClick={() => nudgeGsd(-1)}>-1</button>
            <button className="btn btn-secondary" type="button" onClick={() => nudgeGsd(-0.1)}>-0.1</button>
            <button className="btn btn-secondary" type="button" onClick={() => nudgeGsd(0.1)}>+0.1</button>
            <button className="btn btn-secondary" type="button" onClick={() => nudgeGsd(1)}>+1</button>
          </div>
        </label>
        {showObliqueGsd && (
          <label>
            Oblique GSD
            <div className="gsd-row">
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={obliqueGsdComputed.toFixed(2)}
                readOnly={mode.obliqueSmart}
                disabled={mode.obliqueSmart}
              />
              <span className="gsd-unit">cm/px</span>
            </div>
          </label>
        )}
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
        {showObliqueOverlaps && (
          <div className="grid2">
            <label>
              Oblique forward overlap (%)
              <input
                type="number"
                value={params.obliqueForwardOverlapPct}
                onChange={(e) => updateNumber("obliqueForwardOverlapPct", e.target.value)}
              />
            </label>
            <label>
              Oblique side overlap (%)
              <input
                type="number"
                value={params.obliqueSideOverlapPct}
                onChange={(e) => updateNumber("obliqueSideOverlapPct", e.target.value)}
              />
            </label>
          </div>
        )}
        <div className="grid2">
          <label>
            Margin (m)
            <input
              type="number"
              min={0}
              value={params.marginM}
              onChange={(e) => updateNumber("marginM", e.target.value)}
            />
          </label>
          <label>
            Min flight lines
            <input
              type="number"
              min={0}
              step={1}
              value={params.minLines}
              onChange={(e) => updateNumber("minLines", e.target.value)}
            />
          </label>
        </div>
        {params.templateType === "mappingStrip" && (
          <div className="grid2">
            <label>
              Left extend (m)
              <input
                type="number"
                min={0}
                value={params.leftExtend}
                onChange={(e) => updateNumber("leftExtend", e.target.value)}
              />
            </label>
            <label>
              Right extend (m)
              <input
                type="number"
                min={0}
                value={params.rightExtend}
                onChange={(e) => updateNumber("rightExtend", e.target.value)}
              />
            </label>
            <label>
              Cutting distance (m)
              <input
                type="number"
                min={0}
                value={params.cuttingDistance}
                onChange={(e) => updateNumber("cuttingDistance", e.target.value)}
              />
            </label>
            <label className="toggle-label">
              Single line
              <input
                type="checkbox"
                checked={params.singleLineEnable}
                onChange={(e) => updateString("singleLineEnable", e.target.checked)}
              />
            </label>
          </div>
        )}
      </div>

      <button className="btn btn-primary btn-cta" onClick={onGenerate} disabled={busy || !polygon}>
        {busy ? "Working..." : "Generate Route"}
      </button>

      <h3>Safety</h3>
      <div className="control-group grid2">
        <label>
          Takeoff height (m)
          <input
            type="number"
            value={params.takeoffHeightM}
            onChange={(e) => updateNumber("takeoffHeightM", e.target.value)}
          />
        </label>
        <label>
          RTH height (m)
          <input
            type="number"
            value={params.rthHeightM}
            onChange={(e) => updateNumber("rthHeightM", e.target.value)}
          />
        </label>
        <label>
          Transit speed (m/s)
          <input
            type="number"
            value={params.transitSpeedMps}
            onChange={(e) => updateNumber("transitSpeedMps", e.target.value)}
          />
        </label>
        <label>
          Upon completion
          <select
            value={params.finishAction}
            onChange={(e) => updateString("finishAction", e.target.value as SurveyParams["finishAction"])}
          >
            <option value="goHome">Go Home</option>
            <option value="autoLand">Auto Land</option>
            <option value="goContinue">Continue</option>
            <option value="noAction">No Action</option>
          </select>
        </label>
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
        <label>
          RC signal lost
          <select
            value={params.exitOnRCLost}
            onChange={(e) => updateString("exitOnRCLost", e.target.value as SurveyParams["exitOnRCLost"])}
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
              onChange={(e) => updateString("executeRCLostAction", e.target.value as SurveyParams["executeRCLostAction"])}
            >
              <option value="goBack">Go Back</option>
              <option value="landing">Land</option>
              <option value="hover">Hover</option>
            </select>
          </label>
        )}
      </div>

      <h3>Aircraft Heading</h3>
      <div className="control-group grid2">
        <label>
          Heading mode
          <select
            value={params.mappingHeadingMode}
            onChange={(e) => updateString("mappingHeadingMode", e.target.value as SurveyParams["mappingHeadingMode"])}
          >
            <option value="followWayline">Follow Flight Line</option>
            <option value="fixed">Fixed Heading</option>
          </select>
        </label>
        {params.mappingHeadingMode === "fixed" && (
          <label>
            Heading angle (deg)
            <input
              type="number"
              value={params.mappingHeadingAngle}
              onChange={(e) => updateNumber("mappingHeadingAngle", e.target.value)}
            />
          </label>
        )}
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

      {surveyResult && (
        <div className="stats">
          <div>Lines: {surveyResult.stats.nLines}</div>
          <div>Waypoints: {surveyResult.stats.nWaypoints}</div>
          <div>Distance: {surveyResult.stats.totalDistanceM.toFixed(0)} m</div>
          <div>Duration: {surveyResult.stats.durationMin.toFixed(1)} min</div>
          <div>Photos: ~{surveyResult.stats.nPhotosEstimate}</div>
          <div>GSD: {surveyResult.stats.gsdCm.toFixed(2)} cm/px</div>
          <div>Spacing: {surveyResult.stats.lineSpacingM.toFixed(1)} m</div>
          <div>Interval: {surveyResult.stats.photoIntervalM.toFixed(1)} m</div>
          <div>CRS: {surveyResult.stats.crsName} (EPSG:{surveyResult.stats.epsg})</div>
        </div>
      )}

      <div className="message">{message}</div>
    </aside>
  );
}
