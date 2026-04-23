# FH2 Flight Planning Rules

Comprehensive reference for every configurable parameter in the FH2 Route Builder. Covers both Area Survey and Waypoint Route modes, with XML tag mappings, allowed values, defaults, and flight impact.

All XML uses namespace `xmlns:wpml="http://www.dji.com/wpmz/1.0.6"` alongside standard KML `xmlns="http://www.opengis.net/kml/2.2"`.

---

## 1. Compatible Drones

| Drone | Camera Preset | `droneEnumValue` | `droneSubEnumValue` | `payloadEnumValue` | `payloadSubEnumValue` | `imageFormat` | Lens Options |
|-------|--------------|------------------|---------------------|--------------------|-----------------------|---------------|--------------|
| DJI Matrice 4D | M4D Wide (24mm) | 100 | 0 | 98 | 0 | `visable` | Visible only |
| DJI Matrice 4E | M4E Wide (24mm) | 100 | 0 | 98 | 0 | `visable` | Visible only |
| DJI Matrice 4T | M4T (Thermal) | 100 | 1 | 99 | 2 | `visable,ir` | Visible, IR, or Both |

**Sensor specs (all presets):** 9.6 x 7.2 mm sensor, 6.72 mm focal length, 5280 x 3956 px resolution.

**Lens selection impact:** M4D/M4E always capture on the visible sensor. M4T can target `visable`, `ir`, or `both` (which generates two separate XML actions -- one per sensor). The `payloadLensIndex` parameter on capture actions controls this.

---

## 2. Shared Mission Config

This `<wpml:missionConfig>` block appears identically in both `template.kml` and `waylines.wpml` for all flight types.

| UI Label | XML Tag | Values | Default | Description | Flight Impact |
|----------|---------|--------|---------|-------------|---------------|
| Upon Completion | `wpml:finishAction` | `goHome`, `autoLand`, `goContinue`, `noAction` | `goHome` | What the drone does after completing the mission. | `goHome` returns to launch point at RTH height. `autoLand` lands at the last waypoint. `goContinue` hovers at last waypoint. `noAction` releases control to the pilot. |
| Takeoff Height | `wpml:takeOffSecurityHeight` | Number (metres) | Area: 120, Waypoint: 80 | Minimum climb altitude before transitioning to the first waypoint. | The drone ascends vertically to this height before flying horizontally. Set higher than nearby obstacles. |
| Transit Speed | `wpml:globalTransitionalSpeed` | Number (m/s) | 15 | Speed used when flying to the first waypoint and between disconnected segments. | Higher values reduce transit time but increase battery consumption during non-survey flight. |
| RTH Height | `wpml:globalRTHHeight` | Number (metres) | 100 | Altitude for the return-to-home flight path. | Must be above all obstacles between the mission area and the launch point. |
| Obstacle Bypass | `wpml:transitionalAutoRerouteMode` / `wpml:missionAutoRerouteMode` | `1` (on), `0` (off) | `1` (on) | Enables DJI obstacle avoidance during transit and mission flight. | When on, the drone will attempt to fly around detected obstacles. May cause unexpected detours near vegetation or structures. |
| Geozone Bypass | `wpml:waylineAvoidLimitAreaMode` | `1` (bypass on), `0` (respect zones) | `1` (bypass) | Controls whether DJI geofence zones are respected. | When bypassed, the drone will fly through restricted/advisory zones. When respected, the drone stops or reroutes at zone boundaries. Not exposed in Waypoint Route UI. |
| -- | `wpml:flyToWaylineMode` | `pointToPoint` | Fixed | How the drone navigates to the first waypoint. | Always point-to-point (direct line). |
| -- | `wpml:exitOnRCLost` | `goContinue` | Fixed | Behaviour when RC signal is lost. | Continues the mission autonomously. |
| -- | `wpml:executeRCLostAction` | `goBack` | Fixed | Failsafe action after RC lost timeout. | Returns to home point. |
| Camera | `wpml:droneEnumValue` / `wpml:droneSubEnumValue` | See drone table | M4D | Identifies the airframe to FH2. | Must match the physical drone or FH2 will reject the mission. |
| Camera | `wpml:payloadEnumValue` / `wpml:payloadSubEnumValue` | See drone table | M4D Wide | Identifies the camera/payload to FH2. | Must match the installed payload. |

