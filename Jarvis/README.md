# Jarvis

A voice-controlled computer assistant powered by Claude.

```
pip install -r requirements.txt        # PyAudio may need portaudio (apt install portaudio19-dev / brew install portaudio)
export ANTHROPIC_API_KEY=sk-ant-...
python jarvis.py --voice               # say "Jarvis, open my downloads folder"
python jarvis.py                       # typed mode
```

## What it can do
Run shell commands, read/write/list files, open apps/files/URLs, search the web,
take screenshots, click, type and press keys, keep notes, do math. Because it can
run commands, it can do anything your user account can.

## Smart home, email, calendar
Optional; each turns on when its variables are set (see `.env.example`).
- **Smart home:** Home Assistant REST API (lights, switches, climate, scenes, anything HA exposes).
- **Email:** any IMAP/SMTP provider; read, list and send.
- **Calendar:** Google Calendar; first use opens a browser to sign in.
Sending email, adding events and controlling devices are confirmed by voice like other risky actions.
Email bodies are treated as untrusted so a malicious message can't give Jarvis orders.

## Private speech recognition
`--stt whisper` transcribes locally with faster-whisper (model via `JARVIS_WHISPER_MODEL`,
default `small.en`) so nothing you say leaves your machine except the text sent to Claude.

## Safety
- Actions that change your machine (`run_command`, `write_file`, `click`,
  `type_text`, `press_keys`) are read back to you; say "yes" to approve.
- `--auto` disables that. Only use it if you trust what you're asking for.
- Mouse failsafe: throw the cursor into a screen corner to abort GUI control.
- Default voice recognition uses Google's free web recognizer; use `--stt whisper` to keep audio local.

## Options
`--wake WORD` (default `jarvis`; after a command it keeps listening 30s without the wake word),
`JARVIS_MODEL` env var to change the model. Say "goodbye" to quit.
