# Menu Integration Patch V3

- Existing menu label and Admin-only visibility are unchanged.
- `openVirtualOffice()` now opens `/company-world/`.
- New Company Hub uses the isolated Three.js ES Module implementation.
- Old dedicated 3D runtime directory `public/virtual-office/` is marked for removal.
- No backend, API, database, authentication, or business workflow files are included.
- The API adapter uses the existing `/api/admin/office-overview` endpoint read-only.