---

## 3. Area Survey Mode

Area Survey generates mapping flight lines from a polygon boundary. The output KMZ contains computed waypoints with automated camera actions.

### 3.1 Collection Modes

The combination of Collection Mode and Smart Oblique produces four distinct flight patterns:

| UI Setting | `templateType` | `smartObliqueEnable` | `quickOrthoMappingEnable` | Flight Pattern | Passes |
|-----------|----------------|---------------------|--------------------------|----------------|--------|
| Ortho | `mapping2d` | `0` | `0` | Single nadir pass, gimbal locked at -90 deg. | 1 |
| Ortho + Smart Oblique | `mapping2d` | `0` | `1` | Single pass, camera auto-rotates for oblique coverage. | 1 |
| Oblique (5-pass) | `mapping3d` | _omitted_ | _omitted_ | Five separate passes: 1 nadir + 4 offset oblique at cardinal directions. | 5 |
| Oblique + Smart Oblique | `mapping2d` | `1` | `0` | Single extended-area pass with smart oblique capture. Polygon buffered by `altitude / tan(\|pitch\|)`. | 1 |

**Flight impact:** Ortho is fastest and simplest. Oblique 5-pass produces best 3D reconstruction but takes ~5x longer. Smart Oblique modes use a single pass with camera rotation, trading some quality for significant time savings.

### 3.2 Mode-Specific Parameters

| UI Label | XML Tag | Condition | Values | Default | Flight Impact |
|----------|---------|-----------|--------|---------|---------------|
| Smart Oblique Pitch | `wpml:quickOrthoMappingPitch` | Ortho + Smart | Degrees (positive) | 30 | Camera tilt angle for oblique captures during smart ortho. Higher angles capture more building facades. |
| Smart Oblique Gimbal Pitch | `wpml:smartObliqueGimbalPitch` | Oblique + Smart | Degrees (negative, -85 to -10) | -45 | Gimbal pitch for smart oblique capture. Stored negative. |
| Inclined Gimbal Pitch | `wpml:inclinedGimbalPitch` | Oblique 5-pass | Degrees (negative, -85 to -40) | -45 | Gimbal pitch for the four oblique passes. -45 is typical for photogrammetry. |
| Oblique Route Speed | `wpml:inclinedFlightSpeed` | Oblique 5-pass | m/s | 15 | Separate speed for oblique passes. Slower speeds improve image sharpness at oblique angles. |
| Elevation Optimization | `wpml:elevationOptimizeEnable` | Not Oblique 5-pass | `1` (on), `0` (off) | `1` | Adjusts flight altitude along lines to maintain constant GSD over varying terrain. Only available when not in plain oblique mode. |
| Photo Mode | `wpml:shootType` | All modes | `distance`, `time` | `distance` | `distance` triggers capture at fixed metre intervals. `time` triggers at fixed second intervals. Distance is preferred for consistent overlap. Forced to `distance` when Smart Oblique is on. |
| Course Angle | `wpml:direction` | All modes | 0-360 degrees | 0 | Bearing of flight lines relative to north. Align with the longest polygon axis to minimize turns. |
| Margin | `wpml:margin` | All modes | metres | 0 | Extra distance flown beyond the polygon boundary at each line end. Ensures full coverage at edges. |

### 3.3 Overlap Settings

| UI Label | XML Tag | Condition | Default | Flight Impact |
|----------|---------|-----------|---------|---------------|
| Forward Overlap | `wpml:overlap > wpml:orthoCameraOverlapH` | All modes | 80% | Along-track image overlap. Higher values improve stitching reliability but increase photo count and flight time. |
| Side Overlap | `wpml:overlap > wpml:orthoCameraOverlapW` | All modes | 70% | Across-track overlap between adjacent lines. Higher values reduce gaps but increase number of flight lines. |
| Oblique Forward Overlap | `wpml:overlap > wpml:inclinedCameraOverlapH` | Oblique 5-pass | 80% | Forward overlap for the four oblique passes. |
| Oblique Side Overlap | `wpml:overlap > wpml:inclinedCameraOverlapW` | Oblique 5-pass | 70% | Side overlap for the four oblique passes. |

