# MF Project Control

Internal construction project-control app for **MF Building Civils & Development**.

* `server/` – Node.js API (Express + SQLite via `node:sqlite`), JWT auth, server-side permissions, photo storage,
  realtime (SSE), audit log, backup/export and the **client PDF report** generator (pdfkit).
* `app/` – Expo (React Native) app. One codebase runs as a **web app** (phones/computers, served by the server)
  and as a **native iOS/Android app** (Expo Go or a build).
* `e2e/` – Playwright browser test that drives the real UI as Admin and as Viewer.

## Quick try on your own computer

```bash
git clone -b claude/mf-project-control-finish-nzx4rw https://github.com/Kwaggabeast8/Projects.git
cd Projects/MFProjectControl
./run-local.sh                 # first run installs + builds (a few minutes), then opens on http://localhost:4000
# sign in: admin@mfbuilding.co.za / ChangeMe-123
```
Optional, in a second terminal: `cd server && node scripts/seed-sample.js` adds a clearly-named sample project and three test logins
(`foreman@`, `client@`, `manager@sample.test`, password `Sample-1234`) so you can try each access level. Skip it for a clean start.
To test from your phone on the same Wi-Fi, open `http://<your-computer's-IP>:4000` in the phone's browser.

## Run it

Requires Node 22.5+.

```bash
# 1. build the web app (served by the API server)
cd app && npm install && npx expo export --platform web

# 2. start the server (serves API + web app on http://localhost:4000)
cd ../server && npm install
ADMIN_EMAIL=admin@mfbuilding.co.za ADMIN_PASSWORD='choose-a-strong-one' npm start
```

On the **first start only** the server creates the first admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD`
(if no password is given a random one is printed to the console). There is no public registration:
the admin creates every other account under **Users**.

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | HTTP port | `4000` |
| `DATA_DIR` | database + uploaded photos. **Must be on persistent storage** when deployed | `server/data` |
| `JWT_SECRET` | session signing secret (auto-generated and stored in the DB if unset) | – |

### Phones
* **Browser:** open the server URL on the phone. "Take photo" uses the phone camera, "Choose from gallery" the photo library.
* **Native app:** `cd app && npx expo start`, open in Expo Go, and enter the server address on the sign-in screen
  (or set `EXPO_PUBLIC_API_URL`). The server must be reachable from the phone (deploy it, or use your LAN address).

### Deploying ("cloud database")
Run the server on any host with a persistent disk (Railway, Render, Fly.io, a VPS …), point `DATA_DIR` at that disk and
put HTTPS in front of it. All data (SQLite database and photos) lives in `DATA_DIR`; back it up with
**Manage → Full database backup / Export with photos**, or by copying the folder.

## Tests

```bash
cd server && npm test            # 26 API tests: every workflow as Admin and Viewer, per-section access (foreman/client/custom), PDF, export, realtime
cd e2e && ./fresh.sh && node run.js   # browser test of the real UI (needs the web build + the server)
```

## Roles and per-project access
* **Admin** – everything: projects, programme, progress, RFIs, variations, delays, site updates, photos, comments, reports, users, access.
* **Team member** – everyone else. They only see projects they are assigned to, and for **each project** the admin chooses, section by section,
  what they can do (Users → tap a project under the person, or project → Manage → Access):

  | Section | Levels (each level includes the ones before it) |
  |---|---|
  | Programme (activity list) | No access / View / Update progress % / Full edit |
  | Gantt chart | No access / View / Edit dates & progress |
  | Site updates | No access / View / Add & edit own / Edit everyone's |
  | Project photos | No access / View / Upload & manage own / Manage everyone's |
  | RFIs, Variations, Delays | No access / View / Add / edit |
  | Comments | No access / View / Can post / Post + delete any |
  | Progress history | No access / View / Take snapshots / Snapshots + delete |

  Quick presets: **Viewer / Commenter**, **Foreman (site)** (update progress %, add site updates + photos, record delays, view Gantt/RFIs, no variations),
  **Site manager (broad edit)** (edit the programme and Gantt, everyone's updates/photos/comments/snapshots, RFIs, variations, delays),
  **Client (limited)** (programme, Gantt, updates, photos, history, comments; no RFIs/variations/delays) – then adjust any section ("Custom").
  Sections set to *No access* disappear from the app and the server returns nothing for them (including photo URLs). Every check is enforced on the server (403).
  With *edit* on site updates / photos people can only change the ones they created; *everyone's* lets them change anyone's. Reports, export, audit log, and user / project administration stay admin-only.

## Notes
* Planned progress is calculated from activity dates (linear between start and finish; milestones are 0 → 100 on their date);
  overall figures are weighted by activity weight (equal weights if all weights are 0).
* Changing an activity's dates moves dependent (successor) activities later when they would otherwise start before it finishes (finish-to-start).
* A progress snapshot is taken automatically each week for active projects (and can be taken manually on the **History** tab).
* On native devices realtime falls back to polling every 12 s and on app foreground; on the web it uses server-sent events.
