# Company World — isolated Three.js app

Entry: `/company-world/`

The page is an isolated 3D-only preview with five switchable world environments. It does not alter or replace `/virtual-office/` or the main application navigation.

## Source layout

- `src/core/Engine.js` — renderer, camera and OrbitControls
- `src/core/Atmosphere.js` — day/night lighting
- `src/core/WorldManager.js` — gateway selection and camera focus
- `src/worlds/CompanyHub.js` — procedural Company Hub scene
- `src/worlds/WorldExperiences.js` — five standalone interactive 3D environments
- `src/data/OfficeOverviewAdapter.js` — read-only existing overview API adapter
- `src/ui/Overlay.js` — HUD and dashboard presentation
- `src/main.js` — composition root

Three.js r187 is pinned in the import map in `index.html`.