### 3.4 Height Modes (Area Survey)

Height modes control the vertical reference for flight altitude. Area Survey and Waypoint Route use **different XML values** for the same concepts.

| UI Label | `heightMode` XML Value | `surfaceFollowModeEnable` | `isRealtimeSurfaceFollow` | Description | Flight Impact |
|----------|----------------------|--------------------------|--------------------------|-------------|---------------|
| ALT (Relative) | `relativeToStartPoint` | _absent_ | _absent_ | Altitude relative to the takeoff point. | Simplest mode. Suitable for flat terrain. GSD varies with terrain elevation changes. |
| ASL (Above Sea Level) | `EGM96` | _absent_ | _absent_ | Altitude above EGM96 geoid (sea level). | For sites with known ASL elevations. Consistent absolute height but GSD still varies with terrain. |
| AGL Pre-planned | `EGM96` | `1` | `0` | Above ground level using a pre-loaded DSM. | Maintains constant AGL by following a terrain model. Requires a DSM file embedded in the KMZ. Best for consistent GSD over hilly terrain. |
| AGL Real-time (RTTF) | `realTimeFollowSurface` | `1` | `1` | Above ground level using the drone's real-time terrain sensor. | Drone actively adjusts height during flight. No DSM needed but limited to the drone's sensor range (~30m). May cause speed reductions on steep terrain. |

**DSM integration (AGL pre-planned):** When a DSM is provided and `isRealtimeSurfaceFollow` is `0`, the DSM filename is referenced via `<wpml:dsmFile>wpmz/res/dsm/{filename}.tif</wpml:dsmFile>` and the GeoTIFF is embedded in the KMZ under `wpmz/res/dsm/`.

### 3.5 GSD and Altitude

GSD (Ground Sampling Distance) and altitude are bidirectionally linked:

```
GSD (cm/px)  = (sensorWidthMm * altitudeM) / (focalLengthMm * imageWidthPx) * 100
Altitude (m) = (gsdCm / 100 * focalLengthMm * imageWidthPx) / sensorWidthMm
```

Flight line spacing and photo interval are derived from GSD:

```
footprintWidth   = (sensorWidthMm * altitude) / focalLengthMm
footprintHeight  = (sensorHeightMm * altitude) / focalLengthMm
lineSpacing      = footprintWidth * (1 - sideOverlap / 100)
photoInterval    = footprintHeight * (1 - forwardOverlap / 100)
```

For Oblique + Smart mode, the oblique GSD is computed as `GSD / cos(gimbalAngle)` and is read-only.

### 3.6 Area Survey Wayline Action Groups

These are automated action sequences generated in `waylines.wpml`. They are **not user-configurable** -- the system generates them based on the collection mode.

#### Start Action Group (all modes)

Runs before the first waypoint. Sets up the camera for mapping:

| Action | XML `actionActuatorFunc` | Purpose |
|--------|--------------------------|---------|
| Gimbal to nadir | `gimbalRotate` (pitch -90) | Points camera straight down. |
| Hover 0.5s | `hover` | Stabilises before focus. |
| Set manual focus | `setFocusType` (manual) | Prevents autofocus hunting during flight. |
| Focus to infinity | `focus` (isInfiniteFocus=1) | Locks focus at infinity for aerial mapping. |
| Hover 1s | `hover` | Allows focus to settle. |

#### Standard Capture (Ortho, Oblique 5-pass)

| Trigger | XML `actionTriggerType` | Actions | Span |
|---------|------------------------|---------|------|
| Between points | `betweenAdjacentPoints` | `gimbalAngleLock` | All waypoints in pass |
| Distance interval | `multipleDistance` (param = photo interval in metres) | `gimbalRotate` + `startContinuousShooting` | All waypoints in pass |
| Reach last point | `reachPoint` | `stopContinuousShooting` + `gimbalAngleUnlock` | Last waypoint only |

#### Smart Oblique Capture (Ortho+Smart, Oblique+Smart)

