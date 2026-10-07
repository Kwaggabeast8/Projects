"""Jarvis - a small personal assistant powered by Claude.

Usage:
    export ANTHROPIC_API_KEY=...
    python jarvis.py            # text chat
    python jarvis.py --voice    # speak and listen (needs the optional deps)
"""
import argparse
import ast
import datetime
import json
import operator
import os
import webbrowser
from pathlib import Path

import anthropic

MODEL = os.environ.get("JARVIS_MODEL", "claude-opus-5-5")
NOTES_FILE = Path(__file__).with_name("notes.json")

SYSTEM = (
    "You are JARVIS, a witty, concise personal assistant. Address the user as "
    "'sir' or 'ma'am' only if they do. Keep replies short, since they may be "
    "spoken aloud. Use your tools when they help; never invent tool results."
)

TOOLS = [
    {
        "name": "get_time",
        "description": "Get the current local date and time.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "calculate",
        "description": "Evaluate an arithmetic expression, e.g. '(12 + 3) * 4 / 5'.",
        "input_schema": {
            "type": "object",
            "properties": {"expression": {"type": "string"}},
            "required": ["expression"],
        },
    },
    {
        "name": "add_note",
        "description": "Save a note or reminder for the user.",
        "input_schema": {
            "type": "object",
            "properties": {"text": {"type": "string"}},
            "required": ["text"],
        },
    },
    {
        "name": "list_notes",
        "description": "List all saved notes.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "open_website",
        "description": "Open an http(s) URL in the user's default browser.",
        "input_schema": {
            "type": "object",
            "properties": {"url": {"type": "string"}},
            "required": ["url"],
        },
    },
]

_OPS = {
    ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul,
    ast.Div: operator.truediv, ast.Pow: operator.pow, ast.Mod: operator.mod,
    ast.FloorDiv: operator.floordiv, ast.USub: operator.neg,
}


def _eval(node):
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    if isinstance(node, ast.BinOp) and type(node.op) in _OPS:
        return _OPS[type(node.op)](_eval(node.left), _eval(node.right))
    if isinstance(node, ast.UnaryOp) and type(node.op) in _OPS:
        return _OPS[type(node.op)](_eval(node.operand))
    raise ValueError("unsupported expression")


def _load_notes():
    try:
        return json.loads(NOTES_FILE.read_text())
    except (OSError, ValueError):
        return []


def run_tool(name, args):
    if name == "get_time":
        return datetime.datetime.now().strftime("%A, %d %B %Y, %H:%M")
    if name == "calculate":
        return str(_eval(ast.parse(args["expression"], mode="eval").body))
    if name == "add_note":
        notes = _load_notes()
        notes.append({"time": datetime.datetime.now().isoformat(timespec="minutes"), "text": args["text"]})
        NOTES_FILE.write_text(json.dumps(notes, indent=2))
        return "Note saved."
    if name == "list_notes":
        return json.dumps(_load_notes()) or "[]"
    if name == "open_website":
        url = args["url"]
        if not url.startswith(("http://", "https://")):
            raise ValueError("only http(s) URLs are allowed")
        webbrowser.open(url)
        return f"Opened {url}"
    raise ValueError(f"unknown tool {name}")


class Jarvis:
    def __init__(self):
        self.client = anthropic.Anthropic()
        self.messages = []

    def ask(self, text):
        self.messages.append({"role": "user", "content": text})
        while True:
            response = self.client.messages.create(
                model=MODEL,
                max_tokens=4096,
                system=SYSTEM,
                tools=TOOLS,
                messages=self.messages,
            )
            # Keep the full content (incl. thinking blocks) in history.
            self.messages.append({"role": "assistant", "content": response.content})
            if response.stop_reason == "refusal":
                return "I'm afraid I can't help with that."
            if response.stop_reason != "tool_use":
                return "".join(b.text for b in response.content if b.type == "text")
            results = []
            for block in response.content:
                if block.type != "tool_use":
                    continue
                try:
                    out, is_error = run_tool(block.name, block.input), False
                except Exception as e:  # report failures back to the model
                    out, is_error = f"Error: {e}", True
                results.append({
                    "type": "tool_result", "tool_use_id": block.id,
                    "content": out, "is_error": is_error,
                })
            self.messages.append({"role": "user", "content": results})


def make_voice():
    import pyttsx3
    import speech_recognition as sr

    recognizer, mic, engine = sr.Recognizer(), sr.Microphone(), pyttsx3.init()

    def listen():
        with mic as source:
            recognizer.adjust_for_ambient_noise(source)
            audio = recognizer.listen(source)
        try:
            return recognizer.recognize_google(audio)
        except sr.UnknownValueError:
            return ""

    def speak(text):
        engine.say(text)
        engine.runAndWait()

    return listen, speak


def main():
    parser = argparse.ArgumentParser(description="Jarvis, powered by Claude")
    parser.add_argument("--voice", action="store_true", help="use microphone and speakers")
    args = parser.parse_args()

    if args.voice:
        listen, speak = make_voice()
    else:
        listen = lambda: input("You: ").strip()
        speak = lambda t: None

    jarvis = Jarvis()
    print("Jarvis online. Say or type 'exit' to quit.")
    while True:
        try:
            text = listen()
        except (EOFError, KeyboardInterrupt):
            break
        if not text:
            continue
        if text.lower() in {"exit", "quit", "goodbye"}:
            break
        reply = jarvis.ask(text)
        print(f"Jarvis: {reply}")
        speak(reply)


if __name__ == "__main__":
    main()
