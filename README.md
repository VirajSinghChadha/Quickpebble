<p align="center">
  <img src="public/pebble.svg" width="112" height="112" alt="Quick Pebble logo">
</p>

<h1 align="center">Quick Pebble</h1>

<p align="center"><b>Browse quicker.</b><br>
A private browser with an AI that can use your whole Mac.<br>
Real Chromium, built-in ad and tracker blocking, and an assistant that reads pages, answers from your own files, tidies your Mac and does tasks for you, always asking before anything that can't be taken back.</p>

<p align="center">
  <a href="https://github.com/VirajSinghChadha/Quickpebble/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/VirajSinghChadha/Quickpebble/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/VirajSinghChadha/Quickpebble/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/VirajSinghChadha/Quickpebble?color=0d9488&label=release"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-7c3aed"></a>
  <img alt="Electron (Chromium)" src="https://img.shields.io/badge/Electron-Chromium-0d9488">
  <img alt="React 19" src="https://img.shields.io/badge/React-19-7c3aed">
</p>

<p align="center">
  <a href="#download"><b>⬇️ Download</b></a>
  &nbsp;·&nbsp; <a href="#install-on-mac"><b>🍎 Mac</b></a>
  &nbsp;·&nbsp; <a href="#install-on-windows"><b>🪟 Windows</b></a>
  &nbsp;·&nbsp; <a href="https://virajsinghchadha.github.io/Quickpebble/"><b>🌐 Website</b></a>
  &nbsp;·&nbsp; <a href="#features"><b>✨ Features</b></a>
  &nbsp;·&nbsp; <a href="#privacy"><b>🔒 Privacy</b></a>
</p>

## Download

Pick your computer. The buttons download the current release, **2.4.1**, straight from GitHub.

<table align="center">
  <tr>
    <th align="center" width="50%">🍎&nbsp; Mac</th>
    <th align="center" width="50%">🪟&nbsp; Windows</th>
  </tr>
  <tr>
    <td align="center">
      <a href="https://github.com/VirajSinghChadha/Quickpebble/releases/download/v2.4.1/Quick.Pebble_2.4.1_arm64.dmg"><b>⬇️&nbsp; Apple silicon (M1 and newer)<br>Quick.Pebble_2.4.1_arm64.dmg · 148 MB</b></a><br><br>
      <a href="https://github.com/VirajSinghChadha/Quickpebble/releases/download/v2.4.1/Quick.Pebble_2.4.1_x64.dmg"><b>⬇️&nbsp; Intel Mac<br>Quick.Pebble_2.4.1_x64.dmg · 154 MB</b></a>
    </td>
    <td align="center">
      <a href="https://github.com/VirajSinghChadha/Quickpebble/releases/download/v2.4.1/Quick.Pebble_2.4.1_x64.exe"><b>⬇️&nbsp; Download for Windows<br>Quick.Pebble_2.4.1_x64.exe · 126 MB</b></a>
    </td>
  </tr>
  <tr>
    <td align="center">macOS 11 Big Sur or newer<br>Not sure which Mac? Apple menu → About This Mac: "Chip: Apple…" means Apple silicon.</td>
    <td align="center">Windows 10 or 11, 64-bit</td>
  </tr>
  <tr>
    <td align="center"><a href="#install-on-mac">Mac install steps</a></td>
    <td align="center"><a href="#install-on-windows">Windows install steps</a></td>
  </tr>
</table>