| Trigger | Actions | When |
|---------|---------|------|
| `betweenAdjacentPoints` | `gimbalAngleLock` + `startSmartOblique` | Start of each flight line |
| `reachPoint` | `stopSmartOblique` + `gimbalAngleUnlock` | End of each flight line |

### 3.7 Area Survey Turn Modes

Turn modes are automatically assigned to waypoints based on position:

| Waypoint Position | XML `waypointTurnMode` | `waypointTurnDampingDist` | Behaviour |
|------------------|----------------------|--------------------------|-----------|
| First / last waypoint | `toPointAndStopWithDiscontinuityCurvature` | 0 | Full stop at waypoint, sharp corners. |
| Flight line end (smart oblique, not last) | `toPointAndPassWithContinuityCurvature` | 10 | Fly through with smooth curves, no stop. |
| Mid-line intermediate | `coordinateTurn` | 10 | Banked coordinated turn, no stop. |

---

## 4. Waypoint Route Mode

Waypoint Route loads individual point features from a KML and allows per-waypoint configuration with custom actions.

### 4.1 Global Route Parameters

| UI Label | XML Tag | Values | Default | Description | Flight Impact |
|----------|---------|--------|---------|-------------|---------------|
| Default Height | `wpml:globalHeight` | metres | 80 | Default flight altitude applied to all waypoints unless overridden. | Higher altitude increases safety margin but reduces photo detail. |
| Default Speed | `wpml:autoFlightSpeed` | m/s | 10 | Default flight speed between waypoints. | Faster speeds reduce flight time but may cause motion blur in photos. |
| Default Heading Mode | `wpml:globalWaypointHeadingParam > wpml:waypointHeadingMode` | See heading table | `followWayline` | Default aircraft nose direction. | See heading modes below. |
| Default Turn Mode | `wpml:globalWaypointTurnMode` | See turn table | `toPointAndStopWithDiscontinuityCurvature` | Default path behaviour at waypoints. | See turn modes below. |
| -- | `wpml:caliFlightEnable` | `0` | Fixed | Calibration flight. | Disabled. |
| -- | `wpml:gimbalPitchMode` | `manual` | Fixed | Gimbal pitch control mode. | Manual control allows per-action gimbal commands. |
| -- | `wpml:globalUseStraightLine` | `1` | Fixed | Fly straight between waypoints. | Always enabled. |

### 4.2 Height Modes (Waypoint Route)

Waypoint route height modes use **different XML string values** from Area Survey:

| UI Label | `heightMode` XML Value | Description | Flight Impact |
|----------|----------------------|-------------|---------------|
| AGL | `aboveGroundLevel` | Height above ground level. | The drone maintains altitude relative to the terrain. Best for consistent perspective across varying terrain. |
| ASL | `EGM96` | Height above EGM96 geoid (sea level). | Absolute altitude. The drone flies at a fixed ASL regardless of terrain below. |
| ALT | `relativeToStartPoint` | Height relative to the takeoff/home point. | Simplest mode. Good for flat areas. The drone maintains a fixed height above where it took off. |

### 4.3 Per-Waypoint Overrides

Each waypoint can override global defaults. The `useGlobal*` flags control this:

| Override | XML Flag | Behaviour when `1` | Behaviour when absent |
|----------|----------|--------------------|-----------------------|
| Height | `wpml:useGlobalHeight` | Uses `globalHeight` | Uses per-waypoint `wpml:height` |
| Speed | `wpml:useGlobalSpeed` | Uses `autoFlightSpeed` | Uses per-waypoint `wpml:waypointSpeed` |
| Heading | `wpml:useGlobalHeadingParam` | Uses `globalWaypointHeadingParam` | Uses per-waypoint `wpml:waypointHeadingParam` |
| Turn Mode | `wpml:useGlobalTurnParam` | Uses `globalWaypointTurnMode` | Uses per-waypoint `wpml:waypointTurnParam` |

**Important:** These flags are present with value `1` when using the global default, and **completely absent** (not `0`) when the waypoint has a custom override.

Additional per-waypoint field: `wpml:useStraightLine` is always present (`0` or `1`) and does not follow the `useGlobal` pattern.

### 4.4 Heading Modes

