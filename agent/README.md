# Quick Pebble screen agent

Python sidecar that lets Gemini operate the screen. Quick Pebble starts it on demand (Assistant → **Screen** mode).

1. Takes a screenshot and draws a labeled grid on it (columns A–X, rows 1–14).
2. Sends it to Gemini, which must answer in a fixed two-part JSON format (enforced by a response schema, then validated; invalid replies are retried):
   - `user` — `thinking` (how it read the screen) and `message` (status, or the final answer when `action.type` is `done`). Shown to the person only.
   - `action` — `type`, `cell`, `fx`/`fy`, `text`, `key`, … Sent to the backend and executed exactly as given.
3. Quick Pebble shows the step, the person approves it, `pyautogui` performs it, repeat.

## Setup (macOS)

```bash
cd agent
python3 -m pip install -r requirements.txt
python3 -m pytest
```

Grant **Screen Recording** and **Accessibility** to the app that launches it (System Settings → Privacy & Security).
Slam the mouse into a screen corner to abort (pyautogui fail-safe).

## Configuration

| Variable | Meaning |
|---|---|
| `GEMINI_API_KEY` | Set by Quick Pebble from the keychain (Settings → AI → Gemini). |
| `QP_AGENT_MODEL` | Gemini model ID. Defaults to `gemini-3.8-flash`; change it if Google names it differently. |

Privacy: every step sends a screenshot of your whole screen to Google.
