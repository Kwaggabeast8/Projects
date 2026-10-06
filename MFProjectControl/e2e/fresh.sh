#!/bin/sh
# restart the API server on an empty database (used before each e2e run)
[ -f /tmp/claude-0/server.pid ] && kill "$(cat /tmp/claude-0/server.pid)" 2>/dev/null
sleep 0.5
rm -rf /tmp/claude-0/e2edata
cd "$(dirname "$0")/../server"
DATA_DIR=/tmp/claude-0/e2edata PORT=4100 ADMIN_EMAIL=admin@mf.test ADMIN_PASSWORD=AdminPass123 nohup node src/server.js > /tmp/claude-0/server.log 2>&1 &
echo $! > /tmp/claude-0/server.pid
sleep 1.5