| UI Label | XML `waypointHeadingMode` | Description | Flight Impact |
|----------|--------------------------|-------------|---------------|
| Along Route | `followWayline` | Nose points in the direction of travel toward the next waypoint. | Most natural for linear routes. Camera faces forward. |
| Fixed Heading | `fixed` | Nose maintains a constant compass bearing (set via `waypointHeadingAngle`, 0-360 deg). | Useful when all photos need the same perspective direction. The drone yaws independently of its flight path. |
| Manual Control | `manually` | Pilot controls heading via the RC during the mission. | For situations requiring real-time framing adjustments. |

### 4.5 Turn Modes

| UI Label | XML `waypointTurnMode` | Description | Flight Impact |
|----------|----------------------|-------------|---------------|
| Stop, sharp corners | `toPointAndStopWithDiscontinuityCurvature` | Drone stops at the waypoint, then turns sharply to the next heading. | Best for precise positioning. Adds time at each waypoint but ensures exact location for photos/actions. |
| Coordinated turn | `coordinateTurn` | Smooth banked turn without stopping. | Fastest through waypoints. The drone may not pass exactly through the waypoint coordinates. |
| Stop, smooth curves | `toPointAndStopWithContinuityCurvature` | Drone stops at the waypoint with smooth curved approach/departure. | Gentler than sharp corners. Good for video recording. |
| Fly-through, smooth | `toPointAndPassWithContinuityCurvature` | Drone flies through the waypoint on a smooth curve without stopping. | No pause at waypoint. Actions triggered at closest approach. Fastest continuous motion. |

The `waypointTurnDampingDist` parameter (default 0.2m) controls the curve radius for smooth turn modes.

### 4.6 Waypoint Actions

Actions are configured per-waypoint and execute at or between waypoints. They are organised into 4 categories.

#### Action Triggers

| Trigger | XML `actionTriggerType` | Param | Use Case |
|---------|------------------------|-------|----------|
| Reach Point | `reachPoint` | None | Execute when the drone arrives at the waypoint. All non-interval actions use this trigger. |
| Timed Interval | `multipleTiming` | Seconds (e.g. 3) | Repeat every N seconds. Used by Timed Interval Shot. |
| Distance Interval | `multipleDistance` | Metres (e.g. 10) | Repeat every N metres of flight. Used by Distance Interval Shot. |

#### Action Grouping Rules

- All `reachPoint`-triggered actions on a waypoint are collected into **one** `actionGroup` with sequential `actionId` values.
- Each `timedIntervalShot` or `distanceIntervalShot` gets its **own** `actionGroup` with the appropriate trigger type and param.
- `endIntervalShot` produces **no XML** -- it is a UI-only marker.
- `recordCurrentAttitude` produces **no XML** -- it is a UI-only marker.
- The `actionGroupId` counter increments **globally** across all waypoints (not per-waypoint).
- When the lens is set to `both` (M4T only), a single action expands into **two** XML `<wpml:action>` elements with consecutive `actionId` values -- one for `visable` and one for `ir`.

#### Capture Actions

| UI Label | XML `actionActuatorFunc` | Trigger | Lens Selector | Parameters | Flight Impact |
|----------|--------------------------|---------|---------------|------------|---------------|
| Take Photo | `takePhoto` | `reachPoint` | Yes | `fileSuffix` (optional name), `payloadLensIndex` | Captures a single photo when arriving at the waypoint. |
| Start Recording | `startRecord` | `reachPoint` | Yes | `payloadLensIndex` | Begins video recording. Must be paired with Stop Recording. |
| Stop Recording | `stopRecord` | `reachPoint` | No | -- | Stops video recording. |
| Start Timed Interval Shot | `takePhoto` | `multipleTiming` | Yes | `payloadLensIndex`, trigger param = interval in seconds (default 3) | Takes photos at fixed time intervals. Creates a separate action group. |
| Start Distance Interval Shot | `takePhoto` | `multipleDistance` | Yes | `payloadLensIndex`, trigger param = interval in metres (default 10) | Takes photos at fixed distance intervals. Creates a separate action group. |
| End Interval Shot | _no XML output_ | -- | No | -- | UI marker indicating interval capture should stop. Does not generate any XML. |

