"""One Gemini call per step. The reply is forced into the schema, then validated; invalid replies are retried."""
import json

import requests
from pydantic import ValidationError

from .grid import Grid
from .prompt import system_prompt, user_prompt
from .schema import GEMINI_SCHEMA, AgentResponse

# "light" Gemini. Change with the QP_AGENT_MODEL environment variable (or the Quick Pebble setting).
DEFAULT_MODEL = "gemini-3.5-flash-lite"
ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


class AgentError(Exception):
    pass


def parse_reply(text: str, grid: Grid) -> AgentResponse:
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("reply contained no JSON object")
    try:
        resp = AgentResponse.model_validate(json.loads(text[start : end + 1]))
    except (json.JSONDecodeError, ValidationError) as e:
        raise ValueError(str(e).splitlines()[0] if isinstance(e, json.JSONDecodeError) else _first_error(e)) from e
    resp.action.check_cell(grid)
    return resp


def _first_error(e: ValidationError) -> str:
    err = e.errors()[0]
    return f"{'.'.join(str(p) for p in err['loc'])}: {err['msg']}"


def propose(api_key: str, model: str, grid: Grid, goal: str, history: list[str], jpeg_b64: str, retries: int = 2) -> AgentResponse:
    error = None
    for _ in range(retries + 1):
        body = {
            "systemInstruction": {"parts": [{"text": system_prompt(grid)}]},
            "contents": [{"role": "user", "parts": [
                {"text": user_prompt(goal, history, error)},
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
            return parse_reply(text, grid)
        except ValueError as e:
            error = str(e)
    raise AgentError(f"Gemini kept returning an invalid response ({error}). Try a larger model.")