Linux: [`Quick.Pebble_2.4.1_x86_64.AppImage`](https://github.com/VirajSinghChadha/Quickpebble/releases/download/v2.4.1/Quick.Pebble_2.4.1_x86_64.AppImage) (148 MB) or [`Quick.Pebble_2.4.1_amd64.deb`](https://github.com/VirajSinghChadha/Quickpebble/releases/download/v2.4.1/Quick.Pebble_2.4.1_amd64.deb) (114 MB). All files are on the [releases page](https://github.com/VirajSinghChadha/Quickpebble/releases/latest).

> **The apps are not signed with a paid certificate yet.** Your Mac or PC will ask you to confirm the first time you open Quick Pebble. That's expected; the steps below show exactly what to click. Updates are checked by Quick Pebble itself (checksum, app ID, version and signature) before they are installed.

### Install on Mac

#### With Homebrew

One command (it also takes care of the "unidentified developer" step):

```bash
brew tap VirajSinghChadha/quickpebble https://github.com/VirajSinghChadha/Quickpebble
brew install --cask quick-pebble
```

Quick Pebble updates itself after that, so you don't need `brew upgrade`.

#### Manually

1. **Download the right file above** (Apple silicon or Intel). It saves to your **Downloads** folder.
2. **Double-click it** and drag **Quick Pebble** onto **Applications**.
3. **Open it the first time with a right-click:** in Applications, right-click (or Control-click) **Quick Pebble** and choose **Open**, then **Open** again. You only do this once.
   If macOS says it "can't be opened", go to **System Settings → Privacy & Security**, scroll down and click **Open Anyway**.
4. Sign in with your email, and you're browsing.

<details>
<summary><b>Something not working on Mac?</b></summary>

- **"Quick Pebble is damaged and can't be opened."** That's macOS being careful with an unsigned download. Open **Terminal** and run `xattr -dr com.apple.quarantine "/Applications/Quick Pebble.app"`, then open it again.
- **I can't open it at all.** Use the right-click → **Open** step above, or **System Settings → Privacy & Security → Open Anyway**. The full guide with pictures is in [docs/INSTALL-macOS.md](docs/INSTALL-macOS.md).
- **My antivirus moved it.** Restore it from the antivirus's quarantine, or [build it yourself](#build-from-source).
- **Screen mode can't see or click.** Allow Quick Pebble under **System Settings → Privacy & Security → Screen Recording** and **Accessibility**, then restart it. See [Screen mode permissions](#screen-mode-permissions).
- **Updating.** Quick Pebble checks every 15 minutes and offers the update; one click installs it and restarts. Or download the new `.dmg` and replace the app.
- **Uninstall.** Quit it, then drag **Quick Pebble** from Applications to the Trash. Your data is in `~/Library/Application Support/Quick Pebble`; delete that folder too if you want nothing left.

</details>

### Install on Windows

**It takes about a minute.**

1. **Click "Download for Windows" above.** `Quick.Pebble_2.4.1_x64.exe` saves to your **Downloads** folder.
   If Chrome or Edge says the file *isn't commonly downloaded*, click **Keep** (in Edge, open the **…** menu next to the file first).
2. **Double-click the file.**
   If a blue **"Windows protected your PC"** window appears, click **More info**, then **Run anyway**. Windows shows this for every app that doesn't pay for a code-signing certificate; the full source code is in this repository.
3. **Quick Pebble opens by itself** when it's installed. Later, press the **Windows key**, type `Quick Pebble` and press **Enter**.

<details>
<summary><b>Something not working on Windows?</b></summary>

- **I can't find the "Run anyway" button.** Click the small **More info** link first; the button appears under it. The guide with pictures is in [docs/INSTALL-Windows.md](docs/INSTALL-Windows.md).
- **My antivirus removed the file.** Restore it from the antivirus quarantine, or [build it yourself](#build-from-source).
- **Updating.** Quick Pebble checks every 15 minutes and offers the update; or download the new installer and run it over the old one.
- **Uninstall.** **Settings → Apps → Installed apps → Quick Pebble → Uninstall.**
- **Screen mode on Windows** needs Python 3 with "Add python.exe to PATH" ticked when you install it.

</details>

---

<p align="center"><img src="docs/screenshots/assistant-chat.png" width="900" alt="Quick Pebble in the Aurora theme: a Wikipedia article about volcanoes, with the assistant beside it answering a question about the page with numbered sources"></p>

## New in 2.2 (not released yet)

Everything below is on `main` and will ship in the next release. See [CHANGELOG.md](CHANGELOG.md) for details.

- 🛟 **Safety first:** a *Recent changes* list with **Undo** for every file the app moves, renames or trashes; a list to review before anything changes; receipts; **ask-per-app** for Screen mode; **Watch mode**; **protected folders**.
- 🧹 **Clean up your Mac:** what's eating your disk, old installers, forgotten apps, Desktop and Downloads tidy-up, rename by content, screenshots and receipts among your photos, why it's slow, quit unused apps, login items.
- 🧠 **Memory and knowledge:** answer from your own files, workspaces that remember the chat and project brief, a timeline of your day, and **Check this page** (ads, age, owner, trackers).
- 🎒 **School:** study packs with spaced quizzes, timetable to Calendar, assignments due this week, slides to notes, a submit-checker, a practice partner.
- 🔁 **Routines:** teach it by showing, shortcut phrases, reminders, sharing, and **Do this for me** from any app.
- 🛍 **Compare prices** in your country's shops (never buys).
- 🎨 Theme names under every colour swatch.

## Features

Most features have a screenshot [below](#screenshots) (not yet: Import, old installers, forgotten apps and login items, which would have shown this computer's own apps). Tags: *(new)* is in the next release; *(opt-in)* is off until you turn it on.

| | |
| --- | --- |
| 👻 **GhostSearch** | A private meta-search built in (`ghost://search`): asks DuckDuckGo, Wikipedia and Marginalia at once (plus Brave Search or your own SearXNG if you add them), merges the results, strips tracking from every link, stores nothing. Google is the default engine; switch in Settings |
| 🤖 **The assistant** (<kbd>⌘L</kbd>) | Ask about the page you're on, compare up to four tabs, search pages you've read, or let it operate the browser for you. Answers come with numbered sources. Gemini by default (a pictured guide helps you get a free key), or Ollama on your computer, OpenAI or Anthropic |
| 🖱 **Screen mode** and the status bar | The assistant can use your whole Mac: it looks at the screen, moves the mouse and types. A bar at the bottom of the screen shows what it sees and will do next; risky steps ask first |
| ⏸ **Pause and plan preview** | Pause or stop from the bar or with <kbd>⌘⌥P</kbd> and take over. Big tasks show their plan first, and nothing runs until you approve it |
| 🛟 **Recent changes and Undo** *(new)* | Every file the app moves, renames or sends to the Trash is listed with **Undo**, and **Undo this whole task**. Undo never overwrites anything newer |
| 📋 **Review first, then a receipt** *(new)* | Anything that deletes, moves or renames shows the full list first; you untick what to keep and confirm. Deleting always means the Trash |
| 🔐 **Ask per app** *(new)* | The first time Screen mode is about to work in an app, it asks for that app only: this task, always, or no. Revoke any time |
| 👀 **Watch mode** *(new, opt-in)* | See the exact screenshot Screen mode looked at, what it thinks and what it will do next. Kept only in memory |
| 🗂 **Protected folders** *(new)* | Folders the app never touches; Screen mode must ask before any step that mentions one |
| 🧠 **Project memory and clean-up** | A project brief the assistant keeps in mind, chats you can continue, and a guided clean-up that squashes old chats into summaries |
| 📊 **Task manager and crash recovery** | See each tab's real memory use and put heavy tabs to sleep. A crashed tab reloads by itself; after a crash your tabs and scroll positions come back |
| 📥 **Import from Chrome and Safari** | History, bookmarks, open tabs and Chrome extensions. Reads the other browser, never changes it (Safari needs Full Disk Access) |
| 🪟 **Tab and link previews** | Hover a tab for a picture of the page; hover a link to see where it goes (titles are opt-in, because fetching them tells the site) |
| 🔎 **AI tab search and groups** | "Find the tab where I read about volcanoes", and tabs sorted into groups the AI can name |
| ⬇️ **Download sorting** *(opt-in)* | Finished downloads go into Images, PDFs, Documents…, with Undo, and clearer names suggested for files like `download (3).pdf` |
| 🎨 **Wallpapers and ten themes** | Ten colour themes, each named under its swatch, separately for light and dark mode, with matching wallpapers |
| 🗃 **Recall** *(opt-in)* | An on-device index of the pages you read: search it, or let the assistant answer from it with citations. Never in private windows or for logins, payments and webmail |
| 👤 **Profiles and proxy** | Separate logins and cookies per profile, private windows in memory, and a SOCKS5/HTTP proxy such as Tor |
| 🔑 **Password manager** | Encrypted with your master password (AES-256-GCM, scrypt), fills only on an exact site match, imports from Chrome, Firefox, Safari, 1Password, Bitwarden, LastPass and Dashlane |
| 🧩 **Chrome extensions** | Chromium's real extension runtime; install from the Web Store or a `.crx`. Toolbar pop-ups and `webRequest` aren't supported yet |
| 🛡 **Privacy Center** | Ad and tracker blocking on every request (Ghostery's engine with EasyList-style lists), HTTPS-only mode, cookie-banner refusal, per-site permissions |
| 💽 **What's eating your disk** *(new)* | Biggest folders and files, old downloads, `node_modules`, caches and simulator data, from names and sizes only. Review, then Trash |
| 📦 **Old installers** *(new)* | `.dmg`, `.pkg` and setup files for apps you already have |
| 🧳 **Forgotten apps** *(new, Mac)* | Apps not opened in months with their size and leftovers; uninstall them and their leftovers to the Trash. Apple's apps are never listed |
| 🧺 **Desktop and Downloads tidy-up** *(new)* | Loose files sorted into kind folders, with an undo list |
| ✏️ **Rename by content** *(new)* | `IMG_4021.jpg` → "Beach trip - sunset". You see exactly what is sent to the AI first (a small picture, or the start of a text file) |
| 🧾 **Photo triage** *(new)* | Screenshots and receipts spotted among photos and suggested for their own folders; moved only after you confirm |
| 🐢 **Why is my Mac slow?** *(new)* | Names the apps using the most processor and memory, and asks them to quit politely |
| 💤 **Quit unused apps** *(new, opt-in)* | Apps you haven't touched in days; apps with unsaved work are left open |
| 🚀 **Login items** *(new)* | What starts when you log in; turn items off, with Undo |
| 📚 **Answer from my files** *(new)* | Pick folders of notes and PDFs; they're indexed on your computer. The assistant shows which excerpts it would send and waits for your OK |
| 🧷 **Workspaces that remember** *(new)* | One click restores a project's tabs, groups, the assistant chat and the project brief |
| 🕰 **Timeline of my day** *(new, opt-in)* | Pages read, files downloaded, chats and assistant tasks, day by day. Local only, with Clear all |
| 🧐 **Check this page** *(new)* | Ads and "sponsored" parts, when it was last updated, who runs it (by its own account), which trackers it loads, and its claims compared with pages you've read. Each finding says how sure it is |
| 🃏 **Study packs** *(new)* | Flashcards, a quiz and a one-page summary from a few tabs; short quizzes come back later the same day |
| 🗓 **Fill in my timetable** *(new)* | Reads your school portal and makes a calendar file; your Calendar app asks before adding anything |
| 📝 **Assignments, slides, submit-checker, practice partner** *(new)* | What's due this week in one note; lecture slides to study notes; check a file against the assignment's rules (it never submits); hear quiz questions read aloud or get a mistake explained |
| 🔁 **Routines** *(new)* | Teach a task by doing it once; run it with a preview of every step; give it a phrase ("tidy up") or a reminder; share it as a file (imports are checked against a list of allowed steps) |
| 🪄 **Do this for me** *(new)* | Copy text in any app and press <kbd>⌃⇧Space</kbd>: "reply politely", "turn these notes into a table". Drafts are copied or pasted after a click, never sent |
| 🛍 **Compare prices** *(new)* | The major shops in your country (for the UAE: Sharaf DG, Amazon.ae, Noon, Jumbo, Carrefour, Lulu, Virgin Megastore and more) in one table, read-only. Prices are shown only when they're really on the shop's page |

## Screenshots

Taken from the current app with `QP_SMOKE_SHOTS=1` ([`electron/smoke-shots.mjs`](electron/smoke-shots.mjs) and [`scripts/compose-screenshots.py`](scripts/compose-screenshots.py)): a throwaway profile, a sample account, public Wikipedia pages, sample files and pages served from the computer, and answers from Ollama running locally. Theme: **Aurora (teal + violet)**, light mode.

| | |
| --- | --- |
| ![GhostSearch results for how volcanoes form](docs/screenshots/ghostsearch.png) | ![The assistant beside a Wikipedia article, answering why some volcanoes explode, with a numbered source](docs/screenshots/assistant-chat.png) |
| **GhostSearch**: private results from several sources, tracking stripped | **The assistant** (⌘L) answers about the page, with numbered sources |
| ![The status bar at the bottom of the screen: Thinking, step 3 of 40, with Pause and Stop buttons](docs/screenshots/screen-statusbar.png) | ![The assistant showing a four-step plan with Run this plan, Run without a fixed plan and Cancel](docs/screenshots/plan-preview.png) |
| **Screen mode's status bar**: what it sees, what it will do next, Pause and Stop | **Plan preview**: nothing runs until you approve the steps |
| ![The Recent changes panel listing files moved by a tidy-up, each with an Undo button](docs/screenshots/recent-changes.png) | ![A review list of files to move into folders, with checkboxes and a Confirm button](docs/screenshots/review-list.png) |
| **Recent changes** with Undo for every change and for the whole task | **Review first**: untick what to keep, then confirm; a receipt follows |
| ![The assistant asking: May I work in Notes? with this task, always, or don't allow](docs/screenshots/app-permission.png) | ![Watch mode in the assistant showing the screenshot the agent looked at, what it sees and its next step](docs/screenshots/watch-mode.png) |
| **Ask per app**: the first time it works in an app, it asks | **Watch mode**: the exact screenshot it saw, its thinking and its next step |
| ![Settings, Assistant safety: Watch mode switch, the list of apps with Revoke buttons, and a protected folder](docs/screenshots/safety-settings.png) | ![The assistant with the Science fair project selected](docs/screenshots/project-memory.png) |
| **Protected folders**, app answers and Watch mode in Settings | **Project memory**: a project brief the assistant keeps in mind |
| ![The task manager listing tabs with their memory use](docs/screenshots/task-manager.png) | ![A tab showing This tab crashed with a Reload button](docs/screenshots/crash-recovery.png) |
| **Task manager**: real memory use per tab | **Crash recovery**: a crashed tab says so and reloads |
| ![A preview card with a picture of the page, shown when hovering a tab](docs/screenshots/tab-preview.png) | ![The tab search box finding the volcano tabs](docs/screenshots/tab-search.png) |
| **Tab hover preview** | **Tab search** |
| ![The Tabs panel with School and Personal groups and a saved workspace marked with its project brief](docs/screenshots/tab-groups.png) | ![The downloads panel with files sorted into PDFs, Images and Spreadsheets, each with Undo](docs/screenshots/downloads.png) |
| **Tab groups and workspaces that remember** the chat and the project brief | **Download sorting** into folders, with Undo |
| ![Settings, Appearance: two rows of ten colour swatches, each with its name underneath, Aurora selected](docs/screenshots/settings-themes.png) | ![The Library's Memory tab finding pages about lava and magma](docs/screenshots/recall.png) |
| **Ten named themes**, separately for light and dark | **Recall**: search the text of pages you've read |
| ![The profiles panel with School and Personal profiles](docs/screenshots/profiles.png) | ![The passwords panel with two sample logins](docs/screenshots/passwords.png) |
| **Profiles**: separate logins and cookies | **Password manager** |
| ![The extensions panel](docs/screenshots/extensions.png) | ![The Privacy Center with tracker blocking and per-site permissions](docs/screenshots/privacy.png) |
| **Chrome extensions** | **Privacy Center** |
| ![The clean-up panel after a disk scan: old downloads, node_modules folders, caches and big files, each with a Review button](docs/screenshots/cleanup-disk.png) | ![Rename by content listing IMG_4021.jpg and scan0003.pdf, with a note saying a small picture of each is sent](docs/screenshots/rename-by-content.png) |
| **What's eating your disk**: groups to review, biggest folders | **Rename by content**: exactly what will be sent, before it is |
| ![A review list moving a screenshot and a receipt into Screenshots and Receipts folders](docs/screenshots/photo-triage.png) | ![The clean-up tools for a slow Mac, unused apps and login items](docs/screenshots/cleanup-speed.png) |
| **Photo triage**: screenshots and receipts suggested for their own folders | **Why is my Mac slow?**, quit unused apps and login items |
| ![The assistant's plan listing excerpts from science-fair.md to send, with Send these excerpts and answer](docs/screenshots/files-plan.png) | ![The assistant's answer about the science fair date and poster, citing the notes file](docs/screenshots/files-answer.png) |
| **Answer from my files**: the excerpts it would send, for your OK | …then the answer, citing your files |
| ![Settings: Answer from my files with an indexed Notes folder, and the timeline switch](docs/screenshots/files-settings.png) | ![Library, Timeline: pages read today and an assistant task, by time](docs/screenshots/timeline.png) |
| Folders to answer from, and the opt-in timeline, in Settings | **Timeline of my day** |
| ![This site panel checking a page: sponsored parts, last updated in 2019, run by Wellness Wow Media, two tracking companies blocked](docs/screenshots/page-check.png) | ![The School panel with its six tools](docs/screenshots/school.png) |
| **Check this page**: ads, age, owner and trackers, each with how sure it is | **School**: study packs (quiz, flashcards, summary), timetable, assignments, slides, submit-checker, practice partner |
| ![Classes read from a sample school portal in a table, with weeks to repeat](docs/screenshots/timetable.png) | ![The Routines panel with Friday timetable, Tidy up and Check homework](docs/screenshots/routines.png) |
| **Fill in my timetable**: check every class before the calendar file is made | **Routines**: taught by showing, with phrases and reminders |
| ![The red Watching bar at the top of the window with a Stop button](docs/screenshots/teach-by-showing.png) | ![The assistant showing the steps of the Friday timetable routine with Run these 4 steps](docs/screenshots/routine-run.png) |
| **Teach it by showing**: it watches until you press Stop | **Running a routine** always starts with every step |
| ![The Do this for me window with copied meeting notes turned into a table, and Copy draft](docs/screenshots/quick-do.png) | ![A price table for sample shops with the cheapest same-product offer marked, a used offer flagged and a shop that couldn't be read](docs/screenshots/compare-prices.png) |
| **Do this for me** from any app (⌃⇧Space) | **Compare prices**: one table, never buys |
| ![The new tab page in the Aurora theme](docs/screenshots/newtab.png) | |
| **New tab** with the Aurora wallpaper | |

<details>
<summary><b>Every theme, in light and dark</b></summary>

| Light | Dark |
| --- | --- |
| ![The new tab page in Pebble, light mode](docs/screenshots/themes/pebble-light.png) | ![The new tab page in Pebble, dark mode](docs/screenshots/themes/pebble-dark.png) |
| ![The new tab page in Ocean, light mode](docs/screenshots/themes/ocean-light.png) | ![The new tab page in Ocean, dark mode](docs/screenshots/themes/ocean-dark.png) |
| ![The new tab page in Forest, light mode](docs/screenshots/themes/forest-light.png) | ![The new tab page in Forest, dark mode](docs/screenshots/themes/forest-dark.png) |
| ![The new tab page in Sunset, light mode](docs/screenshots/themes/sunset-light.png) | ![The new tab page in Sunset, dark mode](docs/screenshots/themes/sunset-dark.png) |
| ![The new tab page in Lavender, light mode](docs/screenshots/themes/lavender-light.png) | ![The new tab page in Lavender, dark mode](docs/screenshots/themes/lavender-dark.png) |
| ![The new tab page in Rose, light mode](docs/screenshots/themes/rose-light.png) | ![The new tab page in Rose, dark mode](docs/screenshots/themes/rose-dark.png) |
| ![The new tab page in Graphite, light mode](docs/screenshots/themes/graphite-light.png) | ![The new tab page in Graphite, dark mode](docs/screenshots/themes/graphite-dark.png) |
| ![The new tab page in Aurora (teal + violet), light mode](docs/screenshots/themes/aurora-light.png) | ![The new tab page in Aurora (teal + violet), dark mode](docs/screenshots/themes/aurora-dark.png) |
| ![The new tab page in Sunrise (orange + pink), light mode](docs/screenshots/themes/sunrise-light.png) | ![The new tab page in Sunrise (orange + pink), dark mode](docs/screenshots/themes/sunrise-dark.png) |
| ![The new tab page in Twilight (indigo + cyan), light mode](docs/screenshots/themes/twilight-light.png) | ![The new tab page in Twilight (indigo + cyan), dark mode](docs/screenshots/themes/twilight-dark.png) |

</details>

## Getting a Gemini key

The assistant uses Google's Gemini by default. A key is free for personal use:

1. In Quick Pebble, open the assistant (<kbd>⌘L</kbd>). If there's no key yet, it shows a short guide with pictures.
2. Click **Get a free key**: it opens Google AI Studio. Sign in with a Google account and click **Create API key**.
3. Copy the key, paste it into the box in Quick Pebble and click **Save**.

The key is kept in memory on your computer and saved, encrypted, to your Quick Pebble account so it comes back when you sign in. It's never written to disk in plain text. Prefer nothing in the cloud? Choose **Ollama** in **Settings → AI**: everything then runs on your computer.

## Screen mode permissions

Screen mode moves your mouse and keyboard and reads the screen, so macOS asks first:

- **System Settings → Privacy & Security → Screen Recording:** turn on **Quick Pebble**.
- **System Settings → Privacy & Security → Accessibility:** turn on **Quick Pebble**.
- Restart Quick Pebble afterwards.

It needs Python 3.9 or newer (macOS includes it); the first run sets up its own private environment. Every step sends a screenshot of your whole screen to Google Gemini, so Screen mode needs a Gemini key. Move the mouse into a corner of the screen to stop it at once, or use **Pause** / **Stop** on the bar.

## Keyboard shortcuts

| Shortcut | What it does |
| --- | --- |
| <kbd>⌘L</kbd> | Open the assistant (also <kbd>⌘J</kbd>) |
| <kbd>⌘⇧L</kbd> | Go to the address bar |
| <kbd>⌘⇧Space</kbd> | Open the assistant from any app |
| <kbd>⌃⇧Space</kbd> | **Do this for me** with the text you copied, from any app (<kbd>Ctrl+Alt+Space</kbd> on Windows) |
| <kbd>⌘⌥P</kbd> | Pause or resume Screen mode |
| <kbd>⌘⇧P</kbd> | Command palette: every panel, including Clean-up, School, Routines and Compare prices |
| <kbd>⌘⇧A</kbd> | Search your tabs |
| <kbd>⌘T</kbd> / <kbd>⌘W</kbd> / <kbd>⌘⇧T</kbd> | New tab / close tab / reopen closed tab |
| <kbd>⌘⇧N</kbd> | Private window |
| <kbd>⌘Y</kbd> | History, bookmarks, Recall and Timeline |
| <kbd>⌘F</kbd> · <kbd>⌘⇧R</kbd> · <kbd>⌘D</kbd> · <kbd>⌘⇧B</kbd> | Find · reader mode · bookmark · bookmarks bar |
| <kbd>⌘=</kbd> / <kbd>⌘-</kbd> / <kbd>⌘0</kbd> | Zoom in / out / reset |

On Windows and Linux use <kbd>Ctrl</kbd> instead of <kbd>⌘</kbd>.

## Updates

Quick Pebble checks this repository's GitHub Releases shortly after it starts and then every 15 minutes (an anonymous request; turn it off in **Settings → Updates**). It only offers a release that has an installer for your system and processor. **Update** downloads it from GitHub, checks the sha512 checksum from the release's `latest*.yml`, and on a Mac also mounts the DMG and checks the app's ID, version and code signature before swapping it in and restarting. **Later** skips that version. Nothing installs without your click.

## Privacy

Everything stays on your computer unless you ask the AI to see it, and every tool that sends something shows you what first. New data collection is off by default and never happens in private windows.

**Every network request Quick Pebble can make:**

| When | Where it goes | What is sent |
| --- | --- | --- |
| You browse | The sites you visit | What any browser sends. Known trackers and ads are blocked before they load |
| Daily | Ghostery's filter-list CDN | A request for the latest ad and tracker lists |
| Every 15 minutes (can be turned off) | api.github.com | An anonymous request for this project's releases |
| You sign in | Quick Pebble's account server (Supabase) | Your email and the sign-in code; your AI key, encrypted, so it comes back on your other devices |
| You search with GhostSearch | DuckDuckGo, Wikipedia, Marginalia (and Brave Search or your SearXNG if you add them) | Your search words. No cookies, referrer or account |
| You use the assistant or any AI tool | Your chosen AI: Google Gemini, OpenAI or Anthropic, or nothing if you choose Ollama | Your question, plus what that tool lists before you send: the page text, the excerpts from your files or pages you read, a small picture of a file, the text you copied |
| Screen mode, at every step | Google Gemini | A screenshot of your whole screen and the task |
| You turn on weather or news (off by default) | Open-Meteo; the news feed you pick (BBC, The Guardian, NPR, Al Jazeera, Hacker News) | Your chosen place's coordinates; nothing for news |
| You turn on link titles (off by default) | The link you hover | A normal request for the page's title, with no cookies |
| You turn on web research | Brave Search | Your question |
| You install an extension | Google's Chrome Web Store | The extension's ID |
| You compare prices | The shops you pick | A search for your product, from an empty session with no cookies or account |

**What never leaves your computer:** your history, bookmarks, passwords (encrypted with your master password), Recall's page index, your file index, the timeline, the undo list and receipts, your routines and study packs, and the list of apps you use.

## Build from source

You need Node.js 22 or newer and Python 3.9+ (for Screen mode).

```bash
git clone https://github.com/VirajSinghChadha/Quickpebble.git
cd Quickpebble
npm install
npm run electron:dev     # the app with hot reload
npm test                 # unit tests (vitest)
```

More checks:

```bash
npx tsc --noEmit -p .                                        # types
cd agent && python -m pytest                                 # Screen mode agent
npx vite --port 1420 &                                       # then, in another terminal, the real-app checks:
QP_DEV_URL=http://localhost:1420/ QP_SMOKE_FEATURES=1 npx electron .
QP_DEV_URL=http://localhost:1420/ QP_SMOKE_BROWSER=1 npx electron .
QP_DEV_URL=http://localhost:1420/ QP_SMOKE_SHOTS=1 npx electron . && python3 scripts/compose-screenshots.py
```

`npm run dist` builds installers into `release/` (DMG, NSIS, AppImage and deb).

## Project layout

| Folder | What's in it |
| --- | --- |
| `electron/` | The main process: tabs and pages (`browser.mjs`), every command the interface can call (`commands.mjs`), blocking, passwords, updates, and the newer tools: `safety.mjs`, `actionlog.mjs`, `receipts.mjs`, `fsguard.mjs` (undo and review), `cleanup.mjs`, `fileindex.mjs`, `timeline.mjs`, `school.mjs`, `routines.mjs`, `quickdo.mjs`, `prices.mjs` |
| `electron/data/` | Shops per country for price comparison (`retailers.json`) |
| `agent/` | The Python helper for Screen mode (screenshots, the model call, mouse and keyboard) |
| `src/` | The interface: React 19, TypeScript, Zustand and Tailwind 4 |
| `site/` | The website |
| `docs/` | Install guides and screenshots |

The old Tauri version lives on the `tauri-1.x` branch.

## Releasing

1. Update `version` in `package.json` and add the release notes to `CHANGELOG.md`.
2. Merge to `main` with green CI, then tag: `git tag v2.2.0 && git push origin v2.2.0`.
3. The release workflow builds the Mac (Apple silicon and Intel), Windows and Linux installers and attaches them, with their `latest*.yml` checksums, to a draft release. Publish it when the files are there; the apps then offer the update.

## License

[MIT](LICENSE) © Viraj Singh Chadha and Kriyansh Aggarwal.
