"""Turns a validated Action into real mouse and keyboard events. Needs macOS Accessibility + Screen Recording permission."""

from __future__ import annotations
import base64
import io
import os
import subprocess
import sys
import time

import pyautogui
from PIL import Image

from .grid import Grid, draw_grid
from .schema import Action

pyautogui.FAILSAFE = True   # slam the mouse into a screen corner to abort
pyautogui.PAUSE = 0.02

KEY_NAMES = {"cmd": "command", "ctrl": "ctrl", "alt": "option", "option": "option", "shift": "shift", "enter": "enter",
             "return": "enter", "tab": "tab", "escape": "esc", "esc": "esc", "backspace": "backspace", "delete": "delete",
             "space": "space", "up": "up", "down": "down", "left": "left", "right": "right"}
MAX_EDGE = 1440
# The model points straight at things (about 2x more accurate than reading grid labels, in tests), so the screenshot is sent plain.
# Set QP_AGENT_GRID=1 to draw the labeled grid again.
USE_GRID = os.environ.get("QP_AGENT_GRID") == "1"


def capture(grid: Grid) -> tuple[Image.Image, str]:
    """(screenshot without the grid, base64 JPEG of the screenshot with the grid drawn on it)."""
    try:
        img: Image.Image = pyautogui.screenshot()
    except Exception as e:  # macOS raises when Screen Recording is denied
        raise RuntimeError(f"Could not capture the screen ({type(e).__name__}). Allow your terminal/Quick Pebble under System Settings → Privacy & Security → Screen Recording, then quit and reopen the app.") from e
    scale = MAX_EDGE / max(img.size)
    small = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS) if scale < 1 else img
    # The model sees the reduced, gridded copy; the zoomed second looks are cut from the full-resolution original.
    return img, jpeg_b64(draw_grid(small, grid) if USE_GRID else small)


def jpeg_b64(img: Image.Image, quality: int = 74) -> str:
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


_MAC_MODIFIERS = {"command": "kCGEventFlagMaskCommand", "ctrl": "kCGEventFlagMaskControl", "option": "kCGEventFlagMaskAlternate", "shift": "kCGEventFlagMaskShift"}


def mac_shortcut(keys: list[str]) -> bool:
    """Press a shortcut such as cmd+w by sending the key with the modifier flags attached.
    pyautogui presses the modifier and the key so quickly that macOS often treats the key as plain typing (cmd+w typed a "w").
    Returns False if it can't, so the caller can fall back."""
    try:
        import Quartz
        from pyautogui import _pyautogui_osx as osx
        flags, main = 0, None
        for k in keys:
            if k in _MAC_MODIFIERS:
                flags |= getattr(Quartz, _MAC_MODIFIERS[k])
            else:
                main = k
        code = osx.keyboardMapping.get(main) if main else None
        if code is None or not flags:
            return False
        for down in (True, False):
            ev = Quartz.CGEventCreateKeyboardEvent(None, code, down)
            Quartz.CGEventSetFlags(ev, flags)
            Quartz.CGEventPost(Quartz.kCGHIDEventTap, ev)
            time.sleep(0.04)
        return True
    except Exception:
        return False


def press_keys(keys: list[str]) -> None:
    if sys.platform == "darwin" and len(keys) > 1 and mac_shortcut(keys):
        return
    pyautogui.hotkey(*keys, interval=0.08)


SPOTLIGHT = os.environ.get("QP_AGENT_SPOTLIGHT", "1") != "0"


def _open_with_spotlight(name: str) -> bool:
    """Open an app the way a person does: Cmd+Space, type its name, Return. Only types if Spotlight really came to the front,
    so a changed shortcut can never send the name (and Return) into whatever app is open. False means: use `open -a` instead."""
    try:
        if not mac_shortcut(["command", "space"]):
            return False
        time.sleep(0.5)
        if (_frontmost_mac() or "").lower() != "spotlight":
            return False
        pyautogui.write(name, interval=0.03)
        time.sleep(0.7)   # let the first result settle on the app
        pyautogui.press("return")
        return True
    except Exception:
        return False


