"""Local web HUD server for Jarvis (python jarvis.py --ui).

Binds to 127.0.0.1 only. Because Jarvis can run commands, every API call needs a
random per-run token that is embedded in the page (a different website can't read
it), and requests with an unexpected Host header are rejected (DNS-rebinding guard).
Speech recognition and speaking happen in your browser (use Chrome or Edge).
"""
import json
import os
import secrets
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

HUD = Path(__file__).parent / "ui" / "hud.html"


class Hub:
    def __init__(self):
        self.cond = threading.Condition()
        self.events, self.n = [], 0
        self.pending = {}  # id -> [Event, answer]
        self.busy = threading.Lock()

    def emit(self, type_, **kw):
        with self.cond:
            self.n += 1
            self.events.append({"n": self.n, "type": type_, **kw})
            self.events = self.events[-200:]
            self.cond.notify_all()

    def since(self, after, wait=20):
        with self.cond:
            if not any(e["n"] > after for e in self.events):
                self.cond.wait(wait)
            return [e for e in self.events if e["n"] > after]

    def confirm(self, question):
        qid, ev = secrets.token_hex(4), threading.Event()
        self.pending[qid] = [ev, False]
        self.emit("ask", id=qid, question=question)
        ev.wait(120)  # no answer in two minutes counts as "no"
        return self.pending.pop(qid)[1]

    def answer(self, qid, ok):
        p = self.pending.get(qid)
        if p:
            p[1] = bool(ok)
            p[0].set()


def _stats():
    try:
        import psutil
        return {"cpu": psutil.cpu_percent(), "mem": psutil.virtual_memory().percent}
    except ImportError:
        try:
            return {"cpu": min(100, os.getloadavg()[0] / (os.cpu_count() or 1) * 100), "mem": None}
        except (OSError, AttributeError):
            return {"cpu": None, "mem": None}


def serve(jarvis_cls, port=8765, auto=False):
    hub, token = Hub(), secrets.token_urlsafe(24)
    jarvis = jarvis_cls(hub.confirm, auto=auto)
    jarvis.on_tool = lambda name, args, res: hub.emit("tool", name=name, args=args, result=res[:200])
    hosts = {f"127.0.0.1:{port}", f"localhost:{port}"}

    def run(text):
        try:
            hub.emit("say", text=jarvis.ask(text))
        except Exception as e:
            hub.emit("error", text=str(e)[:200])
        finally:
            hub.busy.release()

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def _send(self, code, body=b"", ctype="application/json"):
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def _authed(self):
            return self.headers.get("Host") in hosts and self.headers.get("X-Jarvis-Token") == token

        def do_GET(self):
            u = urlparse(self.path)
            if self.headers.get("Host") not in hosts:
                return self._send(403)
            if u.path == "/":
                html = HUD.read_text().replace("__JARVIS_TOKEN__", token)
                return self._send(200, html.encode(), "text/html; charset=utf-8")
            if not self._authed():
                return self._send(403)
            if u.path == "/api/events":
                after = int(parse_qs(u.query).get("after", ["0"])[0])
                return self._send(200, json.dumps({"events": hub.since(after)}).encode())
            if u.path == "/api/stats":
                return self._send(200, json.dumps(_stats()).encode())
            self._send(404)

        def do_POST(self):
            if not self._authed():
                return self._send(403)
            try:
                data = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
            except ValueError:
                return self._send(400)
            if self.path == "/api/ask" and isinstance(data.get("text"), str):
                if not hub.busy.acquire(blocking=False):
                    return self._send(409)
                threading.Thread(target=run, args=(data["text"],), daemon=True).start()
                return self._send(202)
            if self.path == "/api/answer":
                hub.answer(data.get("id"), data.get("ok"))
                return self._send(200, b"{}")
            self._send(404)

    server = ThreadingHTTPServer(("127.0.0.1", port), H)
    url = f"http://localhost:{port}/"
    print(f"Jarvis HUD running at {url}  (Ctrl+C to stop)")
    try:
        webbrowser.open(url)
    except Exception:
        pass
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
