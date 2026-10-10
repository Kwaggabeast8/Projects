# Per-person access levels on the live Floot app - DONE and published (2026-10-10)

Floot project `6f1fa811-5c1f-4937-add8-0e5d6c6af483`, live at https://mf-project-control.floot.app.

## What was built
- `project_members.permissions jsonb` (null = legacy "view everything + comment", so existing accounts are unchanged).
- Shared `helpers/permissions` (sections, levels, presets Viewer / Foreman / Site manager / Client, `mayChange`), spec in `helpers/permissions.spec.tsx`.
- Server: `serverApi.requireSection`; every register / programme / site-update / photo / comment / snapshot endpoint checks the caller's level;
  `project_GET` and `projects_GET` return only what the person may see; `subcontractors_GET` is names-only for non-admins.
- App: tabs follow access; foremen land on Site updates; own-vs-everyone's edit rules; `AccessEditor` in Users & access and in each project's Access & audit tab.
- Admin-only (unchanged): project setup, baseline, client report / email, export, users, access, audit log.

## Testing done (against the real backend, temporary ZZ accounts, since deleted)
- 80 checks: foreman, client, legacy viewer (null permissions), custom and Site-manager access, live changes, removal, normalisation, audit trail.
- 29 checks: admin regression on every changed endpoint.
- Unit spec for permissions passes; whole project type-checks clean.
- Not verified: the screens visually in a browser (no preview window was open during the session).
