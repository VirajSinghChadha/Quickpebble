# Changelog

## 1.2.2

- Screen mode's first-time setup now uses its own Python environment with an up-to-date pip, so it finishes in seconds instead of compiling packages for minutes.

## 1.2.1

- Screen mode now installs its own Python packages the first time it runs, so there is no pip step (Python 3 itself is still required).
- Saving a Gemini key now verifies it was stored, and a failed keychain read is no longer remembered as "no key".
- A popup offers new versions as soon as they are found; "Update now" installs and restarts. Updates are checked every hour.

## 1.2.0

**First time opening it on a Mac or Windows PC?** The app isn't signed with a paid certificate yet, so your system asks you to confirm it once. Short guides: [macOS](https://github.com/VirajSinghChadha/Quickpebble/blob/main/docs/INSTALL-macOS.md) (System Settings → Privacy & Security → *Open Anyway*) and [Windows](https://github.com/VirajSinghChadha/Quickpebble/blob/main/docs/INSTALL-Windows.md) (*More info → Run anyway*). If you already have 1.1.0, this arrives through Settings → Updates.

**Screen assistant**
- New **Screen** mode: Gemini looks at a gridded screenshot and operates the mouse and keyboard, with a zoomed second and third look so clicks land on the exact spot. It needs Python 3 (see the install guides) and a Gemini key.
- Each action is labeled with a sensitive-action category; routine steps run automatically, risky ones ask first with numbered choices.
- Permissions are written per website by Gemini and can be saved for the session or for good.
- A separate double-check runs before anything is submitted, and the agent keeps retrying instead of stopping on a missed click.
- Offers a stronger model when you ask for something detailed.

**Passwords and privacy**
- Password manager with a master-password-encrypted vault, autofill only on exact site matches, save prompts, a generator and CSV import from Chrome, Firefox, Safari, 1Password, Bitwarden, LastPass and Dashlane.
- Stronger ad and tracker blocker (Off, Standard, Strict) and automatic cookie-banner refusal.

**Browsing**
- Download manager (files that can run code can only be shown in their folder, never opened).
- Translate this page, per-site profiles (zoom, tracker blocking, mute), bookmark folders with Chrome and HTML import, and collapsible tab groups.
- Reorganised toolbar with a single side panel for Assistant, Bookmarks, Downloads, Passwords, This site and Tabs.
- Separate color themes for light and dark mode, including two-color presets; Google is the default search engine, plus Startpage and Ecosia.
- Home page: optional weather and news (off until you choose them, with a first-run explainer), a wrench icon to customize, and a layout that fits without scrolling.
- Google, YouTube and Apple always see the real browser, which avoids "are you a robot" checks.

**Under the hood**
- API keys are read from the keychain at most once per launch.
- Windows: the screen agent uses `python`, no console window flashes, and non-English text can be typed.

## 1.1.0

- Save named tab workspaces, search them, and restore groups and pinned tabs alongside current tabs.
- Search saved tabs and open matching pages together; restored pages load when selected.
- Duplicate cleanup protects active and pinned tabs.
- Saved tabs and workspaces stay unavailable in private windows.
- Update inside Settings with release notes, download progress, automatic checks, and retry after failed downloads.
- Keep update progress when Settings closes; prevent concurrent checks or installs from interfering.
- Publish signed updates only after all platform builds succeed.
