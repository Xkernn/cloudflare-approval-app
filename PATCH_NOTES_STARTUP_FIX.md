# Company World Startup Fix — Patch V4

## Root cause
The deployed Content-Security-Policy in `public/_headers` allowed the legacy Three.js CDN path `three@0.128.0` but did not allow the new Company World dependency `three@0.187.0`. The browser therefore blocked the ES module request while the loading screen remained visible.

## Files in this patch
- `public/_headers` — adds only the exact Three.js 0.187.0 jsDelivr path to `script-src`; existing policy directives and other allowlists are retained.
- `public/company-world/index.html` — adds a startup failure/timeout message so a future module/CDN/WebGL error is visible instead of leaving an endless splash screen. The current Phase 3 page and import map are retained.

## Install
Extract this patch at the project root and deploy the static assets again. Then hard-refresh `/company-world/` (Ctrl+F5) or clear the site's cached files/service worker if the old response is still cached.

No Backend, API implementation, database, login, role, business page, or workflow files are included or modified.
