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
        if action.text.isascii():
            pyautogui.write(action.text, interval=0.02)
        else:
            _paste(action.text)
    elif action.type == "key":
        pyautogui.hotkey(*[KEY_NAMES.get(p.lower(), p.lower()) for p in action.key.split("+")])
    elif action.type == "wait":
        time.sleep(1.0)
