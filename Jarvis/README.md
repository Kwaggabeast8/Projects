# Jarvis

A small personal assistant powered by Claude, with tools for the time, math,
notes and opening websites.

```
pip install -r requirements.txt
export ANTHROPIC_API_KEY=sk-ant-...
python jarvis.py            # text mode
python jarvis.py --voice    # voice mode (uncomment optional deps first)
```

Set `JARVIS_MODEL` to change the model (default `claude-opus-5-5`).
Add new abilities by appending to `TOOLS` and handling them in `run_tool`.
