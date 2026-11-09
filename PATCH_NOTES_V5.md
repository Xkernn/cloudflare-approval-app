# Beerlao Company World — Isometric Visual Update V5

This is an incremental patch. It contains only files added or modified for the Company World 3D visual update.

## Files
- `public/company-world/index.html`
- `public/company-world/styles.css`
- `public/company-world/src/core/Engine.js`
- `public/company-world/src/core/Atmosphere.js`
- `public/company-world/src/core/WorldManager.js`
- `public/company-world/src/worlds/CompanyHub.js`
- `public/company-world/src/ui/Overlay.js`
- `public/company-world/src/main.js`

## Install
1. Make a backup of the current `public/company-world/` directory.
2. Extract this ZIP into the project root, preserving folder paths.
3. Confirm the Startup Fix V4 CSP change is already deployed. The CSP must allow:
   `https://cdn.jsdelivr.net/npm/three@0.187.0/`
4. Deploy the project and hard-refresh the browser.

## Scope and safety
- This patch changes only the Company World 3D frontend.
- It does not change Backend, API routes, database, schema, login, roles, or business workflows.
- Existing `/api/admin/office-overview` remains GET-only and is still the only source for live overview metrics.
- KPI values remain `—` when the existing API does not provide data. No sample business metrics are inserted.
- The search field currently navigates between world names only; it does not claim to search serial numbers or live assets.

## Validation
- JavaScript module syntax checked with Node.js.
- ZIP integrity checked.
- Browser rendering and production deployment have not been verified in this environment.
