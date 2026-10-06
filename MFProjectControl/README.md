# MF Project Control

Internal construction project-control app for **MF Building Civils & Development**.

* `server/` – Node.js API (Express + SQLite via `node:sqlite`), JWT auth, server-side permissions, photo storage,
  realtime (SSE), audit log, backup/export and the **client PDF report** generator (pdfkit).
* `app/` – Expo (React Native) app. One codebase runs as a **web app** (phones/computers, served by the server)
  and as a **native iOS/Android app** (Expo Go or a build).
* `e2e/` – Playwright browser test that drives the real UI as Admin and as Viewer.

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
cd server && npm test            # 15 API tests: every workflow as Admin and Viewer, permissions, PDF, export, realtime
cd e2e && ./fresh.sh && node run.js   # browser test of the real UI (needs the web build + the server)
```

## Roles
* **Admin** – everything: projects, programme, progress, RFIs, variations, delays, site updates, photos, comments, reports, users, access.
* **Viewer / Commenter** – sees only assigned projects; views programme/progress/records, posts comments (with photos) on those projects.
  Every write is enforced on the server (403), not just hidden in the UI.

## Notes
* Planned progress is calculated from activity dates (linear between start and finish; milestones are 0 → 100 on their date);
  overall figures are weighted by activity weight (equal weights if all weights are 0).
* Changing an activity's dates moves dependent (successor) activities later when they would otherwise start before it finishes (finish-to-start).
* A progress snapshot is taken automatically each week for active projects (and can be taken manually on the **History** tab).
* On native devices realtime falls back to polling every 12 s and on app foreground; on the web it uses server-sent events.
