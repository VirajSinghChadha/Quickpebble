"""Turns a validated Action into real mouse and keyboard events. Needs macOS Accessibility + Screen Recording permission."""
import base64
import io
import subprocess
import sys
import time

import pyautogui
from PIL import Image

from .grid import Grid, draw_grid
from .schema import Action

pyautogui.FAILSAFE = True   # slam the mouse into a screen corner to abort
pyautogui.PAUSE = 0.05

KEY_NAMES = {"cmd": "command", "ctrl": "ctrl", "alt": "option", "option": "option", "shift": "shift", "enter": "enter",
             "return": "enter", "tab": "tab", "escape": "esc", "esc": "esc", "backspace": "backspace", "delete": "delete",
             "space": "space", "up": "up", "down": "down", "left": "left", "right": "right"}
MAX_EDGE = 1600


def capture_gridded_jpeg_b64(grid: Grid) -> str:
    try:
        img: Image.Image = pyautogui.screenshot()
    except Exception as e:  # macOS raises when Screen Recording is denied
        raise RuntimeError("Could not capture the screen. Allow your terminal/Quick Pebble under System Settings → Privacy & Security → Screen Recording.") from e
    scale = MAX_EDGE / max(img.size)
    if scale < 1:
        img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    buf = io.BytesIO()
    draw_grid(img, grid).save(buf, "JPEG", quality=80)
    return base64.b64encode(buf.getvalue()).decode()


def _paste(text: str) -> None:
    if sys.platform != "darwin":
        raise RuntimeError("Typing non-ASCII text is only supported on macOS")
    subprocess.run(["pbcopy"], input=text.encode(), check=True)
    pyautogui.hotkey("command", "v")


def _applescript_string(text: str) -> str:
    return '"' + text.replace("\\", "\\\\").replace('"', '\\"') + '"'


def _type_text(text: str) -> None:
    """Types text exactly, including symbols like ^ that pyautogui can mistype on macOS."""
    if sys.platform == "darwin":
        lines = text.split("\n")
        script = ["tell application \"System Events\""]
        for i, line in enumerate(lines):
            if i:
                script.append("key code 36")
            if line:
                script.append(f"keystroke {_applescript_string(line)}")
        script.append("end tell")
        r = subprocess.run(["osascript", "-e", "\n".join(script)], capture_output=True, text=True)
        if r.returncode == 0:
            return
    if text.isascii():
        pyautogui.write(text, interval=0.02)
    else:
        _paste(text)


def screen_signature() -> list[int] | None:
    """Tiny grayscale fingerprint of the screen, used to tell whether a click changed anything."""
    try:
        return list(pyautogui.screenshot().convert("L").resize((96, 60)).getdata())
    except Exception:
        return None


def screen_changed(before: list[int] | None, after: list[int] | None) -> bool | None:
    if not before or not after or len(before) != len(after):
        return None
    return sum(abs(a - b) for a, b in zip(before, after)) / (len(before) * 255) > 0.004


def perform(action: Action, grid: Grid) -> None:
    width, height = pyautogui.size()   # screen points (what the mouse uses), not Retina pixels
    if action.type in ("click", "double_click", "right_click", "scroll"):
        x, y = grid.to_screen(action.cell, action.fx, action.fy, width, height)
        pyautogui.moveTo(x, y, duration=0.25)
        time.sleep(0.1)
        if action.type == "click":
            pyautogui.click()
        elif action.type == "double_click":
            pyautogui.doubleClick()
        elif action.type == "right_click":
            pyautogui.rightClick()
        else:
            pyautogui.scroll(action.amount * (-1 if action.direction == "down" else 1) * 5)
    elif action.type == "type":
        _type_text(action.text)
    elif action.type == "key":
        pyautogui.hotkey(*[KEY_NAMES.get(p.lower(), p.lower()) for p in action.key.split("+")])
    elif action.type == "wait":
        time.sleep(1.0)
