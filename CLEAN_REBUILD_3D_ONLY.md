# Beerlao Virtual Company 3D — Clean Rebuild V1

## Scope and safety boundary

This delivery is an isolated 3D-only development copy. The existing application is preserved. No business application files, backend routes, database schema, authentication, roles, workflows, or existing navigation have been changed.

- Existing application entry: `public/index.html` — unchanged.
- Existing backend: `src/` — unchanged.
- Existing database/schema and migrations — unchanged.
- Existing package manifest: `package.json` — unchanged.
- Existing 3D page: `public/virtual-office/` — retained in place and unchanged.
- Legacy 3D backup: `archive/virtual-office-legacy/` — byte-for-byte copy of `public/virtual-office/`.
- New isolated 3D app: `public/company-world/`.

The new 3D page is intentionally not wired into the existing menu yet. Open `/company-world/` directly in a deployment or local HTTP server to preview it. Replacing the existing navigation is a separate integration step and will require explicit approval because it touches the main application shell.

## Engine

- Three.js `0.187.0` (r187), imported as ES Modules through an import map.
- `OrbitControls` imported from `three/addons/controls/OrbitControls.js`.
- WebGL renderer with ACES filmic tone mapping, SRGB output, shadows and adaptive pixel ratio.
- No global `THREE`, no Three.js r128, no legacy OrbitControls script.
- No package.json changes: the isolated page imports the pinned version from jsDelivr.

## Included in V1

- New Company Hub scene with Central Tower, plaza, landscape and five gateway structures.
- Gateway destinations: Head Office, Warehouses, Retail Network, Logistics and Province Network.
- Free camera controls: orbit, pan, zoom, home and selectable gateways.
- Dynamic atmosphere based on Asia/Vientiane time with manual night/day override.
- Responsive overlay UI for desktop and mobile.
- Read-only adapter for existing `GET /api/admin/office-overview` endpoint.
- Live KPI values remain blank until the authorized API responds. No synthetic operational values are shown.

## Not yet included

- Full interior / destination scenes for the five worlds.
- GLB production assets, detailed warehouse rack layouts, exact cooler locations, truck route animation and province-level map data.
- Existing menu switch-over or production deployment.
- Any backend/API/database changes.

## Preview

Serve the project `public` directory over HTTP (not `file://`) and open `/company-world/`.
The Three.js module is loaded from jsDelivr, so the browser needs network access to that CDN. The live overview additionally requires a valid Admin session on the existing application origin.

## Validation

This package is checked for JavaScript module syntax, archive integrity and preservation of the protected application files. A full authenticated browser integration test and production deployment test have not been performed in this environment.
