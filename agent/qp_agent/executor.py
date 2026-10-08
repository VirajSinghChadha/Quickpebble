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


def capture(grid: Grid) -> tuple[Image.Image, str]:
    """(screenshot without the grid, base64 JPEG of the screenshot with the grid drawn on it)."""
    try:
        img: Image.Image = pyautogui.screenshot()
    except Exception as e:  # macOS raises when Screen Recording is denied
        raise RuntimeError("Could not capture the screen. Allow your terminal/Quick Pebble under System Settings → Privacy & Security → Screen Recording.") from e
    scale = MAX_EDGE / max(img.size)
    small = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS) if scale < 1 else img
    # The model sees the reduced, gridded copy; the zoomed second looks are cut from the full-resolution original.
    return img, jpeg_b64(draw_grid(small, grid))


def jpeg_b64(img: Image.Image, quality: int = 82) -> str:
    buf = io.BytesIO()
    img.convert("RGB").save(buf, "JPEG", quality=quality)
    return base64.b64encode(buf.getvalue()).decode()


def capture_gridded_jpeg_b64(grid: Grid) -> str:
    return capture(grid)[1]


def _set_clipboard_windows(text: str) -> None:
    """Puts Unicode text on the Windows clipboard (no extra packages needed)."""
    import ctypes
    from ctypes import wintypes

    CF_UNICODETEXT, GMEM_MOVEABLE = 13, 0x0002
    k32, u32 = ctypes.windll.kernel32, ctypes.windll.user32  # type: ignore[attr-defined]
    k32.GlobalAlloc.restype, k32.GlobalAlloc.argtypes = wintypes.HGLOBAL, [wintypes.UINT, ctypes.c_size_t]
    k32.GlobalLock.restype, k32.GlobalLock.argtypes = wintypes.LPVOID, [wintypes.HGLOBAL]
    k32.GlobalUnlock.argtypes = [wintypes.HGLOBAL]
    u32.OpenClipboard.argtypes = [wintypes.HWND]
    u32.SetClipboardData.argtypes = [wintypes.UINT, wintypes.HANDLE]
    data = text.encode("utf-16-le") + b"\x00\x00"
    handle = k32.GlobalAlloc(GMEM_MOVEABLE, len(data))
    if not handle:
        raise RuntimeError("Could not prepare the clipboard")
    ptr = k32.GlobalLock(handle)
    ctypes.memmove(ptr, data, len(data))
    k32.GlobalUnlock(handle)
    if not u32.OpenClipboard(None):
        raise RuntimeError("Could not open the clipboard (another program may be using it)")
    try:
        u32.EmptyClipboard()
        if not u32.SetClipboardData(CF_UNICODETEXT, handle):
            raise RuntimeError("Could not copy the text")
    finally:
        u32.CloseClipboard()


def _paste(text: str) -> None:
    """Types text that keystrokes can't carry (accents, other alphabets) by pasting it."""
    if sys.platform == "darwin":
        subprocess.run(["pbcopy"], input=text.encode(), check=True)
        pyautogui.hotkey("command", "v")
    elif sys.platform == "win32":
        _set_clipboard_windows(text)
        pyautogui.hotkey("ctrl", "v")
    else:
        raise RuntimeError("Typing non-English characters is only supported on macOS and Windows")


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
        if action.ax is not None and action.ay is not None:   # exact point found by the zoomed second look
            x, y = min(width - 1, int(action.ax * width)), min(height - 1, int(action.ay * height))
        else:
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
