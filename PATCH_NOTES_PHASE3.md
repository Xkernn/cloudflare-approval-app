# Beerlao Company World — Phase 3 Patch V3

## Scope
- Add read-only operational details to Warehouse and Logistics worlds using the existing `GET /api/admin/office-overview` endpoint.
- Surface API-provided stats and recent activity from existing `stock`, `newcoolers`, `delivery`, and `trips` room records.
- Preserve the existing 60-second refresh behavior in `src/main.js`.
- Render API values with DOM `textContent` (no HTML injection from API data).
- Show unavailable/incomplete states instead of fabricating values.

## Files in this patch
- `public/company-world/index.html`
- `public/company-world/styles.css`
- `public/company-world/src/data/OfficeOverviewAdapter.js`
- `public/company-world/src/ui/Overlay.js`

## Install
1. Extract this ZIP into the project root, preserving folder paths.
2. No build, migration, package, backend, API, authentication, role, or database changes are required.
3. The Phase 3 patch assumes the Company World files from the Menu Integration Patch V3 are already installed.

## Validation performed
- JavaScript syntax check passed for changed modules.
- Relative JS import resolution check passed for the Company World module tree.
- Adapter mock test passed: GET-only request, canonical room de-duplication, warehouse/logistics aggregation, and latest activity ordering.
- ZIP integrity checked.
- Browser/deployment integration has not yet been tested against the live authenticated app.
