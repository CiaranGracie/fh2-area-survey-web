import { useCallback, useRef, useState } from "react";
import "./App.css";
import type { AppMode, LonLat, PassLine, SurveyResult, Waypoint, WaypointRouteResult } from "./domain/types";
import { MapPreview } from "./ui/MapPreview";
import { AreaSurveyPanel } from "./ui/AreaSurveyPanel";
import { WaypointRoutePanel } from "./ui/WaypointRoutePanel";
import { importKmzMission } from "./io/kmzImporter";

function App() {
  const [appMode, setAppMode] = useState<AppMode>("areaSurvey");

  const [polygon, setPolygon] = useState<LonLat[] | null>(null);
  const [surveyPolygon, setSurveyPolygon] = useState<LonLat[] | null>(null);
  const [passes, setPasses] = useState<PassLine[]>([]);
  const [passLabels, setPassLabels] = useState("No passes yet");

  const [wpMarkers, setWpMarkers] = useState<Waypoint[]>([]);
  const [importedWaypoints, setImportedWaypoints] = useState<Waypoint[] | null>(null);
  const [selectedWpId, setSelectedWpId] = useState<string | null>(null);
  const [bottomPortalTarget, setBottomPortalTarget] = useState<HTMLDivElement | null>(null);
  const bottomRef = useCallback((node: HTMLDivElement | null) => setBottomPortalTarget(node), []);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const onAreaPolygonLoaded = (poly: LonLat[]) => {
    setPolygon(poly);
    setSurveyPolygon(null);
    setPasses([]);
    setPassLabels("No passes yet");
  };

  const onAreaResultGenerated = (result: SurveyResult) => {
    setSurveyPolygon(result.surveyPolygon);
    setPasses(result.passes);
    setPassLabels(result.passes.map((p) => p.label).join(" | "));
  };

  const onWaypointsLoaded = (waypoints: Waypoint[]) => {
    setWpMarkers(waypoints);
    setImportedWaypoints(null);
    setPolygon(null);
    setPasses([]);
    setPassLabels("");
  };

  const onWaypointResultGenerated = (result: WaypointRouteResult) => {
    setWpMarkers(result.waypoints);
    setImportedWaypoints(null);
  };

  const onImportKmz = async (file: File | null) => {
    if (!file) return;
    try {
      const imported = await importKmzMission(file);
      setSelectedWpId(null);
      if (imported.mode === "waypointRoute") {
        setAppMode("waypointRoute");
        const importedWps = imported.waypoints ?? [];
        setWpMarkers(importedWps);
        setImportedWaypoints(importedWps);
        setPolygon(null);
        setPasses([]);
        setPassLabels(imported.riskyWaypointIndexes.length > 0
          ? `Imported with ${imported.riskyWaypointIndexes.length} risky waypoint(s).`
          : "Imported waypoint mission.");
        return;
      }
      setAppMode(imported.mode);
      setPolygon(imported.polygon ?? null);
      setSurveyPolygon(imported.polygon ?? null);
      setWpMarkers([]);
      setPasses([]);
      setPassLabels("Imported survey template.");
    } catch (error) {
      setPassLabels(error instanceof Error ? error.message : "Failed to import KMZ.");
    }
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-text">
          <h1>FH2 Route Builder</h1>
          <p>Upload KML/KMZ, configure mission parameters, preview on map, then export FH2 mission files.</p>
        </div>
        <div className="mode-switcher">
          <button
            className={`btn ${appMode === "areaSurvey" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setAppMode("areaSurvey")}
          >Area Survey</button>
          <button
            className={`btn ${appMode === "waypointRoute" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setAppMode("waypointRoute")}
          >Waypoint Route</button>
          <button
            className={`btn ${appMode === "mappingStrip" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setAppMode("mappingStrip")}
          >Mapping Strip</button>
          <button
            className="btn btn-secondary"
            onClick={() => importInputRef.current?.click()}
          >Import KMZ</button>
          <input
            ref={importInputRef}
            type="file"
            accept=".kmz"
            style={{ display: "none" }}
            onChange={(e) => {
              void onImportKmz(e.target.files?.[0] ?? null);
              e.currentTarget.value = "";
            }}
          />
        </div>
      </header>

      <div className="content-row">
        {appMode === "areaSurvey" || appMode === "mappingStrip" ? (
          <AreaSurveyPanel
            onPolygonLoaded={onAreaPolygonLoaded}
            onResultGenerated={onAreaResultGenerated}
            initialTemplateType={appMode === "mappingStrip" ? "mappingStrip" : "mapping2d"}
          />
        ) : (
          <WaypointRoutePanel
            onWaypointsLoaded={onWaypointsLoaded}
            onResultGenerated={onWaypointResultGenerated}
            selectedWpId={selectedWpId}
            onSelectedWpChange={setSelectedWpId}
            detailPortalTarget={bottomPortalTarget}
            importedWaypoints={importedWaypoints}
          />
        )}

        <section className="map-section">
          <h2 className="section-label">Map Preview</h2>
          <div className="map-card">
            <MapPreview
              polygon={polygon}
              surveyPolygon={surveyPolygon}
              passes={passes}
              waypoints={appMode === "waypointRoute" ? wpMarkers : []}
              selectedWaypointId={selectedWpId}
              onWaypointClick={setSelectedWpId}
            />
          </div>
        </section>
      </div>

      <div className={`bottom-row ${appMode === "waypointRoute" ? "bottom-row--waypoint" : ""}`} ref={bottomRef}>
        {appMode === "areaSurvey" && (
          <div className="area-survey-bottom">
            {passLabels && <p className="pass-labels">{passLabels}</p>}
            {passes.length > 0 && (
              <div className="pass-legend">
                {surveyPolygon && polygon && surveyPolygon !== polygon && (
                  <span className="legend-item">
                    <span className="legend-swatch legend-swatch--dashed" style={{ background: "#f59e0b" }} />
                    Survey boundary
                  </span>
                )}
                {passes.map((pass) => (
                  <span key={pass.label} className="legend-item">
                    <span className="legend-swatch" style={{ background: pass.color }} />
                    {pass.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
