import { useCallback, useState } from "react";
import "./App.css";
import type { AppMode, LonLat, PassLine, SurveyResult, Waypoint, WaypointRouteResult } from "./domain/types";
import { MapPreview } from "./ui/MapPreview";
import { AreaSurveyPanel } from "./ui/AreaSurveyPanel";
import { WaypointRoutePanel } from "./ui/WaypointRoutePanel";

function App() {
  const [appMode, setAppMode] = useState<AppMode>("areaSurvey");

  const [polygon, setPolygon] = useState<LonLat[] | null>(null);
  const [surveyPolygon, setSurveyPolygon] = useState<LonLat[] | null>(null);
  const [passes, setPasses] = useState<PassLine[]>([]);
  const [passLabels, setPassLabels] = useState("No passes yet");

  const [wpMarkers, setWpMarkers] = useState<Waypoint[]>([]);
  const [selectedWpId, setSelectedWpId] = useState<string | null>(null);
  const [bottomPortalTarget, setBottomPortalTarget] = useState<HTMLDivElement | null>(null);
  const bottomRef = useCallback((node: HTMLDivElement | null) => setBottomPortalTarget(node), []);

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
    setPolygon(null);
    setPasses([]);
    setPassLabels("");
  };

  const onWaypointResultGenerated = (result: WaypointRouteResult) => {
    setWpMarkers(result.waypoints);
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
        </div>
      </header>

      <div className="content-row">
        {appMode === "areaSurvey" ? (
          <AreaSurveyPanel
            onPolygonLoaded={onAreaPolygonLoaded}
            onResultGenerated={onAreaResultGenerated}
          />
        ) : (
          <WaypointRoutePanel
            onWaypointsLoaded={onWaypointsLoaded}
            onResultGenerated={onWaypointResultGenerated}
            selectedWpId={selectedWpId}
            onSelectedWpChange={setSelectedWpId}
            detailPortalTarget={bottomPortalTarget}
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

      <div className="bottom-row" ref={bottomRef}>
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
