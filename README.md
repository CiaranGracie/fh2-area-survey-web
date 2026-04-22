# FH2 Area Survey Generator (Web)

Browser-based React + Vite port of `generate_area_survey.py` for static hosting on GitHub Pages.

## Features

- Load polygon from `.kml` or `.kmz`
- Configure mission parameters (mode, overlaps, altitude, speed, course)
- Preview generated lines on an interactive Leaflet map
- Optional DSM GeoTIFF sampling in-browser (best with EPSG:4326 rasters)
- Export DJI FlightHub2-style mission archive as `.kmz` (`wpmz/template.kml` + `wpmz/waylines.wpml`)

## Stack

- React + Vite + TypeScript
- `leaflet` for map display
- `proj4` and custom geometry sweep-line logic for line generation
- `jszip` for KMZ read/write
- `geotiff` for optional terrain sampling
- `vitest` for core math/geometry tests

## Local Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

For GitHub Pages pathing, set base path when building:

```bash
VITE_BASE_PATH=/your-repo-name/ npm run build
```

## Tests

```bash
npm run test
```

## Deploy to GitHub Pages

This repo includes `.github/workflows/deploy-pages.yml` that:

1. Installs dependencies
2. Builds with `VITE_BASE_PATH=/${repo-name}/`
3. Uploads `dist/` as Pages artifact
4. Deploys via `actions/deploy-pages`

Enable Pages in repository settings and select **GitHub Actions** as source.

## Notes and Limits

- This is a browser port and not byte-for-byte parity with the desktop Python output.
- Large DSM rasters can be memory-heavy in browsers.
- For the best DSM result, use EPSG:4326 rasters or pre-process them before upload.
