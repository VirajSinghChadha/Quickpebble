"""One Gemini call per step. The reply is forced into the schema, then validated; invalid replies are retried."""
import json

import requests
from pydantic import ValidationError

from .grid import Grid
from .prompt import VERIFY_SYSTEM, system_prompt, user_prompt, verify_prompt
from .schema import GEMINI_SCHEMA, AgentResponse

# "light" Gemini. Change with the QP_AGENT_MODEL environment variable (or the Quick Pebble setting).
DEFAULT_MODEL = "gemini-3.5-flash-lite"
ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


class AgentError(Exception):
    pass


def parse_reply(text: str, grid: Grid, category_ids: set[str] | None = None) -> AgentResponse:
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("reply contained no JSON object")
    try:
        resp = AgentResponse.model_validate(json.loads(text[start : end + 1]))
    except (json.JSONDecodeError, ValidationError) as e:
        raise ValueError(str(e).splitlines()[0] if isinstance(e, json.JSONDecodeError) else _first_error(e)) from e
    resp.action.check_cell(grid)
    if category_ids is not None and resp.action.category != "none" and resp.action.category not in category_ids:
        resp.action.category, resp.action.risk = "none", "high"   # unknown label: let the app ask rather than trust it
    return resp


def _first_error(e: ValidationError) -> str:
    err = e.errors()[0]
    return f"{'.'.join(str(p) for p in err['loc'])}: {err['msg']}"


def propose(api_key: str, model: str, grid: Grid, goal: str, history: list[str], jpeg_b64: str, categories: list[dict] | None = None, page_text: str | None = None, retries: int = 2) -> AgentResponse:
    error = None
    for _ in range(retries + 1):
        body = {
            "systemInstruction": {"parts": [{"text": system_prompt(grid, categories)}]},
            "contents": [{"role": "user", "parts": [
                {"text": user_prompt(goal, history, error, page_text)},
                {"inline_data": {"mime_type": "image/jpeg", "data": jpeg_b64}},
            ]}],
            "generationConfig": {"responseMimeType": "application/json", "responseSchema": GEMINI_SCHEMA, "temperature": 0.2},
        }
        try:
            r = requests.post(ENDPOINT.format(model=model), headers={"x-goog-api-key": api_key}, json=body, timeout=90)
        except requests.RequestException as e:
            raise AgentError(f"Could not reach Gemini: {e}") from e
        if r.status_code == 404:
            raise AgentError(f"Gemini model '{model}' was not found. Set a valid model in Settings or QP_AGENT_MODEL.")
        if not r.ok:
            msg = (r.json().get("error", {}).get("message") if r.headers.get("content-type", "").startswith("application/json") else None) or r.text[:200]
            raise AgentError(f"Gemini error (HTTP {r.status_code}): {msg}")
        try:
            text = r.json()["candidates"][0]["content"]["parts"][0]["text"]
        except (KeyError, IndexError, TypeError, ValueError):
            error = "empty or blocked response"
            continue
        try:
            return parse_reply(text, grid, {c['id'] for c in categories} if categories else None)
        except ValueError as e:
            error = str(e)
    raise AgentError(f"Gemini kept returning an invalid response ({error}). Try a larger model.")


VERIFY_SCHEMA = {"type": "OBJECT", "properties": {"ok": {"type": "BOOLEAN"}, "problems": {"type": "STRING"}}, "required": ["ok", "problems"]}


def verify(api_key: str, model: str, goal: str, history: list[str], pending: str, jpeg_b64: str, page_text: str | None = None) -> dict:
    """Independent second look before a submit-type action. Returns {"ok": bool, "problems": str}."""
    body = {
        "systemInstruction": {"parts": [{"text": VERIFY_SYSTEM}]},
        "contents": [{"role": "user", "parts": [
            {"text": verify_prompt(goal, history, pending, page_text)},
            {"inline_data": {"mime_type": "image/jpeg", "data": jpeg_b64}},
        ]}],
        "generationConfig": {"responseMimeType": "application/json", "responseSchema": VERIFY_SCHEMA, "temperature": 0.1},
    }
    try:
        r = requests.post(ENDPOINT.format(model=model), headers={"x-goog-api-key": api_key}, json=body, timeout=90)
    except requests.RequestException as e:
        raise AgentError(f"Could not reach Gemini: {e}") from e
    if not r.ok:
        raise AgentError(f"Gemini error (HTTP {r.status_code}) during double-check")
    try:
        out = json.loads(r.json()["candidates"][0]["content"]["parts"][0]["text"])
        return {"ok": bool(out["ok"]), "problems": str(out.get("problems", ""))[:600]}
    except (KeyError, IndexError, TypeError, ValueError) as e:
        raise AgentError("The double-check returned an unreadable reply") from e
