# FH2 Flight Planning Rules

Reference for current Route Builder behavior after WPML alignment updates.

- XML namespace: `xmlns:wpml="http://www.dji.com/wpmz/1.0.6"`
- KML namespace: `xmlns="http://www.opengis.net/kml/2.2"`

---

## 1) Supported Drone and Payload Presets

All presets use 9.6 x 7.2 mm sensor, 6.72 mm focal length, 5280 x 3956 image size.

| Preset | `droneEnumValue` | `droneSubEnumValue` | `payloadEnumValue` | `payloadSubEnumValue` | `orientedCameraType` | `imageFormat` | RTK |
|---|---:|---:|---:|---:|---:|---|---|
| M300 RTK | 60 | 0 | swappable | 0 | 52 (default) | `visible` | Yes |
| M30 | 67 | 0 | 52 | 0 | 52 | `visible` | No |
| M30T | 67 | 1 | 53 | 0 | 53 | `visible,ir` | No |
| M3E | 77 | 0 | 66 | 0 | 66 | `visible` | Yes |
| M3T | 77 | 1 | 67 | 0 | 66 | `visible,ir` | Yes |
| M3M | 77 | 2 | 68 | 0 | 66 | `visible,narrow_band` | Yes |
| M350 RTK | 89 | 0 | swappable | 0 | 52 (default) | `visible` | Yes |
| M3D | 91 | 0 | 80 | 0 | 80 | `visible` | Yes |
| M3TD | 91 | 1 | 81 | 0 | 80 | `visible,ir` | Yes |
| M4D Wide (24mm) | 100 | 0 | 98 | 0 | 99 | `visible` | No |
| M4E Wide (24mm) | 100 | 0 | 98 | 0 | 99 | `visible` | No |
| M4T (Thermal) | 100 | 1 | 99 | 2 | 99 | `visible,ir` | No |

### Swappable Payloads (M300/M350)

| Payload | `payloadEnumValue` | `payloadSubEnumValue` | `orientedCameraType` |
|---|---:|---:|---:|
| H20 | 42 | 0 | 52 |
| H20T | 43 | 0 | 53 |
| H20N | 61 | 0 | inherited/default |
| H30 | 82 | 0 | inherited/default |
| H30T | 83 | 0 | inherited/default |
| PSDK Device | 65534 | 0 | inherited/default |

---

## 2) Shared Mission Config (`wpml:missionConfig`)

This block is written in both `template.kml` and `waylines.wpml`.

| UI Label | XML | Values | Default | Flight impact |
|---|---|---|---|---|
| Finish Action | `wpml:finishAction` | `goHome`, `autoLand`, `goContinue`, `noAction` | `goHome` | Defines behavior after mission completion. |
| RC Lost Mode | `wpml:exitOnRCLost` | `goContinue`, `executeLostAction` | `goContinue` | Continue mission vs enter failsafe branch. |
| RC Lost Action | `wpml:executeRCLostAction` | `goBack`, `landing`, `hover` | `goBack` | Action used when mode is `executeLostAction`. |
| Takeoff Safety Height | `wpml:takeOffSecurityHeight` | clamped to `[1.2, 1500]` m | Area `120`, Waypoint `80` | Vertical clearance before route join. |
| Transitional Speed | `wpml:globalTransitionalSpeed` | number (m/s) | `15` | Transit speed to/from route. |
| Global RTH Height | `wpml:globalRTHHeight` | number (m) | `100` | Return-to-home obstacle clearance. |
| Positioning Type | `wpml:waylineCoordinateSysParam > wpml:positioningType` | `GPS`, `RTKBaseStation`, `QianXun`, `Custom` | `GPS` (auto-upgraded to `RTKBaseStation` for RTK drones when left as GPS) | Affects navigation and expected positioning source. |
| Obstacle bypass | `wpml:transitionalAutoRerouteMode`, `wpml:missionAutoRerouteMode` | `1`/`0` | `1` | Enables/disables DJI reroute behavior. |
| Geozone bypass | `wpml:waylineAvoidLimitAreaMode` | `1`/`0` | `1` | Fly through or respect geozones. |
| Payload position | `wpml:payloadPositionIndex` | `0`, `1`, `2` | `0` | Relevant to multi-gimbal platforms. |

---

## 3) Area Survey and Mapping Strip

### 3.1 Template types

| Mode | `wpml:templateType` |
|---|---|
| Standard ortho/oblique | `mapping2d` / `mapping3d` |
| Corridor / strip mapping | `mappingStrip` |

### 3.2 Survey heading block

Area template placemark now emits:

```xml
<wpml:mappingHeadingParam>
  <wpml:mappingHeadingMode>followWayline|fixed</wpml:mappingHeadingMode>
  <wpml:mappingHeadingAngle>...</wpml:mappingHeadingAngle> <!-- only when fixed -->
</wpml:mappingHeadingParam>
```

Flight impact:
- `followWayline`: aircraft yaw follows line direction.
- `fixed`: consistent heading for facade/corridor consistency.

### 3.3 Height modes and execute height mapping

Area planning and execution modes are explicitly mapped:

