# Changelog

## 2.4.1

- **Permissions survive updates.** The app now has a fixed identity (its bundle identifier) instead of a one-off hash per build, so macOS keeps Screen Recording and Accessibility granted after an update. The first update to this version still needs one fresh grant; after that you shouldn't be asked again.

## 2.4.0

- **Morning brief.** Once a day, the first time you open Quick Pebble (or your Mac wakes or unlocks), a card shows today's weather, headlines for up to three countries you choose, today's calendar (optional) and a quick Mac check-up. Settings → Morning brief, including "open Quick Pebble when I log in".
- **Opening apps uses Spotlight.** When the assistant needs to open an app on a Mac it now presses Cmd+Space, types the name and presses Return, like you would. It only types if Spotlight really opened, and otherwise falls back to the old method.
- **Fewer permission questions.** Each step prompt now has "Allow everything on this website". Routine steps on that site then run without asking; it still asks before anything that pays, deletes or sends. Manage the list in Settings.
- **Education Perfect mode.** On educationperfect.com the assistant is told how the site works: answers must be fully simplified, a green tick means correct, a blue tick means on the right track but not finished. Write your own typing shortcuts in Settings and it follows them.

## 2.3.0

- Version bump only. Same features as 2.2.0.

## 2.2.0

- **Safety foundation for the computer-controlling assistant:** an undo list, dry runs with receipts, per-app permission, Watch mode and protected folders.
- **Mac clean-up and speed:** disk usage, old installers, forgotten apps, tidy-up, rename by content, photo triage, slow-Mac check, quit unused apps, login items.
- **Memory and knowledge:** answer from your files, workspaces that remember, a timeline of your day, and a page check.
- **Learning and school:** study packs, timetable, assignments, slides to notes, submit-checker, practice partner.
- **Routines and shortcuts:** teach by showing, approved replays, reminders, phrases, sharing, and "Do this for me".
- **Compare prices** across local shops for your country. It only reads prices and never buys.
- Names under every colour theme swatch, a rewritten README with fresh screenshots, and a theme gallery.
- **Screen mode permissions:** Quick Pebble now checks Screen Recording and Accessibility itself, opens the right Settings page and says exactly what to do. Fixes the case where the switch looked on but capture still failed after an update.

## Unreleased

### Safety foundation
- **Recent changes with Undo.** Every file Quick Pebble moves, renames or sends to the Trash for you is listed with an Undo button, plus "Undo this whole task". Undo never overwrites something newer. Download sorting and renames are listed too. Clicks the assistant makes inside other apps can't be undone from here, and the list says so.
- **List first, then confirm, then a receipt.** Anything that deletes, moves or renames shows the full list first; nothing happens until you tick and confirm. Deleting always means the Trash. Every confirmed task leaves a receipt.
- **Safe mode for apps.** The first time Screen mode is about to work in an app, it asks you, for that app only: just this task, always, or no. Answers can be revoked in Settings → Assistant safety.
- **Watch mode** (opt-in, off by default): see the exact screenshot Screen mode looked at, what it thinks and what it will do next. The picture is only kept in memory.
- **Protected folders.** Choose folders Quick Pebble must never touch. File tasks refuse them outright; Screen mode is told to keep out and must ask before any step that mentions one.

### Clean up and speed up (Settings → Assistant safety → Open clean-up, or the command palette)
- **Find what's eating your disk:** old downloads, `node_modules` folders, app caches, simulator and Xcode data, and very big files, from names and sizes only. The scan is capped to stay quick and says when it stopped early.
- **Old installers** (.dmg, .pkg, setup files) for apps you already have.
- **Forgotten apps** (macOS): apps not opened in months with their size and the leftovers in your Library; removing one sends the app and its leftovers to the Trash. Apple's apps are never listed, and apps that are open can't be removed.
- **Tidy up Desktop and Downloads** into kind folders, with undo.
- **Rename by content:** `IMG_4021.jpg` → "Beach trip - sunset". You see exactly what is sent to the AI (a small picture of each file, or the start of a text file) before anything is.
- **Photo triage:** spots screenshots and receipts among photos from their names and screen-sized PNGs; optionally the AI looks at up to 40 unclear ones. Only moved after you confirm.
- **Why is my Mac slow?** Names the apps using the most processor and memory and offers to quit them politely.
- **Quit apps you haven't touched** (opt-in: Quick Pebble notices which app is in front once a minute, on this computer only). Apps with unsaved work are left open.
- **Login items:** see what starts when you log in and turn items off; Undo turns them back on.

