"""Local sidecar that Quick Pebble talks to over 127.0.0.1. One token, printed once on stdout, guards it.

POST /propose  {"goal": str, "history": [str]}  ->  {"user": {...}, "action": {...}}   (screenshot + Gemini; nothing executed)
POST /act      {"action": {...}}                ->  {"ok": true}                          (executes one validated action)
GET  /health                                    ->  {"ok": true}
"""
import hmac
import json
import os
import secrets
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from pydantic import ValidationError

from . import executor, gemini
from .grid import Grid
from .schema import Action

GRID = Grid()
TOKEN = secrets.token_hex(24)
MAX_BODY = 64 * 1024


class Handler(BaseHTTPRequestHandler):
    server_version = "QPAgent"

    def log_message(self, *args):  # keep stdout clean; the parent reads the ready line from it
        pass

    def _send(self, code: int, payload: dict) -> None:
        data = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _authorised(self) -> bool:
        host_ok = self.headers.get("Host", "").split(":")[0] in ("127.0.0.1", "localhost")  # blocks DNS rebinding
        token_ok = hmac.compare_digest(self.headers.get("X-QP-Token", ""), TOKEN)
        return host_ok and token_ok and "Origin" not in self.headers  # web pages always send Origin; the app does not

    def _body(self) -> dict:
        n = int(self.headers.get("Content-Length", "0"))
        if n > MAX_BODY:
            raise ValueError("request too large")
        return json.loads(self.rfile.read(n) or b"{}")

    def do_GET(self):
        if not self._authorised():
            return self._send(403, {"error": "forbidden"})
        self._send(200, {"ok": True}) if self.path == "/health" else self._send(404, {"error": "not found"})

    def do_POST(self):
        if not self._authorised():
            return self._send(403, {"error": "forbidden"})
        try:
            body = self._body()
            if self.path == "/propose":
                goal, history = str(body.get("goal", "")).strip(), [str(h)[:200] for h in body.get("history", [])][-40:]
                if not goal or len(goal) > 4000:
                    raise ValueError("invalid goal")
                key = os.environ.get("GEMINI_API_KEY", "")
                if not key:
                    raise gemini.AgentError("No Gemini API key saved. Add one in Settings → AI.")
                shot = executor.capture_gridded_jpeg_b64(GRID)
                model = os.environ.get("QP_AGENT_MODEL") or gemini.DEFAULT_MODEL
                resp = gemini.propose(key, model, GRID, goal, history, shot)
                self._send(200, resp.model_dump(exclude_none=True))
            elif self.path == "/act":
                action = Action.model_validate(body.get("action"))
                action.check_cell(GRID)
                executor.perform(action, GRID)
                self._send(200, {"ok": True})
            else:
                self._send(404, {"error": "not found"})
        except ValidationError as e:  # must precede ValueError: pydantic's error subclasses it
            self._send(400, {"error": f"invalid action: {e.errors()[0]['msg']}"})
        except (gemini.AgentError, RuntimeError, ValueError) as e:
            self._send(400, {"error": str(e)})
        except Exception as e:  # pyautogui.FailSafeException etc.
            self._send(500, {"error": f"{type(e).__name__}: {e}"})


def _exit_with_parent() -> None:
    parent = os.getppid()
    while os.getppid() == parent:
        time.sleep(2)
    os._exit(0)


def main() -> None:
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    print(f"QP_AGENT_READY port={server.server_address[1]} token={TOKEN}", flush=True)
    threading.Thread(target=_exit_with_parent, daemon=True).start()
    server.serve_forever()


if __name__ == "__main__":
    main()
