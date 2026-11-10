# Beerlao Admin UI — Phase 5 QA & Deployment

## Scope
- Admin UI visual layer only.
- Existing API, authentication, database schema, role permissions, and business workflows are not intentionally changed.
- The Admin theme is enabled by `renderMobileTabbar(role)` only when `role === 'admin'`. CSS selectors for this redesign are scoped under `body.admin-ux-v2`.
- Assistant Admin and all other roles are not included in this Admin-only rollout.

## Static QA completed
- Extracted and syntax-checked all 11 inline JavaScript blocks with Node.js: passed.
- Checked all 11 inline CSS blocks for balanced braces: passed.
- Confirmed the navigation, dashboard, management, and mobile Phase 2–4 style blocks are present once each.
- Confirmed the Admin body-class toggle is present once and scoped styles use `body.admin-ux-v2`.
- Patch payload contains only the existing frontend entry point plus this deployment note.

## QA limitations / not yet verified
- The repository has no automated test suite (`npm test` is a placeholder that exits with an error).
- Dependencies are not installed in this working copy; Wrangler dry-run/build was not completed.
- No live browser/device test, authenticated Admin test, or production deployment was performed.
- Therefore this is static QA, not a claim of full end-to-end sign-off.

## Apply with GitHub
1. Download and extract this ZIP.
2. Copy the included `New folder (3)/public/index.html` into the same path in your GitHub repository, replacing the existing file.
3. Copy `New folder (3)/ADMIN_UI_PHASE5_DEPLOYMENT.md` into the repository if you want to keep the QA record.
4. Commit and push to the branch connected to your Cloudflare deployment.
5. Wait for the deployment to finish, then open the app and hard-refresh (Ctrl+Shift+R).

## Post-deploy manual smoke test
1. Sign in as Admin and verify the dashboard, menu, management pages, tables, dialogs, and mobile tab bar.
2. Test at desktop, tablet, and mobile widths; verify horizontal table scrolling and modal safe-area spacing.
3. Sign in separately as MDE, DSM, Warehouse, Delivery, and other configured roles; verify their prior UI and navigation remain unchanged.
4. Verify existing actions still work: open records, search/filter, submit forms, approve/reject where permitted, and sign out.
5. Check browser DevTools Console and Network for JavaScript errors, failed assets, or API errors.
6. If any non-Admin role changes visually or a workflow fails, revert the frontend file commit and investigate before redeploying.

## Rollback
Revert the commit that replaced `public/index.html`, then push the revert to the deployment branch. No database migration is required for this UI patch.
