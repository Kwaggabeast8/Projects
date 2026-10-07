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

## Safety
- Actions that change your machine (`run_command`, `write_file`, `click`,
  `type_text`, `press_keys`) are read back to you; say "yes" to approve.
- `--auto` disables that. Only use it if you trust what you're asking for.
- Mouse failsafe: throw the cursor into a screen corner to abort GUI control.
- Voice recognition uses Google's free web recognizer, so your speech is sent to Google.

## Options
`--wake WORD` (default `jarvis`; after a command it keeps listening 30s without the wake word),
`JARVIS_MODEL` env var to change the model. Say "goodbye" to quit.
