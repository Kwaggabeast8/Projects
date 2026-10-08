# Per-person access levels on the live Floot app - status

Floot project: `6f1fa811-5c1f-4937-add8-0e5d6c6af483` ("MF Project Control", https://mf-project-control.floot.app).
**Nothing from this work is published.** The live app is unchanged. Work stopped when Floot's daily build limit
(100 actions/day, resets 2026-10-09 18:00 UTC, or upgrade to Pro) was reached.

## Done in the Floot editing copy (not live)
- DB: `project_members.permissions jsonb` (nullable; null = old "view everything + comment" behaviour). Applied to the shared database (harmless to the live app).
- `helpers/permissions.tsx` - sections, levels, presets (Viewer, Foreman, Site manager, Client), `mayChange`, `fromStored`.
- `helpers/serverApi.tsx` - `requireProject` now returns `perms`/`isAdmin`; new `requireSection(request, projectId, section, level)`.
- Endpoints moved to section checks: rfi, variation, delay, instruction, snag, safety, snapshot, activity, activity-delete, activity-reorder,
  activity-update (progress level), site-update (own vs everyone's), record-delete, file, file-update, upload, comment.
  Still admin-only (unchanged): projects POST, activity-baseline, report-*, export, admin/*.
- `project_GET` filters every section by view access and returns `permissions`, `createdById`, `uploadedById`, member `permissions`.
- `projects_GET` hides RFI/delay counts and progress the person cannot see (`openRfis`/`openDelays` may be null; `_index.tsx` updated).
- `admin/membership_POST` accepts `permissions`; `admin/users_GET` returns `access`; `subcontractors_GET` now names-only for non-admins.
- UI done: SiteUpdatesTab, PhotosTab, CommentsTab (own/everyone's rules), `components/AccessEditor.tsx` (+ .module.css) written but not wired in.

## Still to do (in this order)
1. **HistoryTab is currently broken** in the editing copy: it uses `permissions` but the import is missing. Add
   `import { permissions } from "../helpers/permissions";` and replace the remaining `data.canEdit` uses with `canSnap` (snapshot form,
   empty-state text) and `canDelete` (delete column header + row cell).
2. ProgrammeTab: let `progress`-level users use the quick progress input (add `canProgress?: boolean` to `OutputType` in `project_GET.schema.ts`; ProgrammeTab uses `data.canEdit || data.canProgress` where it renders `ProgressInput`).
3. `pages/project.$projectId.tsx`: show only tabs with access (`d.permissions`); pass per-tab overrides
   (`{...d, canEdit: perm === "edit"}` for rfis/variations/delays/instructions/snags/safety; programme: edit + canProgress); hide the stats strip when the person has neither programme nor gantt access;
   land foremen on "updates" (updates edit/all and programme not edit); update the "view & comment" note.
4. `components/ProjectAdminTab.tsx`: per member show `<AccessTag>` + "Access" button opening `<AccessEditor>`; preset picker next to "Give access".
5. `pages/admin.users.tsx`: rename role to "Team member (access set per project)", show per-project `AccessTag` using `access`, open `AccessEditor`; pass a preset when assigning new projects.
6. `components/AccessEditor.module.css`: replace `--space-2` with `--spacing-2`.
7. Typecheck, create two test users (foreman + client) and test in the preview, `create_checkpoint`, then `publish_app`.
