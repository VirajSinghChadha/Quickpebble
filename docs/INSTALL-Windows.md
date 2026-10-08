# Installing Quick Pebble on Windows

**Read this once before you run the installer. It takes about a minute.**

Quick Pebble is free and open source, but it is not yet signed with a paid code-signing certificate. Because of that, Windows shows a **SmartScreen** warning the first time you run the installer. This is normal for apps from independent developers, and you decide whether to continue. You only need to do this **once**.

## 1. Download

Download `Quick.Pebble_preview_x64-setup.exe` only from the official page:
<https://github.com/VirajSinghChadha/Quickpebble/releases>

You need Windows 10 or 11 (64-bit).

## 2. Run the installer and allow it through SmartScreen

1. Double-click **Quick.Pebble_preview_x64-setup.exe**.
2. A blue window says **Windows protected your PC** and *Microsoft Defender SmartScreen prevented an unrecognized app from starting*.
3. Click **More info** (the small link under the message).
4. Click **Run anyway**.
5. Follow the installer. It installs just for you (no administrator password needed) and adds a Start menu entry.

If your browser blocks the download ("isn't commonly downloaded"), open the browser's downloads list, click the **⋯** next to the file and choose **Keep**, then **Keep anyway**.

## If Windows says "this app can't run on your PC"

You may have an older 32-bit Windows or an ARM PC. Quick Pebble currently ships for 64-bit Intel/AMD Windows.

## Using Screen mode (optional)

The **Screen** assistant mode is the only part that needs extra setup. It needs Python 3, a few packages, and a free Gemini key (Settings → AI). One time only:

1. Install Python 3 from <https://www.python.org/downloads/>. **Tick "Add python.exe to PATH"** on the first screen of its installer.
2. Open Quick Pebble, choose **Screen** in the assistant, and send any task. If packages are missing, the message shows the exact command to run, which looks like:

```
python -m pip install -r "C:\Users\YOU\AppData\Local\Quick Pebble\agent\requirements.txt"
```

Paste that into **Command Prompt** or **PowerShell** and press Enter. Skip all of this if you won't use Screen mode: everything else works without it.

## Is it safe?

- Quick Pebble is open source (MIT). You can read every line at <https://github.com/VirajSinghChadha/Quickpebble>.
- Only download it from that page. If a file came from anywhere else, don't run it.
- Your passwords are encrypted with a master password only you know, and are never sent anywhere.

## Uninstalling

**Settings → Apps → Installed apps → Quick Pebble → Uninstall.** Your history and bookmarks stay in `%APPDATA%\app.quickpebble.browser` until you delete that folder.
