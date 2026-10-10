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

---

# Documents + reminders/alerts - IN PROGRESS (2026-10-10), NOT published

Stopped at Floot's daily build limit (100/day; resets 2026-10-11 18:00 UTC, or upgrade to Pro). The live app is unchanged (last publish: Admin can delete users).

## Facts that shape the design
- Scheduled jobs / delayed tasks are **Pro-only** (app is on the free plan) -> the 4pm nudge and overdue-RFI emails will not run until Pro.
- Email from the app only reaches the Floot account owner until MF verifies its own email domain (Floot Email tab).
- So: build in layers - Documents (works now), in-app "Needs attention" panel (works now), new-comment email (event-driven, works now but only reaches owner until domain verified), scheduled 4pm nudge + 07:00 overdue-RFI email (ready for Pro) + admin "send reminders now" button.

## Done in the Floot editing copy (not published)
- DB (additive): `users.email_alerts boolean default true`; enum `document_category`; table `project_documents`; table `alert_log` (unique kind+project+day, to de-duplicate alert emails).
- `helpers/permissions`: new section `documents` (none/view/edit/all). Presets: Viewer none, Foreman none, Client none, Site manager all (legacy null permissions => none).
- `helpers/documentTypes` (allowed extensions, 50 MB, labels), endpoints `document-upload`, `document`, `document-file` (private storage, presigned 10-min links, own-vs-everyone's rules), `project_GET` returns `documents` (filtered by access).
- `components/DocumentsTab` (+ css) written, type-checks clean.

## Still to do
1. Wire the tab: in `pages/project.$projectId.tsx` import `DocumentsTab`, add `["documents", "Documents"]` after photos in TABS and a `<TabsContent value="documents"><DocumentsTab data={d} /></TabsContent>`.
2. `helpers/saTime` (Africa/Johannesburg date/hour/weekday) and `helpers/notifications` (branded email shell; recipients = active admins + members with the relevant access, `users.email_alerts` respected; `newComment`, `siteUpdateNudge`, `overdueRfis`; de-dupe with `alert_log`; dry-run option).
3. `comment_POST`: after a successful create, `await` the new-comment email (never fail the post if email fails).
4. Scheduled helpers `siteUpdateNudge` (16:00 Mon-Fri) and `overdueRfiAlerts` (07:00 Mon-Fri), timezone Africa/Johannesburg, in `static/__dev/scheduled-jobs.json`.
5. `endpoints/alerts-run_POST` (admin only; `{kind, dryRun}`) + a "Send reminders now" button.
6. `endpoints/attention_GET` + dashboard "Needs attention" panel (no site update today, overdue RFIs, new comments in 24h; respects each person's access).
7. Per-user "Send me email alerts" switch in Users (user_POST / users_GET / admin.users dialog).
8. Update `helpers/permissions.spec.tsx` (documents section), test on the real backend with temporary ZZ accounts (then delete them), checkpoint, publish.
