# Installing Quick Pebble on a Mac

**Read this once before you open the app. It takes about a minute.**

Quick Pebble is free and open source, but it is not yet signed with a paid Apple Developer certificate. Because of that, macOS shows a warning the first time you open it. This is normal for apps from independent developers, and you decide whether to allow it. You only need to do this **once**.

## 1. Install

1. Open the **Quick Pebble** disk image (`.dmg`).
2. Drag **Quick Pebble** onto the **Applications** folder.
3. Eject the disk image (right-click it in Finder → Eject).

## 2. Allow it in Privacy & Security (macOS 15 Sequoia and newer)

1. Open **Applications** and double-click **Quick Pebble**.
2. macOS says it *"could not verify"* the app is free of malware. Click **Done**. (Do **not** click "Move to Bin".)
3. Open the Apple menu  → **System Settings** → **Privacy & Security**.
4. Scroll down to the **Security** section. You will see: *"Quick Pebble" was blocked to protect your Mac.*
5. Click **Open Anyway**.
6. Enter your Mac password or use Touch ID.
7. Click **Open Anyway** once more in the confirmation window.

Quick Pebble now opens, and from then on it opens like any other app.

> The **Open Anyway** button only appears for about an hour after your first attempt. If you don't see it, double-click Quick Pebble again and then go back to Privacy & Security.

## macOS 14 Sonoma and older

1. In **Applications**, hold **Control** and click **Quick Pebble** (or right-click it).
2. Choose **Open**.
3. Click **Open** in the warning window.

## If macOS says the app is "damaged and can't be opened"

This is the same safety check, shown differently. Open **Terminal** (Applications → Utilities) and paste this single line, then press Return:

```bash
xattr -dr com.apple.quarantine "/Applications/Quick Pebble.app"
```

Then open Quick Pebble again.

## Permissions Quick Pebble may ask for later

Only the **Screen** assistant mode needs these, and only when you use it. Both live in **System Settings → Privacy & Security**:

- **Screen & System Audio Recording**: lets the assistant see your screen.
- **Accessibility**: lets the assistant move the mouse and type for you.

Switch **Quick Pebble** on in each list. Say no, or leave them off, if you don't plan to use Screen mode. The browser works fully without them.

## Using Screen mode (optional)

The **Screen** assistant mode is the only part that needs extra setup. It needs Python 3 and a few packages, plus a free Gemini key (Settings → AI). One time only:

1. Install Python 3 from <https://www.python.org/downloads/> if `python3 --version` in Terminal doesn't print a version.
2. Paste this into Terminal and press Return:

```bash
python3 -m pip install -r "/Applications/Quick Pebble.app/Contents/Resources/agent/requirements.txt"
```

Skip this if you won't use Screen mode: everything else works without it.

## Is it safe?

- Quick Pebble is open source (MIT). You can read every line at <https://github.com/VirajSinghChadha/Quickpebble>.
- Only download it from that page. If a file came from anywhere else, don't open it.
- Your passwords are encrypted with a master password only you know, and are never sent anywhere.

## Prefer Homebrew?

```bash
brew tap VirajSinghChadha/quickpebble https://github.com/VirajSinghChadha/Quickpebble
brew install --cask quick-pebble
```

Homebrew clears the warning for you, so you can skip the steps above.
