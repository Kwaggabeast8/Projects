#!/usr/bin/env bash
# One-step Jarvis installer for macOS / Linux. Run from the Jarvis folder: ./install.sh
set -e
cd "$(dirname "$0")"
command -v python3 >/dev/null || { echo "Please install Python 3.10+ first."; exit 1; }

if [ "$(uname)" = "Darwin" ]; then
  command -v brew >/dev/null && brew install portaudio || echo "Install Homebrew + portaudio for voice mode."
elif command -v apt-get >/dev/null; then
  sudo apt-get install -y portaudio19-dev python3-dev python3-venv espeak
fi

python3 -m venv .venv
.venv/bin/pip install -q --upgrade pip
.venv/bin/pip install -r requirements.txt

if [ -z "$ANTHROPIC_API_KEY" ] && [ ! -f .env ]; then
  read -rsp "Paste your Anthropic API key (stored only in Jarvis/.env on this machine): " key; echo
  printf 'ANTHROPIC_API_KEY=%s\n' "$key" > .env
  chmod 600 .env
fi

cat > jarvis <<'RUN'
#!/usr/bin/env bash
cd "$(dirname "$0")"
set -a; [ -f .env ] && . ./.env; set +a
exec .venv/bin/python jarvis.py "$@"
RUN
chmod +x jarvis
echo; echo "Done. Start Jarvis with:  ./jarvis --voice"
