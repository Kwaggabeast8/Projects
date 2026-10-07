#!/usr/bin/env bash
# Jarvis installer for macOS / Linux.  Run:  bash install.sh
set -e
cd "$(dirname "$0")"
PY=$(command -v python3 || true)
if [ -z "$PY" ] || ! "$PY" -c 'import sys; sys.exit(sys.version_info < (3,10))'; then
  echo "Python 3.10 or newer is required. Install it from https://www.python.org/downloads/ and run this again."; exit 1
fi
"$PY" -m venv .venv
.venv/bin/pip install -q --upgrade pip
.venv/bin/pip install -r requirements.txt

if [ ! -f .env ] || ! grep -q '^ANTHROPIC_API_KEY=.' .env; then
  echo
  echo "Get an API key at https://console.anthropic.com (API keys -> Create key; add a few dollars of credit)."
  read -rsp "Paste your API key here and press Enter (it will not show): " key; echo
  printf 'ANTHROPIC_API_KEY=%s\n' "$key" > .env
  chmod 600 .env
fi

cat > "Start Jarvis.command" <<'RUN'
#!/usr/bin/env bash
cd "$(dirname "$0")"
exec .venv/bin/python jarvis.py --ui
RUN
chmod +x "Start Jarvis.command"
echo
echo "Installed. To start Jarvis:  bash 'Start Jarvis.command'   (on a Mac you can also double-click it)"