def open_app(name: str) -> None:
    """Launch (or bring forward) an application by name. The name was validated by the schema; no shell is involved.
    On a Mac this uses Spotlight (Cmd+Space) like a person would, and falls back to `open -a`."""
    if sys.platform == "darwin" and SPOTLIGHT and _open_with_spotlight(name):
        time.sleep(1.5)   # let the window appear before the next screenshot
        return
    if sys.platform == "darwin":
        result = subprocess.run(["open", "-a", name], capture_output=True, text=True, timeout=15)
        if result.returncode != 0:
            raise RuntimeError(f"Could not open the app \"{name}\". Is it installed?")
    elif sys.platform == "win32":
        result = subprocess.run(["powershell", "-NoProfile", "-Command", "Start-Process", "-FilePath", name], capture_output=True, text=True, timeout=15)
        if result.returncode != 0:
            raise RuntimeError(f"Could not open \"{name}\". Is it installed?")
    else:
        raise RuntimeError("Opening apps is supported on macOS and Windows.")
    time.sleep(1.5)   # let the window appear before the next screenshot


def _frontmost_mac() -> str | None:
    try:
        from AppKit import NSWorkspace  # comes with pyautogui's macOS dependencies
        app = NSWorkspace.sharedWorkspace().frontmostApplication()
        return str(app.localizedName()) if app else None
    except Exception:
        r = subprocess.run(["osascript", "-e", 'tell application "System Events" to get name of first application process whose frontmost is true'],
                           capture_output=True, text=True, timeout=5)
        return r.stdout.strip() or None if r.returncode == 0 else None


def _frontmost_windows() -> str | None:
    import ctypes
    from ctypes import wintypes
    u32, k32 = ctypes.windll.user32, ctypes.windll.kernel32  # type: ignore[attr-defined]
    hwnd = u32.GetForegroundWindow()
    if not hwnd:
        return None
    pid = wintypes.DWORD()
    u32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    handle = k32.OpenProcess(0x1000, False, pid.value)   # PROCESS_QUERY_LIMITED_INFORMATION
    if not handle:
        return None
    try:
        buf, size = ctypes.create_unicode_buffer(1024), wintypes.DWORD(1024)
        if not k32.QueryFullProcessImageNameW(handle, 0, buf, ctypes.byref(size)):
            return None
        return os.path.splitext(os.path.basename(buf.value))[0] or None
    finally:
        k32.CloseHandle(handle)


def clean_app_name(name: str | None) -> str | None:
    """App names go into the person's permission list, so keep them plain and short."""
    if not name:
        return None
    cleaned = "".join(ch for ch in str(name) if ch.isalnum() or ch in " .&+()'_-").strip()[:80]
    return cleaned if cleaned and cleaned[0].isalnum() else None


def frontmost_app() -> str | None:
    """Name of the app in front ("Notes", "Safari"), so the person can allow the assistant app by app. None if unknown."""
    try:
        if sys.platform == "darwin":
            return clean_app_name(_frontmost_mac())
        if sys.platform == "win32":
            return clean_app_name(_frontmost_windows())
    except Exception:
        pass
    return None


def target_pixel(action: Action, grid: Grid, width: int, height: int) -> tuple[int, int]:
    """Where to click, in screen points. Order of trust: the zoomed second look, then the model's own point, then its grid cell."""
    if action.ax is not None and action.ay is not None:
        return min(width - 1, int(action.ax * width)), min(height - 1, int(action.ay * height))
    if action.point:
        return min(width - 1, int(action.point[1] / 1000 * width)), min(height - 1, int(action.point[0] / 1000 * height))
    return grid.to_screen(action.cell, action.fx, action.fy, width, height)


def perform(action: Action, grid: Grid) -> None:
    width, height = pyautogui.size()   # screen points (what the mouse uses), not Retina pixels
    if action.type == "open_app":
        open_app(action.app)
        return
    if action.type in ("click", "double_click", "right_click", "scroll", "drag"):
        x, y = target_pixel(action, grid, width, height)
        pyautogui.moveTo(x, y, duration=0.12)
        time.sleep(0.04)
        if action.type == "click":
            pyautogui.click()
        elif action.type == "double_click":
            pyautogui.doubleClick()
        elif action.type == "right_click":
            pyautogui.rightClick()
        elif action.type == "drag":
            if action.to_point:
                ex, ey = min(width - 1, int(action.to_point[1] / 1000 * width)), min(height - 1, int(action.to_point[0] / 1000 * height))
            else:
                ex, ey = grid.to_screen(action.to_cell, 0.5, 0.5, width, height)
            pyautogui.dragTo(ex, ey, duration=0.6, button="left")
        else:
            pyautogui.scroll(action.amount * (-1 if action.direction == "down" else 1) * 5)
    elif action.type == "type":
        _type_text(action.text)
    elif action.type == "key":
        press_keys([KEY_NAMES.get(p.lower(), p.lower()) for p in action.key.split("+")])
    elif action.type == "wait":
        time.sleep(1.0)
