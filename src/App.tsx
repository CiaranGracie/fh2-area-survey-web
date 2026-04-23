import { useState } from "react";
import "./App.css";
import type { AppMode, LonLat, PassLine, SurveyResult, Waypoint, WaypointRouteResult } from "./domain/types";
import { MapPreview } from "./ui/MapPreview";
import { AreaSurveyPanel } from "./ui/AreaSurveyPanel";
import { WaypointRoutePanel } from "./ui/WaypointRoutePanel";

function App() {
  const [appMode, setAppMode] = useState<AppMode>("areaSurvey");

  const [polygon, setPolygon] = useState<LonLat[] | null>(null);
  const [passes, setPasses] = useState<PassLine[]>([]);
  const [passLabels, setPassLabels] = useState("No passes yet");

  const [wpMarkers, setWpMarkers] = useState<Waypoint[]>([]);
  const [selectedWpId, setSelectedWpId] = useState<string | null>(null);

  const onAreaPolygonLoaded = (poly: LonLat[]) => {
    setPolygon(poly);
    setPasses([]);
    setPassLabels("No passes yet");
  };

  const onAreaResultGenerated = (result: SurveyResult) => {
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
    <main className="app">
      <header className="panel header">
        <h1>FH2 Route Builder</h1>
        <p>Upload KML/KMZ, configure mission parameters, preview on map, then export KMZ mission files.</p>
        <div className="mode-switcher">
          <button
            className={`btn ${appMode === "areaSurvey" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setAppMode("areaSurvey")}
          >
            Area Survey
          </button>
          <button
            className={`btn ${appMode === "waypointRoute" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setAppMode("waypointRoute")}
          >
            Waypoint Route
          </button>
        </div>
      </header>

      <section className="layout">
        {appMode === "areaSurvey" ? (
          <AreaSurveyPanel
            onPolygonLoaded={onAreaPolygonLoaded}
            onResultGenerated={onAreaResultGenerated}
          />
        ) : (
          <WaypointRoutePanel
            onWaypointsLoaded={onWaypointsLoaded}
            onResultGenerated={onWaypointResultGenerated}
          />
        )}

        <section className="panel preview">
          <h2>Map Preview</h2>
          <MapPreview
            polygon={polygon}
            passes={passes}
            waypoints={appMode === "waypointRoute" ? wpMarkers : []}
            selectedWaypointId={selectedWpId}
            onWaypointClick={setSelectedWpId}
          />
          {passLabels && <p className="pass-labels">{passLabels}</p>}
          {passes.length > 0 && (
            <div className="pass-legend">
              {passes.map((pass) => (
                <span key={pass.label} className="legend-item">
                  <span className="legend-swatch" style={{ background: pass.color }} />
                  {pass.label}
                </span>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

export default App;