| Planning context | Source mode | Written execute mode |
|---|---|---|
| Relative | `relativeToStartPoint` | `relativeToStartPoint` |
| ASL/AGL preplanned | `EGM96` | `WGS84` |
| Real-time terrain follow | `realTimeFollowSurface` | `realTimeFollowSurface` |

### 3.4 Payload params

Area template payload block includes:
- `dewarpingEnable`
- `modelColoringEnable`
- LiDAR overlap tags when payload is LiDAR-capable:
  - `orthoLidarOverlapH/W`
  - `inclinedLidarOverlapH/W`

### 3.5 Mapping Strip parameters

Strip mode supports:
- `singleLineEnable`
- `cuttingDistance`
- `boundaryOptimEnable`
- `leftExtend`, `rightExtend`
- `includeCenterEnable`
- `stripUseTemplateAltitude`

Input can be LineString KML/KMZ. Corridor polygon is derived from centerline and extend values.

---

## 4) Waypoint Route

### 4.1 Global route parameters

| UI Label | XML | Default | Notes |
|---|---|---|---|
| Default height | `wpml:globalHeight` | `80` | Base height for waypoints using global flag. |
| Default speed | `wpml:autoFlightSpeed` | `10` | Base speed for waypoints using global flag. |
| Default heading mode | `wpml:globalWaypointHeadingParam > wpml:waypointHeadingMode` | `followWayline` | Supports advanced heading modes below. |
| Default heading path | `... > wpml:waypointHeadingPathMode` | `followBadArc` | DJI spelling intentionally preserved. |
| Default turn mode | `wpml:globalWaypointTurnMode` | `toPointAndStopWithDiscontinuityCurvature` | `globalUseStraightLine` emitted only for continuity turn modes. |
| Gimbal pitch mode | `wpml:gimbalPitchMode` | `manual` | `manual` or `usePointSetting`. |

### 4.2 Heading modes

| Mode | XML `waypointHeadingMode` | Extra XML behavior |
|---|---|---|
| Along route | `followWayline` | Heading angle forced to `0` |
| Fixed | `fixed` | Emits `waypointHeadingAngle` |
| Manual | `manually` | Emits heading angle `0` |
| Smooth transition | `smoothTransition` | Emits `waypointHeadingAngle` |
| Toward POI | `towardPOI` | Emits `waypointPoiPoint` and `waypointHeadingPoiIndex` |

### 4.3 Per-waypoint gimbal params

When `gimbalPitchMode = usePointSetting`, each waypoint emits:
- `waypointGimbalHeadingParam`
  - `waypointGimbalPitchAngle`
  - `waypointGimbalYawAngle`

### 4.4 Turn and straight-line rules

- `wpml:useStraightLine` is emitted only for:
  - `toPointAndStopWithContinuityCurvature`
  - `toPointAndPassWithContinuityCurvature`
- `waypointTurnDampingDist` is emitted/validated for `coordinateTurn`.
- Damping is constrained by segment distance safety logic in builder.

### 4.5 Action trigger types

| Trigger | XML | Param |
|---|---|---|
| Reach point | `reachPoint` | none |
| Timed interval | `multipleTiming` | seconds |
| Distance interval | `multipleDistance` | meters |
| Between adjacent points | `betweenAdjacentPoints` | none |

### 4.6 Action catalogue notes

Newly supported/updated:
- `gimbalEvenlyRotate` (forced to `betweenAdjacentPoints`)
- `recordPointCloud` (UI shown for LiDAR payloads)
- `accurateShoot` not in palette, but imported and mapped to `orientedShoot`

Existing lens behavior:
- `imageFormat` uses `visible` spelling.
- `payloadLensIndex` keeps DJI typo `visable` where required.
- lens `both` expands to two XML actions (`visable` + `ir`).

### 4.7 Waypoint safety tags and IDs

- Every waypoint placemark emits `wpml:isRisky` (currently `0` on generation).
- `actionGroupId` increments globally across all waypoints.

---

## 5) Start Action Group (Waypoint waylines)

Waypoint `waylines.wpml` folder supports configurable `wpml:startActionGroup`.

Default sequence:
1. `gimbalRotate` to pitch `-90`
2. `setFocusType` to manual
3. `focus` with infinite focus
4. `hover` (default `0.5` s)

Controlled by:
- `startActionGroupEnabled`
- `startActionGroupPitch`
- `startActionGroupHoverSec`

---

## 6) KMZ Structure and Import Rules

### 6.1 Export structure

```text
wpmz/
  template.kml
  waylines.wpml
  res/dsm/*.tif   (optional)
```

### 6.2 Import behavior

Import supports:
- Template type detection: waypoint / area survey / mapping strip
- Action deserialization from both:
  - placemark-level action groups
  - folder-level action groups (using `actionGroupStartIndex` / `actionGroupEndIndex`)
- Legacy action mapping:
  - `accurateShoot` -> `orientedShoot`
- Risky flag capture:
  - imported `isRisky=1` waypoints are tracked for warning messaging

---

## 7) CRS Auto-detection

Projector auto-select:
- Australia longitudes: GDA2020 MGA zones (EPSG 7849-7856)
- Elsewhere: WGS84 UTM (`326xx` north, `327xx` south)

This controls geometry operations (line generation, offsets, strip corridor creation), then outputs mission coordinates in WGS84 lon/lat.
