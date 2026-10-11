# Changelog

## Unreleased

### Safety foundation
- **Recent changes with Undo.** Every file Quick Pebble moves, renames or sends to the Trash for you is listed with an Undo button, plus "Undo this whole task". Undo never overwrites something newer. Download sorting and renames are listed too. Clicks the assistant makes inside other apps can't be undone from here, and the list says so.
- **List first, then confirm, then a receipt.** Anything that deletes, moves or renames shows the full list first; nothing happens until you tick and confirm. Deleting always means the Trash. Every confirmed task leaves a receipt.
- **Safe mode for apps.** The first time Screen mode is about to work in an app, it asks you, for that app only: just this task, always, or no. Answers can be revoked in Settings → Assistant safety.
- **Watch mode** (opt-in, off by default): see the exact screenshot Screen mode looked at, what it thinks and what it will do next. The picture is only kept in memory.
- **Protected folders.** Choose folders Quick Pebble must never touch. File tasks refuse them outright; Screen mode is told to keep out and must ask before any step that mentions one.

## 2.1.0

- **Pause and take over.** Pause or stop Screen mode from the status bar at the bottom of your screen or with Cmd/Ctrl+Alt+P, and carry on by hand.
- **Preview the plan** before a computer task starts, and a daily **AI usage meter**.
- **Project memory.** A project brief on the home page, squash old chats into short summaries instead of deleting them, and a guided clean-up that lists what will be changed and asks you to confirm.
- **First-run tour** and a **Report a problem** button that attaches a log only if you tick it.
- **Task manager**, sleeping tabs, and **crash recovery** that restores your tabs and scroll positions.
- **Import from Chrome and Safari:** history, bookmarks, open tabs and Chrome extensions (Safari needs Full Disk Access).
- **Tab hover previews** and **link hover previews** (titles are an opt-in setting).
- **AI tab search** ("find the tab where I read about volcanoes") and sorting tabs into groups the AI can name.
- Optional **download sorting** into folders with undo, and suggested names for unclear files.
- **Wallpapers** that match the ten colour themes.
- Defaults: Google search in English, and Gemini as the AI with a pictured guide for getting a key. **Cmd+L now opens the assistant**; the address bar is Cmd+Shift+L.

## 2.0.0

- **Chromium engine.** The app now runs on Chromium (Electron) instead of the system web view. Pages, including Google, render as in Chrome.
- **Native ad and tracker blocking** on every request with EasyList/EasyPrivacy-style filter lists, plus the built-in tracker list.
- **Profiles** with separate logins and cookies (for example one Google account each), and a **proxy** setting.
- **GhostSearch**: a private, Google-free meta-search engine built into the browser and set as the default. Combines independent sources, strips tracking from links, stores nothing. Change it in Settings → Search engine.
- **Password manager** and **Chrome extensions** (real Chromium extension runtime) are back, ported to the new engine.
- Releases now build installers for macOS (Apple silicon and Intel), Windows and Linux.
- **Screen mode** is back (Python agent; now also works on the Python 3.9 that macOS ships).
- **In-app updates** for unsigned builds (checksum, bundle id, version and signature checks; one click; relaunches).
- A website in `site/` (GitHub Pages or Vercel) and screenshots in the README.

- **Recall (opt-in):** an on-device full-text index of pages you read. Search it from Library → Memory, or tick "Search pages I've read" in the assistant to answer from it with citations. Off by default; never saved in private windows or for login, payment and webmail pages; cleared along with history; forget single pages any time.
- **Slash commands** in Ask mode: `/summarize`, `/tldr`, `/explain`, `/critique`, `/compare`, `/tabs`, `/recall`. `/compare` and `/tabs` read up to four open pages at once.
- Answers now suggest follow-up questions, and the whole conversation can be copied as Markdown with its sources.

## 1.3.0

- **Accounts.** Sign in with an emailed code (beta access code required at sign-up). Your Gemini key is saved encrypted to your account and comes back when you sign in, on any device, and you stay signed in across updates.
- The macOS keychain is no longer used for API keys, so the "wants to use your confidential information" prompt after updates is gone. Keys saved there before need to be entered once more.
- Screen mode sets up its own Python environment on first use.
- Update checks run every 10 minutes and show a card at the top right; if the built-in updater can't connect, a backup check still finds the update.

## 1.2.3

- Update checks run every 10 minutes and show a card at the top right of the window.
- If the built-in updater cannot connect, a backup check still finds the new version and offers a download link; failures now show the real cause.

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