#### Camera Actions

| UI Label | XML `actionActuatorFunc` | Lens Selector | Parameters | Flight Impact |
|----------|--------------------------|---------------|------------|---------------|
| Gimbal Tilt | `gimbalRotate` | No | `gimbalPitchRotateAngle` (-90 to 30 deg), `gimbalYawRotateAngle` (-180 to 180 deg), `gimbalHeadingYawBase` (`north` or `aircraft`) | Points the camera to a specific angle. -90 = straight down (nadir), 0 = horizontal. |
| Camera Zoom | `zoom` | No | `focalLength` (24-168mm for M4D/M4E) | Adjusts optical/digital zoom. 24mm is wide, 168mm is maximum telephoto. |
| Take Photo (Fixed Angle) | `orientedShoot` | Yes | `gimbalPitchRotateAngle`, `gimbalYawRotateAngle`, `aircraftHeading` (0-360 deg), `focalLength` | Combines aircraft heading, gimbal angle, and zoom into a single oriented capture. Used for precise inspection photos. |
| Pano | `panoShot` | Yes | `panoShotSubMode` (`panoShot_360`) | Captures a 360-degree panorama. The drone hovers and rotates the gimbal through multiple positions. Adds significant time (~30-60s) per waypoint. |

#### Aircraft Actions

| UI Label | XML `actionActuatorFunc` | Parameters | Flight Impact |
|----------|--------------------------|------------|---------------|
| Aircraft Yaw | `rotateYaw` | `aircraftHeading` (0-360 deg), `aircraftPathMode` (`clockwise` or `counterClockwise`) | Rotates the aircraft nose to a specific heading. Does not move the drone's position. |
| Hover | `hover` | `hoverTime` (seconds, default 3) | Pauses at the waypoint for the specified duration. Useful for stabilisation before photos or waiting for gimbal movement. |

#### File Actions

| UI Label | XML `actionActuatorFunc` | Parameters | Flight Impact |
|----------|--------------------------|------------|---------------|
| Create Folder | `customDirName` | -- | Creates a new output folder on the drone's storage. Photos taken after this action go into the new folder. |
| Record Current Attitude | _no XML output_ | -- | UI-only marker. Does not generate any XML in the mission file. |

### 4.7 Lens Selection by Drone

| Drone | `payloadEnum` | Available Lens Values | Behaviour |
|-------|---------------|-----------------------|-----------|
| M4D / M4E | 98 | `visable` only | No lens selector shown in UI. All captures use the visible sensor. |
| M4T | 99 | `visable`, `ir`, `both` | 3-way toggle in UI. `both` generates two XML actions per capture (one visible, one IR). |

The `payloadLensIndex` XML tag stores the lens choice. When `useGlobalPayloadLensIndex` is `0`, the per-action lens value is used.

---

## 5. KMZ File Structure

Every FH2 mission is a ZIP file with `.kmz` extension:

```
wpmz/
  template.kml      -- Mission definition (parameters, waypoints, actions)
  waylines.wpml     -- Computed execution plan (waypoints with actions)
  res/dsm/*.tif     -- Optional DSM for pre-planned terrain follow (Area Survey AGL only)
```

Both `template.kml` and `waylines.wpml` contain:
- An identical `<wpml:missionConfig>` block
- Waypoint `<Placemark>` elements with action groups

The template defines **what** the mission is. The waylines define **how** to fly it. FH2 reads actions from the template.

---

## 6. CRS Auto-Detection

For Australian sites, GDA2020 MGA zones are auto-detected:

| Longitude Range | MGA Zone | EPSG |
|----------------|----------|------|
| 108-114 deg E | 49 | 7849 |
| 114-120 deg E | 50 | 7850 |
| 120-126 deg E | 51 | 7851 |
| 126-132 deg E | 52 | 7852 |
| 132-138 deg E | 53 | 7853 |
| 138-144 deg E | 54 | 7854 |
| 144-150 deg E | 55 | 7855 |
| 150-156 deg E | 56 | 7856 |

Elsewhere: WGS84 UTM zones (EPSG 326xx north, 327xx south).