### Memory and knowledge
- **Answer from my files.** Choose folders of notes, PDFs and documents (txt, md, html, rtf, docx, pdf) in Settings; they're indexed in Quick Pebble's own database on this computer. Tick "Search my files" in the assistant: it lists which excerpts it would send and waits for your OK, then answers with citations to your files. Protected folders are never read.
- **Workspaces that remember.** A saved workspace now also keeps the assistant chat and the project brief, and one click brings them all back with the tabs.
- **A timeline of my day** (opt-in, off by default): pages read, files downloaded, chats and assistant tasks, day by day, in Library → Timeline. Local only, 30 days, never from private windows, with Clear all.
- **Check this page** (This site panel): ads and "sponsored" parts, when it was last updated (flags pages years old), who runs the site according to the page itself, and which tracking companies it tried to load. Each finding says how sure it is. Optionally compare the page's claims with pages you've read (Recall), after seeing exactly what is sent; disagreements are shown as a reason to look closer, never as proof.

### Learning and school (command palette → School)
- **Study packs:** pick a few tabs and get flashcards, a quiz and a one-page summary. Save it and short quizzes pop up later the same day (about 1, 3 and 7 hours later, never at night).
- **Fill in my timetable:** reads your school portal's timetable, shows every class to check, then makes a calendar file. Your Calendar app asks before adding anything.
- **Collect my assignments:** reads Google Classroom's To-do page (or a school site) and lists what's due this week in one note; copy it, add it to Apple Notes, or save it as a file.
- **Slides to notes:** reads a PDF or scrolls through a slides page, then writes study notes with questions to check yourself.
- **Submit-checker:** reads an assignment's file rules and checks the file you plan to hand in (type, name, size). It never submits.
- **Practice partner:** reads the current quiz question aloud with your computer's own voice, or explains why your answer was wrong. It never answers or submits for you.
- Every tool shows exactly what page text will be sent to the AI before it is.

### Routines and shortcuts (command palette → Routines)
- **Teach it by showing:** press "Teach a routine", do the task once (in the browser and other apps), press Stop, and review the steps it saw: the pages you opened, what you clicked and typed, choices you made and apps you switched to. Passwords, card numbers and one-time codes are never recorded; those steps say "you type this yourself".
- **Running a routine always shows every step first.** Steps that send, submit, buy, pay, delete or sign in stop for their own OK, and you can skip or stop at any point.
- **Reminders, not autopilot:** schedule a routine ("Fridays at 16:00") and you get a notification with the steps ready to approve. It never runs by itself.
- **Teach it a shortcut:** give a routine a phrase like "tidy up", then just say it to the assistant.
- **Share routines:** export one as a `.qproutine` file; importing shows every step and needs your OK, and a file with any step outside the allowed kinds is refused with the reason.
- **"Do this for me" from any app** (Ctrl+Shift+Space on Mac, Ctrl+Alt+Space on Windows): copy text anywhere, press the shortcut, say what to do ("reply politely", "turn these notes into a table"). You see what will be sent; the draft is only copied, or pasted where your cursor is after a separate click. It never sends anything.
- The assistant now names fields by their visible label (for example "Search term") rather than a hidden form name, so routines and page tasks find the right field.

### Compare prices (command palette → Compare prices). Never buys.
- "Find the cheapest of this in five shops": checks the search pages of the major shops in your country and puts what they show in one table: price and currency, shop, stock, delivery note if shown, a link, and when it was checked.
- Shops come from a data file per country (UAE: Sharaf DG, Amazon.ae, Noon, Jumbo, Carrefour, Lulu, Virgin Megastore, Emax; plus Saudi Arabia, UK, US, India, Germany, France, Canada, Australia and Singapore). Pick the country in the panel, and add or remove shops.
- Read-only by design: each shop is opened in a hidden window with an empty session (no account, no cookies, no cart), pop-ups, downloads and links to other sites are refused, and nothing is clicked.
- Honest results: a price is only shown if that number is really on the shop's page; otherwise it says it couldn't be read. Shops that ask for a robot check are listed as unreadable. Used, refurbished, accessories and different editions are flagged, and "Cheapest match" only counts new offers that look like the same product.
- You see what will be sent to the AI (each page's text and the product name) before it runs.

### Look and docs
- **Theme names:** every colour swatch in Settings now shows its name (Pebble, Ocean, Forest, Sunset, Lavender, Rose, Graphite, Aurora, Sunrise, Twilight), and the row says the selected theme's full name, for example "Aurora (teal + violet)".
- A new README with download buttons, install steps for non-technical people, every feature with its own screenshot, and every network request listed under Privacy. All screenshots were retaken in the Aurora theme, plus a gallery of all ten themes in light and dark.

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
