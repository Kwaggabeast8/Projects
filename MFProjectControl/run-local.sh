#!/bin/sh
# One command to run MF Project Control locally:  ./run-local.sh   ->  http://localhost:4000
# Needs Node 22.5+. Builds the web app on first run, then starts the server.
set -e
cd "$(dirname "$0")"
[ -d app/node_modules ] || (cd app && npm install)
[ -d server/node_modules ] || (cd server && npm install)
[ -f app/dist/index.html ] || (cd app && npx expo export --platform web)
export ADMIN_EMAIL="${ADMIN_EMAIL:-admin@mfbuilding.co.za}"
export ADMIN_PASSWORD="${ADMIN_PASSWORD:-ChangeMe-123}"
echo "Open http://localhost:${PORT:-4000}   sign in: $ADMIN_EMAIL / $ADMIN_PASSWORD   (admin is created on the first start only)"
cd server && exec node src/server.js
