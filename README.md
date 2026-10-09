<div align="center">

<img src="public/pebble.svg" alt="Quick Pebble logo" width="96" height="96" />

# Quick Pebble

**Browse quicker.**

A lightweight, privacy-first desktop browser with a calm design, tab memory saving,
and an AI assistant that runs on your own machine.

[![CI](https://github.com/VirajSinghChadha/Quickpebble/actions/workflows/ci.yml/badge.svg)](https://github.com/VirajSinghChadha/Quickpebble/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/VirajSinghChadha/Quickpebble)](https://github.com/VirajSinghChadha/Quickpebble/releases/latest)
![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)
![Tauri 2](https://img.shields.io/badge/Tauri-2.x-24C8DB)
![React 19](https://img.shields.io/badge/React-19-61DAFB)

[Install](#install) · [Features](#features) · [Shortcuts](#keyboard-shortcuts) · [Privacy](#privacy-and-security) · [Development](#development) · [Releasing](#releasing)

</div>

---

## Chromium edition (this branch)

This branch replaces the system web view with **real Chromium** (via Electron), so pages render exactly as in Chrome: Google looks and behaves like it does in Chrome, Google accounts sign in normally, and PDFs, WebRTC and modern web APIs work. The React UI, AI assistant, Recall, workspaces and privacy features are carried over; the Rust backend is ported to `electron/`.

```bash
npm install
npm run electron:dev     # app with hot reload
npm start                # build the UI and run
npm run dist             # installers in release/ (dmg, nsis, AppImage/deb)
```

- **Native ad & tracker blocking.** Every network request is checked in the browser process, including ones the HTML parser starts before any page script runs. It combines the built-in tracker list with EasyList / EasyPrivacy / uBlock-style filter lists (via Ghostery's engine), cached on disk and refreshed daily. Strict mode also blocks third-party ad paths.
- **Profiles.** Separate cookies, logins and site data per profile (Command palette → Profiles), so each can hold a different Google account. Private windows use an in-memory session.
- **Proxy.** Settings → Profiles & network can route everything through a SOCKS5/HTTP proxy such as Tor (`socks5://127.0.0.1:9050`) or your own VPN's proxy port. Quick Pebble does **not** include a VPN: a real one needs servers someone pays for.
- **Password manager.** Passwords are encrypted with AES-256-GCM under a key derived from your master password (scrypt, 128 MB), locked after 15 idle minutes, filled only on an exact https host match, and saved only after you agree. Imports CSV exports from Chrome, Firefox, Safari, 1Password, Bitwarden, LastPass and Dashlane.
- **Chrome extensions** run on Chromium's real extension runtime (content scripts, background workers, `chrome.storage`, `chrome.runtime`, scripting…). Install from a Web Store link or a `.crx`; they start switched off. Toolbar popups and `webRequest` are not provided yet, so ad blockers that depend on them add nothing (the built-in blocker already covers that).
- **Not ported yet:** Screen mode (the Python agent) and in-app auto-update (macOS can't auto-update unsigned apps; download new versions from Releases or `brew upgrade`). They show clear messages. The Tauri build still lives in `src-tauri/`.
- **Google sign-in** works as in Chrome, but Google account *sync* (bookmarks, passwords across devices) is private to Google's own Chrome and cannot be offered by any other browser.
- Quick checks: `QP_SMOKE=1 npx electron electron/main.mjs` runs a headless end-to-end test against a local site.

## Install

### macOS — Homebrew (recommended)

```bash
brew tap VirajSinghChadha/quickpebble https://github.com/VirajSinghChadha/Quickpebble
brew install --cask quick-pebble
```

Works on Apple silicon and Intel. The app updates itself afterwards (see [Updates](#updates)), so you don't need `brew upgrade`.

### macOS / Windows — direct download

Download the installer for your system from the [latest release](https://github.com/VirajSinghChadha/Quickpebble/releases/latest):

| System | File |
|---|---|
| macOS, Apple silicon | `Quick.Pebble_<version>_aarch64.dmg` |
| macOS, Intel | `Quick.Pebble_<version>_x64.dmg` |
| Windows 10/11 (64-bit) | `Quick.Pebble_<version>_x64-setup.exe` (or `.msi`) |

> **Builds are not code-signed or notarised yet.** The first time you open Quick Pebble, macOS asks you to confirm it: follow the short [macOS install guide](docs/INSTALL-macOS.md) (System Settings → Privacy & Security → **Open Anyway**). The Homebrew cask clears the warning for you. On Windows, SmartScreen shows "unknown publisher": follow the [Windows install guide](docs/INSTALL-Windows.md) (**More info → Run anyway**). Releases are verified by a separate update signature, described under [Updates](#updates).

### Linux

Not packaged yet. You can [build from source](#development); CI compiles it on Ubuntu.

### Optional: local AI

The assistant works best with [Ollama](https://ollama.com), which keeps everything on your machine:

```bash
brew install ollama     # or download from https://ollama.com/download
ollama serve
ollama pull llama3      # or: ollama pull mistral
```

Quick Pebble finds Ollama automatically. Change the model or provider in **Settings → AI**.

## Features

| | |
|---|---|
| **Pebble UI** | Refined new-tab dashboard, uncluttered toolbar, scrollable tabs and collapsible groups, keyboard focus handling, and reduced-motion support. |
| **AI Assistant** | Side panel (`⌘J`) that answers questions about the page or operates the browser for you. |
| **Recall** | Opt-in, on-device search over the text of pages you've read. Ask the assistant "what was that article about X?" and get cited answers from your own history. |
| **Local AI first** | Summaries, tab grouping and address-bar completions run through Ollama on `localhost`. OpenAI, Anthropic and Gemini are opt-in. |
| **Chrome extensions** | Add from the Chrome Web Store or a `.crx` file. Content-script extensions run natively. |
| **Tab Therapist** | Built-in tab health score, duplicate cleanup, auto-organise and saved tabs. |
| **Tab workspaces** | Name and save sets of tabs in Tab Therapist, preserving groups and pins. Restore alongside current tabs; pages load only when selected. Search workspaces by name or page. |
| **Saved-tab search** | Filter saved pages and open all matches together. Duplicate cleanup protects active and pinned tabs. Saved tabs and workspaces are unavailable in private windows. |
| **Memory Saver** | Suspends idle background tabs; never touches the active tab, pinned tabs, audio, camera/mic, or downloads. |
| **Privacy Center** | Tracker blocking, per-site camera / mic / location / notification rules, private windows, one-click data clearing. |
| **HTTPS-only mode** | Upgrades `http://` to `https://` and warns before opening a site insecurely. |
| **Reader mode** | `⌘⇧R` turns an article into clean text with font size and light/sepia/dark themes. |
| **Productivity** | Command palette (`⌘⇧P`), tab search (`⌘⇧A`), find in page, zoom, bookmarks bar, history search, reopen closed tab. |
| **Small and native** | Tauri 2 + Rust on the OS web engine (WKWebView / WebView2). No bundled Chromium. |
| **Signed auto-updates** | New releases show up inside the app; install is one click. |

### AI Assistant

Open it with `⌘J` or the robot icon. **Ask** is the default. Answers use readable paragraphs, numbered citations, source cards, and a copy button. Choose up to four loaded tabs as evidence. With no selected tabs, the current page is used unless you turn that off. Answers without citations are labelled as general answers.

For sources beyond open tabs, add a **Brave Search API key in Settings → Web research**, then enable **Search the web for sources** in chat. Your question is sent to Brave only when this option is enabled; result excerpts are passed to your chosen AI provider. Search sources are labelled as excerpts, not full articles. The key stays in your OS keychain. Search API usage is subject to your own Brave account plan. The app validates source IDs and uses URLs from retrieved metadata; this prevents invented citation links, but does not guarantee that the model interprets every source correctly.

Type `/` in Ask mode for shortcuts: `/summarize`, `/tldr`, `/explain`, `/critique`, `/compare [topic]` and `/tabs` (both read up to four open pages), and `/recall <question>` (searches pages you've read). Answers offer follow-up questions, and the clipboard button exports the chat as Markdown.

Two modes:

- **Ask** answers questions using the page you're on.
- **Do tasks** runs a loop — read the page → the model picks one action → you approve it → it runs → repeat (max 15 steps). It can click, type, select, scroll, press keys, navigate, open tabs and switch tabs.

It controls **browser tabs only**, not the rest of your computer, and it works from a text snapshot of the page, so it does not see images or canvases.

Safety rails:

- **Ask before acting** (default) needs your approval for every click, keystroke and navigation. **Autopilot** only interrupts for sensitive clicks (buy, pay, delete, send, submit…).
- It never types into password fields.
- Page text is passed to the model as untrusted data and the prompt tells it to ignore instructions found on pages. That reduces prompt-injection risk but can't eliminate it — keep approval on for sites you don't trust.
- It stops on repeated actions, invalid model output, or when you press **Stop**.
- With a cloud provider selected, page content is sent to that provider; the panel footer always shows which one is active.

Small local models follow the action format less reliably than large ones. If the agent keeps failing, choose a bigger model.

### Chrome extensions

System web engines can't host Chrome's extension runtime, so Quick Pebble ships a small compatibility layer:

| Works | Doesn't work |
|---|---|
| Content scripts (JS + CSS), URL match patterns, `run_at` | Background / service workers |
| `chrome.storage.local` / `sync` (per site) | Toolbar popups and options pages |
| `chrome.runtime.getManifest` / `id` | `chrome.tabs`, `webRequest`, `declarativeNetRequest` and other APIs |

- **Install:** puzzle icon → paste a Chrome Web Store link or ID, or choose a `.crx` file. Downloads use Google's public update endpoint.
- **Consent:** extensions install **switched off**. The list shows which sites each can read and change, plus warnings about unsupported parts. You switch them on.
- **Scope:** applies to tabs opened afterwards; never in private windows. Scripts run in the page's own JavaScript world, so a page can observe what an extension adds.
- Most popular extensions (ad blockers, password managers) depend on background workers and **won't function**.

## Keyboard shortcuts

Use `⌘` on macOS and `Ctrl` on Windows/Linux.

| Shortcut | Action | | Shortcut | Action |
|---|---|---|---|---|
| `⌘T` / `⌘W` | New / close tab | | `⌘⇧P` | Quick Actions |
| `⌘⇧T` | Reopen closed tab | | `⌘⇧A` | Search tabs |
| `⌘L` | Focus address bar | | `⌘J` | AI Assistant |
| `⌘R` | Reload | | `⌘F` | Find in page |
| `⌘[` / `⌘]` | Back / forward | | `⌘+` `⌘-` `⌘0` | Zoom in / out / reset |
| `⌘D` | Bookmark page | | `⌘⇧R` | Reader mode |
| `⌘Y` | History & bookmarks | | `⌘⇧B` | Bookmarks bar |
| `⌘⇧N` | Private window | | | |

Right-click a tab to pin, duplicate, mute, or move it into a **School / Work / Personal / Entertainment / Shopping** group (or let the AI choose).

## Updates

Quick Pebble checks GitHub Releases 15 seconds after launch and every 6 hours. When a newer version exists, an **Update** button appears in the toolbar; **Settings → Updates** shows the version and an **Install & restart** button. You can also press **Check now**, or turn automatic checks off. Settings displays release notes and download progress, keeps progress when you close and reopen the panel, and lets you retry a failed update. Installing an update preserves your saved tabs, workspaces and settings; there is no need to download another installer.

Every update is verified against an Ed25519 public key embedded in the app before it is installed, so a tampered download is rejected. Nothing installs without your click.

## Privacy and security

- **Local by default.** The default AI provider is Ollama on `localhost`. Choosing a cloud provider sends page text to it, and the app tells you so. API keys live in the OS keychain, never in the database.
- **Tracker blocking** has two layers. Navigations to known ad/analytics hosts are refused natively. Inside pages, a script injected before page code blocks `fetch`, `XMLHttpRequest`, `sendBeacon` and dynamically added `<script>`/`<img>`/`<iframe>` elements for those hosts and hides common ad containers. System webviews expose no request-interception API, so this is **best-effort**: resources the HTML parser loads before the script runs can still get through. It is not uBlock Origin.
- **HTTPS-only** upgrades `http://` navigations (not localhost, private IPs or `.local`). It first checks the HTTPS site responds; if not, you choose whether to continue over HTTP for that site for the session.
- **Navigation policy.** Only `http`, `https` and `about:blank` load; `javascript:`, `file:`, `data:` and custom schemes are refused.
- **Pages get almost no IPC.** A web page can call only three commands (report its own state, forward a shortcut, return an agent result). The calling tab is identified from the webview label, never from the payload. The UI webview has a separate capability.
- **Site permissions.** "Block" rules override `getUserMedia`, geolocation and `Notification.requestPermission` before page scripts run (best-effort, applied on next load). "Ask"/"Allow" use the web engine's own behaviour.
- **Private windows** use non-persistent webview storage, record no history, save no tab session, and don't load extensions.
- **The SQLite database is not encrypted.** It sits in your OS app-data folder, protected by your user account. Use full-disk encryption if you need encryption at rest.

Found a vulnerability? See [SECURITY.md](SECURITY.md).

## Known limitations

- Only macOS has been exercised by hand; Windows and Linux are built by CI but not hand-tested.
- Releases are unsigned (no Apple Developer ID / Windows certificate), so first launch needs the steps in [Install](#install).
- No cross-platform API reports per-tab memory, so Memory Saver's "MB saved" is an estimate (~100 MB per suspended tab).
- Download tracking isn't wired up, so the "don't suspend during a download" rule exists in the policy but the flag is never set.
- Audio detection looks at `<audio>`/`<video>` elements only (not Web Audio or WebRTC-only pages).
- Reader mode uses a density heuristic (not Mozilla Readability) and can miss unusual layouts.
- The agent can't handle drag-and-drop, canvas apps or CAPTCHAs, and can struggle on heavily dynamic sites.
- Tab groups are coloured labels, not Chrome-style collapsible groups.
- Not in v1: sync, a password manager, a PDF viewer, Chrome-style extension popups.
- Keyboard shortcuts inside pages rely on an injected script and won't fire where script injection is blocked.

## Development

**Requirements:** Node 20+, Rust (stable), and the [Tauri 2 prerequisites](https://tauri.app/start/prerequisites/) for your OS (Xcode Command Line Tools on macOS; WebView2 + MSVC Build Tools on Windows).

```bash
git clone https://github.com/VirajSinghChadha/Quickpebble.git
cd Quickpebble
npm install
npm run tauri:dev        # app with hot reload
```

```bash
npm run typecheck                                    # TypeScript
npm test                                             # Vitest (frontend logic)
cargo test   --manifest-path src-tauri/Cargo.toml    # Rust unit tests
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
npm run tauri:build                                  # production bundle for this OS
```

### Architecture

```text
┌─────────────────────────── window ───────────────────────────┐
│ UI webview (React) ── tab strip · toolbar · panels · overlays│
│ ┌──────────────────────────────────────────┐ ┌─────────────┐ │
│ │ one child webview per live tab           │ │ side panel  │ │
│ └──────────────────────────────────────────┘ └─────────────┘ │
└───────────────────────────────┬───────────────────────────────┘
                                │ Tauri IPC
        ┌───────────────────────┴────────────────────────┐
        │ Rust core: tabs · memory saver · SQLite · AI   │
        └────────────────────────────────────────────────┘
```

```text
quick-pebble/
├── src/                       React 19 + TypeScript + Tailwind v4
│   ├── components/            TabStrip, AddressBar, Toolbar, ChatPanel, TherapistPanel, …
│   ├── hooks/                 useTabs, useOllama, useShortcuts, useTheme
│   ├── store/                 Zustand stores (tabs/UI, assistant chat)
│   ├── lib/                   typed IPC client, agent loop, shortcuts, helpers
│   └── styles/globals.css     Pebble UI design tokens
├── src-tauri/
│   ├── src/browser.rs         tab webviews, windows, IPC commands, HTTPS-only
│   ├── src/daemon.rs          Ollama bridge + OpenAI / Anthropic / Gemini
│   ├── src/memory_saver.rs    suspension policy and exclusion rules
│   ├── src/extensions.rs      CRX unpacking, Web Store download, content-script runtime
│   ├── src/updater.rs         signed update checks
│   ├── src/database.rs        SQLite: history, bookmarks, settings, permissions
│   ├── src/security.rs        URL normalisation, navigation policy, tracker list
│   ├── src/inject.js          page script: state, shortcuts, agent ops, blocker, reader
│   ├── capabilities/          least-privilege IPC permissions
│   └── tauri.conf.json
├── Casks/quick-pebble.rb      Homebrew cask (auto-updated on release)
├── scripts/                   macOS DMG, Windows installer, cask generator
└── .github/workflows/         CI and release pipelines
```

Notes for contributors:

- Design tokens live in `src/styles/globals.css`; changing a `--color-*` value re-themes the app.
- Adding a Rust command means three edits: register it in `lib.rs`, list it in `build.rs`, and grant it in `src-tauri/permissions/ui.toml` (or `capabilities/pages.json` if pages may call it).
- Overlays (menus, palette, dialogs) are drawn by the UI webview, which sits beneath page webviews, so the active page is hidden while one is open.

## Releasing

Releases are tag-driven. One-time setup (repository admin):

1. Generate a signing key: `npx tauri signer generate -w ~/.tauri/quickpebble.key` (keep it and its password out of git).
2. Put the **public** key in `plugins.updater.pubkey` in `src-tauri/tauri.conf.json`.
3. Add repository secrets `TAURI_SIGNING_PRIVATE_KEY` (contents of the private key file) and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
4. Settings → Actions → General → Workflow permissions → **Read and write**.

To ship a version, bump the version files and either run **Actions → Release → Run workflow** on `main` with that version (for example `1.1.0`), or push a matching tag:

```bash
# 1. bump the version in package.json, src-tauri/Cargo.toml and src-tauri/tauri.conf.json
# 2. commit, then tag and push
git tag v1.1.0 && git push origin v1.1.0
```

The **Release** workflow then:

1. validates that the tag matches every app version and a signing key is configured;
2. builds macOS (Apple silicon + Intel) and Windows installers, signs the update bundles, and uploads them with `latest.json` to a draft release;
3. publishes the release only after all platform builds succeed;
4. regenerates `Casks/quick-pebble.rb` with the new version and checksums (so `brew install` gets the new build);
5. running copies of Quick Pebble pick up `latest.json` and show **Update available**.

If the private key is lost, existing installs can't receive updates and users must reinstall.

## Contributing

Issues and pull requests are welcome. Please run the checks under [Development](#development) first.

## License

[MIT](LICENSE)
