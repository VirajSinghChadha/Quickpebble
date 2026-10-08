<div align="center">

<img src="public/pebble.svg" alt="Quick Pebble logo" width="96" height="96" />

# Quick Pebble

**Browse quicker.**

A lightweight, privacy-first desktop browser with a calm design, tab memory saving, and AI that runs on your own machine.

[![CI](https://github.com/VirajSinghChadha/Quickpebble/actions/workflows/ci.yml/badge.svg)](https://github.com/VirajSinghChadha/Quickpebble/actions/workflows/ci.yml)
![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)
![Tauri 2](https://img.shields.io/badge/Tauri-2.x-24C8DB)
![React 19](https://img.shields.io/badge/React-19-61DAFB)

</div>

---

## Highlights

| | |
|---|---|
| **Pebble UI** | A compact 92 px chrome, floating "pebble" tabs, 12 px radii, light and dark themes, and 150–180 ms transitions. |
| **Local AI first** | Page summaries, tab auto-grouping and address-bar completions run through [Ollama](https://ollama.com) on `localhost`. Cloud providers (OpenAI, Anthropic, Gemini) are opt-in. |
| **AI Assistant side panel** | Chat about the page, or tell it to do things: it can click, type, scroll, open tabs and navigate. Every action is shown, approval is on by default, and a Stop button is always there. |
| **Chrome extensions** | Add extensions from the Chrome Web Store (link or ID) or a `.crx` file. Content scripts and `chrome.storage` run natively; see [Extensions](#chrome-extensions). |
| **Tab Therapist (built in)** | Tab health score, duplicate cleanup, auto-organise into groups and saved tabs — ported from the Tab Therapist extension and runs natively. |
| **Reader mode** | `⌘⇧R` strips a page to clean, resizable text with light / sepia / dark themes. |
| **Bookmarks bar** | `⌘⇧B` toggles a bookmarks strip under the toolbar. |
| **HTTPS-only mode** | `http://` links are upgraded to `https://`; if a site has no HTTPS you get a warning before continuing. |
| **Signed auto-updates** | Checks GitHub Releases, verifies the signature, and installs only when you click. |
| **Memory Saver** | Idle background tabs are suspended and restored when you return. Never touches the active tab, pinned tabs, audio, camera/mic, or downloads. |
| **Privacy Center** | Tracker blocking, per-site camera / microphone / location / notification rules, private windows, one-click data clearing. |
| **Quick Actions** | `⌘⇧P` command palette and `⌘⇧A` tab search. |
| **Small and native** | Tauri 2 + Rust, using the OS web engine (WKWebView on macOS, WebView2 on Windows). No bundled Chromium. |

## Install

Grab a build from the [Releases](https://github.com/VirajSinghChadha/Quickpebble/releases) page once one is published, or build from source below.

macOS builds are unsigned unless you add your own signing identity, so the first launch needs *right-click → Open*.

## Build from source

**Requirements:** Node 20+, Rust (stable), and the [Tauri 2 prerequisites](https://tauri.app/start/prerequisites/) for your OS (Xcode Command Line Tools on macOS; WebView2 and MSVC Build Tools on Windows).

```bash
git clone https://github.com/VirajSinghChadha/Quickpebble.git
cd Quickpebble
npm install
npm run tauri:dev      # run the app with hot reload
```

```bash
npm run tauri:build    # production bundle for the current OS
./scripts/package_macos.sh          # macOS .dmg
iscc scripts\installer_windows.iss  # Windows installer (after `npx tauri build --no-bundle`)
```

### Optional: local AI

```bash
brew install ollama        # or https://ollama.com/download
ollama serve
ollama pull llama3         # or: ollama pull mistral
```

Quick Pebble detects Ollama automatically. Change the model or provider under **Settings → AI**.

## Keyboard shortcuts

Use `⌘` on macOS and `Ctrl` on Windows/Linux.

| Shortcut | Action |
|---|---|
| `⌘T` / `⌘W` | New tab / close tab |
| `⌘L` | Focus the address bar |
| `⌘R` | Reload |
| `⌘[` / `⌘]` | Back / forward |
| `⌘D` | Bookmark this page |
| `⌘⇧P` | Quick Actions |
| `⌘⇧A` | Search tabs |
| `⌘⇧N` | Private window |
| `⌘J` | AI Assistant side panel |
| `⌘F` | Find in page |
| `⌘+` / `⌘-` / `⌘0` | Zoom in / out / reset |
| `⌘⇧T` | Reopen closed tab |
| `⌘Y` | History & bookmarks |
| `⌘⇧R` | Reader mode |
| `⌘⇧B` | Show / hide bookmarks bar |

Right-click a tab to pin, duplicate, mute, or move it into a **School / Work / Personal** group (or let the AI choose).

## AI Assistant

Open it with `⌘J` or the robot icon. Two modes:

- **Ask** answers questions about the page you're on.
- **Do tasks** runs a loop: read the page → the model picks one action → you approve it (by default) → it runs → repeat, up to 15 steps.

The agent controls **browser tabs only**, not the rest of your computer. It uses a text snapshot of the page (visible text plus a numbered list of buttons, links and fields), so it does not "see" images or canvases.

Safety rails:

- **Ask before acting** (default) needs your approval for each click, keystroke and navigation. **Autopilot** only interrupts for sensitive clicks (buy, pay, delete, send, submit…).
- It never types into password fields; it asks you instead.
- Page text is passed to the model as untrusted data, and the prompt tells it to ignore instructions found on pages. That reduces prompt-injection risk but cannot eliminate it, so keep approval on when visiting sites you don't trust.
- It stops on repeated actions, invalid model output, or when you press Stop.
- With a cloud provider selected, page content is sent to that provider; the panel footer shows which provider is active.

Small local models (e.g. an 8B `llama3`) follow the JSON action format less reliably than larger ones. If the agent keeps failing, pick a bigger model in Settings.

## Chrome extensions

System web engines can't host Chrome's extension runtime, so Quick Pebble ships a small compatibility layer instead:

| Works | Doesn't work |
|---|---|
| Content scripts (JS + CSS), URL match patterns, `run_at` | Background / service workers |
| `chrome.storage.local` / `sync` (per site) | Toolbar popups and options pages |
| `chrome.runtime.getManifest` / `id` | `chrome.tabs`, `webRequest`, `declarativeNetRequest`, other APIs |

- **Install:** *Extensions* (puzzle icon) → paste a Chrome Web Store link or ID, or pick a `.crx` file. Downloads use Google's public update endpoint, the same one other Chromium-based tools use.
- **Consent:** extensions install **switched off**. The list shows which sites each one can read and change, plus warnings about unsupported parts. You turn them on yourself.
- **Scope:** extensions apply to tabs opened after you enable them, and never run in private windows. Content scripts run in the page's own JavaScript world (no isolated world), so a page can see what an extension adds.
- **Tab Therapist** is built in as a native feature (side panel → *Tab Therapist*), because its original popup relies on `chrome.tabs` / `chrome.tabGroups`.

## How it works

```text
┌─────────────────────────── window ───────────────────────────┐
│ UI webview (React)  ── tab strip + toolbar + overlays        │
│ ┌───────────────────────────────────────────────────────────┐│
│ │ Page webview per tab (child webview, 92 px below the top) ││
│ └───────────────────────────────────────────────────────────┘│
└───────────────────────────────┬───────────────────────────────┘
                                │ Tauri IPC
        ┌───────────────────────┴────────────────────────┐
        │ Rust core: tabs · memory saver · SQLite · AI   │
        └────────────────────────────────────────────────┘
```

```text
quick-pebble/
├── src/                      React 19 + TypeScript + Tailwind v4 frontend
│   ├── components/           TabStrip, AddressBar, Toolbar, QuickActions, PrivacyCenter, NewTabPage, …
│   ├── hooks/                useTabs, useOllama, useShortcuts, useTheme
│   ├── store/                Zustand store (tabs, theme, overlays, session restore)
│   ├── lib/                  typed IPC client, shortcut table, URL helpers
│   └── styles/globals.css    Pebble UI design tokens
├── src-tauri/
│   ├── src/browser.rs        tab webviews, windows, IPC commands
│   ├── src/daemon.rs         Ollama bridge + OpenAI / Anthropic / Gemini fallbacks
│   ├── src/memory_saver.rs   suspension policy and exclusion rules
│   ├── src/database.rs       SQLite: history, bookmarks, settings, site permissions
│   ├── src/extensions.rs     CRX unpacking, Web Store download, content-script runtime
│   ├── src/security.rs       URL normalisation, navigation policy, tracker blocklist
│   ├── src/inject.js         script injected into pages (state reporting, shortcuts, permission blocks)
│   ├── capabilities/         least-privilege IPC permissions
│   └── tauri.conf.json
├── scripts/                  macOS DMG script, Inno Setup installer
└── .github/workflows/        CI and release pipelines
```

- **Tabs are native child webviews.** The React UI draws the chrome; each live tab is its own webview placed below it. Tabs showing the new tab page, and suspended tabs, have no webview at all.
- **Memory Saver** runs a 30-second background loop. *Balanced* suspends after 20 idle minutes, *Maximum* after 5; the timeout halves when system memory is above 85 % used. Suspending closes the webview, and activating the tab reloads its URL.
- **Overlays** (menus, palette, dialogs) are drawn by the UI webview, which sits beneath page webviews, so the page is briefly hidden while one is open.

## Privacy and security model

- **Local by default.** The default AI provider is Ollama on `localhost`. Choosing a cloud provider sends page text to that provider, and the app tells you so each time. API keys are stored in the OS keychain, never in the database.
- **Tracker blocking** has two layers. Navigations to known ad and analytics hosts are refused natively. Inside pages, a script injected before page code blocks `fetch`, `XMLHttpRequest`, `sendBeacon` and dynamically added `<script>`/`<img>`/`<iframe>` elements pointing at those hosts, and hides common ad containers. System webviews offer no request-interception API, so this is **best-effort**: resources the HTML parser loads before the script runs (for example a hard-coded `<script src>` in the page source) can still get through. It is not uBlock Origin.
- **HTTPS-only mode** upgrades `http://` navigations (not localhost, private IPs or `.local`). It first checks that the HTTPS site responds; if not, you decide whether to continue over HTTP for that site for the session.
- **Updates** are verified with an Ed25519 signature against the public key embedded in `tauri.conf.json`. Install requires an explicit click.
- **Navigation policy.** Only `http`, `https` and `about:blank` can load. `javascript:`, `file:`, `data:` and custom schemes are refused.
- **Pages get almost no IPC.** Web pages may call exactly two commands (report their own state, forward a shortcut). Which tab is calling comes from the webview label, never from the payload. The UI webview has a separate capability.
- **Site permissions.** "Block" rules are enforced by overriding `getUserMedia`, geolocation and `Notification.requestPermission` before page scripts run. This is best-effort and applies on the next page load. "Ask" and "Allow" fall through to the system web engine's own behaviour.
- **Private windows** use non-persistent webview storage, don't write history, and don't save tab sessions.
- **The SQLite database is not encrypted.** It sits in your OS app-data folder, protected by your user account. If you need encryption at rest, rely on full-disk encryption or swap in SQLCipher.

## Known limitations

These are the honest edges of v1.0:

- Only macOS compilation and unit tests have been run so far. Windows and Linux builds are covered by the CI matrix but haven't been exercised by hand.
- No cross-platform API reports per-tab memory, so the "MB saved" figure is an estimate (about 100 MB per suspended tab).
- Download tracking isn't wired up yet, so the "don't suspend during a download" rule is implemented in the policy but the flag is never set.
- Reader mode uses a simple density heuristic (not Mozilla Readability), so it can miss unusual layouts; the toolbar button reports when it finds nothing.
- Auto-update has not been exercised end to end yet — that needs a first signed release to exist.
- Audio detection looks at `<audio>`/`<video>` elements; audio from Web Audio or WebRTC-only pages isn't detected.
- Web extensions, sync, a password manager and a built-in PDF viewer are not part of v1.0.
- The agent can't use pages that need pointer drags, canvas games or CAPTCHAs, and it can fail on heavily dynamic sites.
- Only content-script extensions work; most popular extensions (ad blockers, password managers) rely on background workers and won't function.
- Built-in Tab Therapist "groups" are labels on tabs (a colour bar), not Chrome-style collapsible groups.
- Keyboard shortcuts are captured inside pages by an injected script, so they won't fire on pages that block script injection.

## Development

```bash
npm run typecheck                                  # TypeScript
npm test                                           # Vitest (frontend logic)
cargo test --manifest-path src-tauri/Cargo.toml    # Rust unit tests
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
```

Design tokens live in `src/styles/globals.css`; changing a `--color-*` value re-themes the whole app. When you add a Rust command, register it in `lib.rs`, list it in `build.rs`, and grant it in `src-tauri/permissions/ui.toml`.

## Releasing (maintainers)

Updates are signed, so a release needs the signing key:

1. Generate a key pair once: `npx tauri signer generate -w ~/.tauri/quickpebble.key` (keep the private key and password out of git).
2. Put the **public** key in `plugins.updater.pubkey` in `src-tauri/tauri.conf.json`.
3. Add repository secrets `TAURI_SIGNING_PRIVATE_KEY` (contents of the private key file) and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
4. Bump the version in `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`, then push a tag like `v1.1.0`. The release workflow builds the installers and publishes `latest.json`, which running apps read.

If you lose the private key, existing installs can't receive updates and users must reinstall.

## Contributing

Issues and pull requests are welcome. Please run the checks above before opening a PR.

## License

[MIT](LICENSE)
