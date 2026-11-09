# Beerlao Company World — Phase 2 Patch

## Scope
3D-only update. Extract this ZIP into the existing application/project root and allow the paths to merge/overwrite.

## Added
- `public/company-world/src/worlds/WorldExperiences.js`
  - Adds standalone Head Office, Warehouse, Retail Network, Logistics, and Province Network 3D environments.

## Updated
- `public/company-world/src/main.js`
  - Registers isolated world groups and animates the active environments.
- `public/company-world/src/core/WorldManager.js`
  - Switches between Company Hub and standalone 3D worlds; animates camera focus.
- `public/company-world/src/ui/Overlay.js`
  - Adds world return navigation and updates gateway status text.
- `public/company-world/index.html`
  - Adds the Company Hub return control.
- `public/company-world/styles.css`
  - Styles the return control, including mobile layout.
- `public/company-world/README.md`
  - Documents the new world experience module.

## Not included / not changed
- Backend, API handlers, database schema/data, authentication, roles, main application pages, main navigation, dependencies, and all non-3D files.
- The legacy `public/virtual-office/` runtime and its archive.

## Validation
- JavaScript module syntax checked successfully with Node's module parser.
- This patch has not yet been browser-tested against a deployed Cloudflare environment.
