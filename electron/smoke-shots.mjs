// QP_SMOKE_SHOTS=1 (with QP_DEV_URL, so the dev-only store hook exists): drives the real app through every feature with
// sample data only (a throwaway profile, a sample account, pages served from this computer, sample files in a temp folder,
// answers from the local Ollama model) and saves the pieces of each screenshot to /tmp/qp-shots. Layers are captured
// separately (interface, page, hover card, small windows) and scripts/compose-screenshots.py joins them.
// Theme: QP_SHOTS_THEME (default "aurora"), light mode; then a gallery of every theme in light and dark.
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { app, clipboard, nativeTheme } from "electron";
import { PRESETS_FOR_SHOTS } from "./shots-data.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = process.env.QP_SHOTS_DIR || "/tmp/qp-shots";
const THEME = process.env.QP_SHOTS_THEME || "aurora";
const ONLY = process.env.QP_SHOTS_ONLY ? new Set(process.env.QP_SHOTS_ONLY.split(",")) : null;
const want = (...names) => !ONLY || names.some((n) => ONLY.has(n));

export async function run({ browser, commands, db, safety, files, statusBar, quickdo, downloads }) {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const demo = "/tmp/qp-demo";   // short, so paths in the screenshots stay readable
  fs.rmSync(demo, { recursive: true, force: true });
  fs.mkdirSync(demo, { recursive: true });
  const site = await sampleSite();
  const win = browser.windows.get("main");
  win.win.setContentSize(1280, 800);
  const ui = win.ui.webContents;
  ui.setBackgroundThrottling(false);
  const js = (code) => ui.executeJavaScript(code);
  const until = async (code, ms = 10000) => { for (let t = 0; t < ms; t += 250) { if (await js(code).catch(() => false)) return true; await sleep(250); } return false; };
  const dev = (code) => js(`(async () => { const D = window.__qpDev; ${code} })()`);
  const meta = {};
  const failures = [];
  const grab = async (wc, file) => { try { wc.debugger.attach("1.3"); } catch { /* attached */ } const { data } = await wc.debugger.sendCommand("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(`${OUT}/${file}`, Buffer.from(data, "base64")); };
  const activeView = () => win.tabs.get(win.active)?.view?.webContents;
  /** One screenshot: the interface, plus the page (and any overlay layers) where they show. */
  const shot = async (name, { page = false, layers = [], caption = "" } = {}) => {
    if (ONLY && !ONLY.has(name)) return;
    await sleep(900);
    await grab(ui, `${name}-ui.png`);
    const view = page ? activeView() : null;
    if (view) { view.setBackgroundThrottling(false); await grab(view, `${name}-page.png`); }
    const extra = [];
    for (const [i, l] of layers.entries()) { await grab(l.wc, `${name}-layer${i}.png`); extra.push({ file: `${name}-layer${i}.png`, x: l.x, y: l.y }); }
    meta[name] = { kind: "window", page: !!view, pageRect: view ? browser.contentRect(win) : null, layers: extra, caption };
    fs.writeFileSync(`${OUT}/meta.json`, JSON.stringify(meta, null, 1));
    console.log("SHOT", name);
  };
  const standalone = async (name, wc, caption = "") => {
    if (ONLY && !ONLY.has(name)) return;
    await sleep(700);
    try { fs.writeFileSync(`${OUT}/${name}-ui.png`, (await wc.capturePage()).toPNG()); } catch { await grab(wc, `${name}-ui.png`); }
    meta[name] = { kind: "standalone", caption };
    fs.writeFileSync(`${OUT}/meta.json`, JSON.stringify(meta, null, 1));
    console.log("SHOT", name);
  };
  const need = async (what, code, ms) => { const ok = await until(code, ms); if (!ok) { failures.push(what); console.log("MISSING", what); } return ok; };
  const closeAll = async () => { for (let i = 0; i < 6 && (await js(`!!document.querySelector('button[aria-label="Close"]')`)); i++) { await js(`document.querySelector('button[aria-label="Close"]')?.click()`); await sleep(350); } await dev(`D.useStore.getState().setOverlay(null)`); await sleep(300); };
  const sidebar = async (which) => { await dev(`D.useStore.getState().setSidebar(${JSON.stringify(which)})`); commands.sidebar_set(win, { width: which ? 380 : 0 }); await sleep(700); };
  const go = async (url, wait = 2500) => { await commands.tab_navigate(win, { id: win.active, input: String(url), allowHttp: true }); await sleep(wait); };
  const WIKI = { volcano: "https://en.wikipedia.org/wiki/Volcano", tectonics: "https://en.wikipedia.org/wiki/Plate_tectonics", lava: "https://en.wikipedia.org/wiki/Lava", bread: "https://en.wikipedia.org/wiki/Banana_bread" };
  const send = async (text) => dev(`void D.useChat.getState().send(${JSON.stringify(text)})`);
  /** The assistant has finished: not busy, and its reply (or an error) is in the chat. */
  const answered = (ms = 240000) => need("assistant reply", `(() => { const c = window.__qpDev && window.__qpDev.useChat.getState(); return !!c && !c.busy && !c.approval && c.items.some((i) => i.kind === "assistant" || i.kind === "error"); })()`, ms);

  // ---------------------------------------------------------------- set-up: sample account, sample data, theme, no tours
  await until(`!!window.__qpDev`, 20000);
  for (const [k, v] of Object.entries({ home_onboarded: "home-v1", tour_seen: "v1", recall_enabled: "true", timeline_enabled: "1", ai_provider: "ollama", ai_model: "llama3", screen_plan: "always" })) db.setSetting(k, v);
  await js(`localStorage.setItem("qp.presetLight", ${JSON.stringify(THEME)}); localStorage.setItem("qp.presetDark", ${JSON.stringify(THEME)}); localStorage.setItem("qp.wallpaper", "1")`);
  for (const [url, title] of [["https://en.wikipedia.org/", "Wikipedia"], ["https://www.khanacademy.org/", "Khan Academy"], ["https://developer.mozilla.org/", "MDN Web Docs"], ["https://news.ycombinator.com/", "Hacker News"]]) commands.bookmark_toggle(win, { url, title });
  ui.reload();
  await until(`!!window.__qpDev && !!document.querySelector('input[placeholder*="Search or enter"]')`, 30000);
  // A sample account, kept signed in even if the app's own sign-in check finishes later and says otherwise.
  await dev(`const demo = { status: "ready", profile: { name: "Alex Demo", email: "alex@example.com" } }; D.useAccount.setState(demo); D.useAccount.subscribe((st) => { if (st.status !== "ready") D.useAccount.setState(demo); })`);
  await until(`!document.body.innerText.includes("Email me a sign-in code")`, 10000);
  try { ui.debugger.attach("1.3"); } catch { /* attached */ }
  await ui.debugger.sendCommand("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  nativeTheme.themeSource = "light";
  await sleep(1200);
  const notes = makeSampleFiles(demo);
  let pid = null;

  if (want("newtab", "ghostsearch", "assistant-chat", "plan-preview", "app-permission", "watch-mode", "screen-statusbar", "project-memory", "routine-run")) {
  // ---------------------------------------------------------------- browsing basics
  await closeAll();
  await shot("newtab");
  await go(WIKI.lava, 5000);
  await go(WIKI.tectonics, 5000);
  await go(WIKI.volcano, 5000);
  await go("ghost://search?q=how+do+volcanoes+form", 9000);
  await shot("ghostsearch", { page: true });
  await go(WIKI.volcano, 4000);

  // the assistant answering about the page (local AI)
  await sidebar("assistant");
  await dev(`D.useChat.getState().setMode("ask")`);
  await send("What makes some volcanoes explode while others ooze lava?");
  await answered();
  await sleep(1500);
  await shot("assistant-chat", { page: true });

  // Screen mode: the plan to approve, the per-app question and Watch mode (sample states in the real components)
  await dev(`D.useChat.setState({ mode: "screen", busy: true, approval: { title: "Here's my plan", description: "1. Open the Notes app\\n2. Create a new note\\n3. Type the title “Shopping list”\\n4. Add milk, eggs and bread as a list", risky: false, options: [{ choice: "allow", label: "Run this plan" }, { choice: "skip", label: "Run it without a fixed plan" }, { choice: "stop", label: "Cancel" }], resolve: () => D.useChat.setState({ approval: null }) } })`);
  await shot("plan-preview", { page: true });
  await dev(`D.useChat.setState({ approval: null, appRequest: { app: "Notes", resolve: () => D.useChat.setState({ appRequest: null }) } })`);
  await shot("app-permission", { page: true });
  const shotImg = (await activeView().capturePage()).resize({ width: 900 }).toJPEG(70).toString("base64");
  await dev(`D.useChat.setState({ appRequest: null, watch: { step: 3, shot: ${JSON.stringify(shotImg)}, app: "Quick Pebble", thinking: "The article about volcanoes is open. The heading “Why some volcanoes explode” is just below the fold.", next: "Scroll down: to read the section about explosive eruptions" }, watchPlan: ["Open the article", "Find the section on explosive eruptions", "Summarise it in three points"] })`);
  await shot("watch-mode", { page: true });
  await dev(`D.useChat.setState({ busy: false, watch: null, watchPlan: null, mode: "ask" })`);
  statusBar.update({ phase: "thinking", thinking: "I can see the Notes app with a new, empty note.", next: "Type “Shopping list” as the title", step: 3, max: 40 });
  await sleep(1200);
  if (statusBar.win) await standalone("screen-statusbar", statusBar.win.webContents);
  statusBar.update({ phase: "idle" });

  // project memory: a project brief the assistant keeps in mind
  pid = commands.ctx_project_save(win, { project: { name: "Science fair", notes: "Volcano model for the school science fair on 14 November. Poster in Documents/Science fair. Ms. Rivera wants sources on the poster." } });
  await dev(`await D.useChat.getState().refreshContext(); await D.useChat.getState().setProject(${pid})`);
  await sleep(800);
  await shot("project-memory", { page: true });

  // routine run card (preview of a taught routine)
  const rid = commands.routine_save(win, { routine: { name: "Friday timetable", steps: [{ type: "open_url", url: `${site}/school/timetable` }, { type: "click", label: "Download PDF" }, { type: "open_app", app: "Calendar" }, { type: "do", text: "Add this week's classes to Calendar" }], trigger: "timetable time", schedule: { days: [5], time: "16:00" } } });
  commands.routine_save(win, { routine: { name: "Tidy up", steps: [{ type: "open_panel", panel: "cleanup" }], trigger: "tidy up" } });
  commands.routine_save(win, { routine: { name: "Check homework", steps: [{ type: "open_url", url: "https://classroom.google.com/a/not-turned-in" }, { type: "do", text: "List what is due this week" }], trigger: "homework" } });
  await dev(`const r = (await D.ipc.routinesList()).find((x) => x.id === ${rid}); D.useRoutines.getState().ask(r)`);
  await need("routine card", `!!document.querySelector('[aria-label="Routine steps"]')`);
  await shot("routine-run", { page: true });
  await dev(`D.useRoutines.getState().close()`);

  }

  if (want("files-plan", "files-answer")) {
  // ---------------------------------------------------------------- answer from my files (local AI)
  files.addFolder(notes);
  await files.indexFolder(notes);
  await dev(`D.useChat.setState({ busy: false }); D.useChat.getState().newChat(); D.useChat.getState().setMyFiles(true); D.useChat.getState().setIncludeCurrentPage(false)`);
  await send("When is the science fair and what does the poster need?");
  await need("files plan", `/Here's my plan for your files/.test(document.querySelector('aside')?.innerText ?? '')`, 30000);
  await shot("files-plan", { page: true });
  await dev(`D.useChat.getState().approval?.resolve("allow")`);
  await answered();
  await sleep(1500);
  await shot("files-answer", { page: true });
  await dev(`D.useChat.getState().setMyFiles(false); D.useChat.getState().setIncludeCurrentPage(true)`);
  await sidebar(null);

  }

  // ---------------------------------------------------------------- page check
  await go(`${site}/miracle-diet`, 3000);
  await sidebar("site");
  await js(`document.querySelector('section[aria-label="Check this page"] button')?.click()`);
  await need("page check", `!!document.querySelector('[aria-label="Page check results"]')`);
  await js(`document.querySelector('section[aria-label="Check this page"]')?.scrollIntoView({ block: "start" })`);
  await shot("page-check", { page: true });
  await sidebar(null);

  // ---------------------------------------------------------------- tabs: hover preview, search, groups and workspaces
  await go(WIKI.volcano, 3000);
  await dev(`const s = D.useStore.getState(); s.setGroup(s.activeId, "School"); s.newTab(${JSON.stringify(WIKI.tectonics)}, { group: "School" }); s.newTab(${JSON.stringify(WIKI.lava)}, { group: "School" }); s.newTab(${JSON.stringify(WIKI.bread)}, { group: "Personal" })`);
  await sleep(4000);
  await dev(`const s = D.useStore.getState(); s.activate(s.tabs[0].id)`);
  await sleep(1200);
  const tabRect = JSON.parse(await js(`JSON.stringify((() => { const t = [...document.querySelectorAll('[role="tab"]')][1]?.getBoundingClientRect(); return t ? { x: t.x, y: t.y, width: t.width, height: t.height } : null; })())`));
  const secondId = [...win.tabs.keys()][1];
  if (secondId) { await dev(`D.useStore.getState().activate(${JSON.stringify(secondId)})`); await sleep(2500); await dev(`const s = D.useStore.getState(); s.activate(s.tabs[0].id)`); await sleep(1200); }   // shown once, so it has a picture
  if (tabRect && secondId) {
    await commands.hover_show(win, { id: secondId, ...tabRect, dark: false });
    await sleep(1500);
    const v = browser.hoverCard.views.get(win.label);
    if (v) { const b = v.getBounds(); await shot("tab-preview", { page: true, layers: [{ wc: v.webContents, x: b.x, y: b.y }] }); }
    commands.hover_hide(win);
  }
  await dev(`D.useStore.getState().setOverlay("tabsearch")`);
  await sleep(500);
  await ui.insertText("volcano");
  await sleep(1200);
  await shot("tab-search");
  await closeAll();
  const ws = [{ id: "demo-ws", name: "Science fair research", createdAt: Date.now() - 86400000, tabs: [{ url: WIKI.volcano, title: "Volcano - Wikipedia", favicon: "", pinned: false, group: "School" }, { url: WIKI.lava, title: "Lava - Wikipedia", favicon: "", pinned: false, group: "School" }], chatId: null, projectId: pid }];
  await js(`localStorage.setItem("qp.workspaces.v1", ${JSON.stringify(JSON.stringify(ws))})`);
  await sidebar("therapist");
  await sleep(800);
  await shot("tab-groups", { page: true });
  await sidebar(null);

  // ---------------------------------------------------------------- crash recovery
  const crashId = [...win.tabs.keys()][3];
  if (crashId) {
    await dev(`D.useStore.getState().activate(${JSON.stringify(crashId)})`);
    await sleep(1500);
    win.tabs.get(crashId)?.view?.webContents.forcefullyCrashRenderer();
    await sleep(500);
    win.tabs.get(crashId)?.view?.webContents.forcefullyCrashRenderer();
    await need("crash screen", `/This tab crashed/i.test(document.body.innerText)`, 12000);
    await shot("crash-recovery");
    await dev(`D.useStore.getState().activate(D.useStore.getState().tabs[0].id)`);
    await sleep(800);
  }

  // ---------------------------------------------------------------- panels
  await dev(`D.useTaskManager.getState().show()`);
  await sleep(1500);
  await shot("task-manager");
  await dev(`D.useTaskManager.getState().close()`);
  await closeAll();

  await dev(`D.useStore.getState().setOverlay("library")`);
  await sleep(600);
  await js(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Memory')?.click()`);
  await sleep(400);
  await ui.insertText("magma lava");
  await need("recall results", `/volcano|lava/i.test(document.querySelector('[aria-label="Library"]')?.innerText ?? document.body.innerText)`, 6000);
  await shot("recall");
  await js(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Timeline')?.click()`);
  await need("timeline", `!!document.querySelector('[aria-label="Timeline"] li')`, 6000);
  await shot("timeline");
  await closeAll();

  commands.profile_create(win, { name: "School", color: "#0d9488" });
  commands.profile_create(win, { name: "Personal", color: "#7c3aed" });
  await dev(`D.useStore.getState().setOverlay("profiles")`);
  await shot("profiles");
  await closeAll();
  await dev(`D.useStore.getState().setOverlay("privacy")`);
  await shot("privacy");
  await closeAll();
  await dev(`D.useStore.getState().setOverlay("extensions")`);
  await shot("extensions");
  await closeAll();

  try {
    await commands.vault_create(win, { master: "demo-master-password-for-screenshots" });
    commands.vault_save(win, { host: "classroom.example.com", username: "alex@example.com", password: "Sample-Only-1" });
    commands.vault_save(win, { host: "library.example.org", username: "alex.demo", password: "Sample-Only-2" });
  } catch (e) { console.log("vault", e.message); }
  await sidebar("passwords");
  await shot("passwords", { page: true });
  await sidebar(null);

  // downloads, sorted into folders (sample files in the temp folder)
  const dl = path.join(demo, "Downloads");
  const now = Math.floor(Date.now() / 1000);
  const sample = [["Science fair poster.pdf", "PDFs", 1840000], ["volcano-diagram.png", "Images", 612000], ["Lab results.xlsx", "Spreadsheets", 48000], ["download (3).pdf", null, 230000]];
  sample.forEach(([name, folder, size], i) => {
    const p = folder ? path.join(dl, folder, name) : path.join(dl, name);
    fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, "sample");
    downloads.items.push({ id: 9000 + i, name, url: `https://example.com/${encodeURIComponent(name)}`, host: "example.com", path: p, state: "done", started: now - 600 * (i + 1), finished: now - 600 * (i + 1) + 5, size, can_open: true, private: false, tab: "", movedFrom: folder ? path.join(dl, name) : undefined });
  });
  downloads.push();
  await sidebar("downloads");
  await shot("downloads", { page: true });
  await sidebar(null);

  // ---------------------------------------------------------------- safety foundation
  const tidyRoot = path.join(demo, "Desktop");
  for (const n of ["IMG_4021.jpg", "Essay draft.docx", "scan0003.pdf", "Budget.xlsx", "Quick Pebble 2.1.0.dmg", "notes.txt"]) { fs.mkdirSync(tidyRoot, { recursive: true }); fs.writeFileSync(path.join(tidyRoot, n), "sample"); }
  const { tidyPlan } = await import("./tidy.mjs");
  const plan = tidyPlan(tidyRoot, fs.readdirSync(tidyRoot).map((n) => ({ name: n, isFile: true, size: 120000 + n.length * 3100 })), (p) => fs.existsSync(p));
  const first = safety.tasks.preview({ title: "Tidy up Desktop", roots: [tidyRoot], items: plan.slice(0, 3) });
  await commands.task_confirm(win, { id: first.id, picks: first.items.map((i) => i.i) });
  const view = safety.tasks.preview({ title: "Tidy up Desktop", roots: [tidyRoot], items: plan.slice(3) });
  await dev(`D.useReview.getState().open(${JSON.stringify(view)})`);
  await need("review list", `!!document.querySelector('[aria-label="Changes to review"]')`);
  await shot("review-list");
  await dev(`D.useReview.getState().cancel()`);
  await dev(`D.useStore.getState().setOverlay("changes")`);
  await need("changes", `/Tidy up Desktop/.test(document.body.innerText)`);
  await shot("recent-changes");
  await closeAll();
  db.setSetting("screen_app_permissions", JSON.stringify({ Notes: "allow", Calendar: "allow", Mail: "deny" }));
  db.setSetting("protected_folders", JSON.stringify([path.join(demo, "Documents", "Taxes")]));
  db.setSetting("screen_watch", "1");
  await dev(`D.useStore.getState().setOverlay("settings")`);
  await need("settings", `!!document.querySelector('[aria-label="Assistant safety"]')`);
  await sleep(800);
  await shot("settings-themes");
  await js(`document.querySelector('[aria-label="Assistant safety"]').scrollIntoView({ block: "start" })`);
  await shot("safety-settings");
  await js(`document.querySelector('[aria-label="Memory and knowledge"]').scrollIntoView({ block: "start" })`);
  await shot("files-settings");
  await closeAll();

  // ---------------------------------------------------------------- clean-up (the disk scan reads only the sample home)
  await dev(`D.ipc.folderPick = async () => ${JSON.stringify(path.join(demo, "Pictures"))}`);
  await dev(`D.useStore.getState().setOverlay("cleanup")`);
  await sleep(600);
  // The disk scan reads the home folder; point it at the sample home so nothing of this computer's appears.
  const realHome = process.env.HOME;
  process.env.HOME = demo;
  await js(`[...document.querySelectorAll('button')].find(b => b.textContent === 'Scan my disk')?.click()`);
  await need("disk scan", `/items looked at/.test(document.body.innerText)`, 60000);
  process.env.HOME = realHome;
  await shot("cleanup-disk");
  await js(`document.querySelector('section[aria-label="Rename by content"] button')?.click()`);
  await need("rename list", `!!document.querySelector('[aria-label="Files to rename"]')`);
  await js(`document.querySelector('section[aria-label="Rename by content"]').scrollIntoView({ block: "start" })`);
  await shot("rename-by-content");
  await js(`document.querySelector('section[aria-label="Slow"]').scrollIntoView({ block: "start" })`);
  await shot("cleanup-speed");
  await js(`document.querySelector('section[aria-label="Photo triage"] button')?.click()`);
  await need("photo review", `!!document.querySelector('[aria-label="Changes to review"]')`);
  await shot("photo-triage");
  await dev(`D.useReview.getState().cancel()`);
  await closeAll();

  // ---------------------------------------------------------------- school (local AI on sample school pages)
  await go(WIKI.volcano, 3000);
  await dev(`D.useStore.getState().setOverlay("school")`);
  await sleep(800);
  await shot("school");
  await js(`[...document.querySelectorAll('section[aria-label="Study packs"] button')].find(b => /^Make a study pack/.test(b.textContent))?.click()`);
  await sleep(300);
  await js(`[...document.querySelectorAll('section[aria-label="Study packs"] button')].find(b => b.textContent === 'Send')?.click()`);
  if (!(await until(`!!document.querySelector('[aria-label="Study pack"]')`, 420000))) {
    // a small local model sometimes returns JSON the app can't use; try once more
    await js(`[...document.querySelectorAll('section[aria-label="Study packs"] button')].find(b => /^Make a study pack/.test(b.textContent))?.click()`);
    await sleep(300);
    await js(`[...document.querySelectorAll('section[aria-label="Study packs"] button')].find(b => b.textContent === 'Send')?.click()`);
    await need("study pack", `!!document.querySelector('[aria-label="Study pack"]')`, 420000);
  }
  await shot("study-pack");
  await closeAll();
  await go(`${site}/school/timetable`, 2000);
  await dev(`D.useStore.getState().setOverlay("school")`);
  await sleep(600);
  await js(`[...document.querySelectorAll('section[aria-label="Timetable"] button')].find(b => /Read the timetable/.test(b.textContent))?.click()`);
  await sleep(300);
  await js(`[...document.querySelectorAll('section[aria-label="Timetable"] button')].find(b => b.textContent === 'Send')?.click()`);
  await need("timetable", `!!document.querySelector('[aria-label="Classes found"]')`, 240000);
  await js(`document.querySelector('section[aria-label="Timetable"]').scrollIntoView({ block: "start" })`);
  await shot("timetable");
  await closeAll();

  // ---------------------------------------------------------------- routines
  await dev(`D.useStore.getState().setOverlay("routines")`);
  await need("routines", `!!document.querySelector('[aria-label="Saved routines"] li')`);
  await shot("routines");
  await closeAll();
  await dev(`D.useRoutines.setState({ teaching: true })`);
  await go(`${site}/school/timetable`, 1500);
  await shot("teach-by-showing", { page: true });
  await dev(`D.useRoutines.setState({ teaching: false })`);

  if (want("quick-do")) {
  // ---------------------------------------------------------------- "do this for me" (local AI)
  const clipBefore = String((await clipboard.readText()) ?? "");
  clipboard.writeText("meeting notes - budget 5k approved - launch moved to friday - sam owns the slides - next check-in monday 10am");
  await quickdo.open();
  quickdo.state.app = "Notes";   // a sample app name, not whatever happens to be in front on this computer
  quickdo.win.webContents.send("qp-quickdo:open", quickdo.view());
  const qw = quickdo.win.webContents;
  qw.setBackgroundThrottling(false);
  await qw.executeJavaScript(`document.getElementById('ins').value = "Turn these notes into a table"; document.getElementById('form').requestSubmit()`);
  for (let t = 0; t < 180 && !(await qw.executeJavaScript(`!document.getElementById('draft').hidden`)); t++) await sleep(1000);
  await standalone("quick-do", qw);
  quickdo.hide();
  clipboard.writeText(clipBefore);

  }

  if (want("compare-prices")) {
  // ---------------------------------------------------------------- compare prices (sample shops on this computer, local AI)
  commands.prices_set_country(win, { country: "AE" });
  for (const s of commands.prices_config(win).shops) commands.prices_shop_remove(win, { name: s.name });
  for (const [name, p] of [["Demo Electronics", "shop-a"], ["Example Mart", "shop-b"], ["Sample Store", "shop-c"], ["Test Gadgets", "shop-robot"]]) commands.prices_shop_add(win, { shop: { name, search: `${site}/${p}?q={q}` } });
  await dev(`D.useStore.getState().setOverlay("prices")`);
  await sleep(800);
  await js(`(() => { const i = document.querySelector('input[aria-label="Product"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'Wireless headphones WH-200'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(300);
  await js(`[...document.querySelectorAll('button')].find(b => /^Compare in/.test(b.textContent))?.click()`);
  await sleep(400);
  await js(`[...document.querySelectorAll('button')].find(b => b.textContent === 'Check prices')?.click()`);
  await need("prices", `!!document.querySelector('[aria-label="Price results"]')`, 300000);
  await shot("compare-prices");
  await closeAll();
  commands.prices_shops_reset(win);

  }

  if (!ONLY || [...ONLY].some((n) => n.startsWith("theme-"))) {
  // ---------------------------------------------------------------- theme gallery: the new tab page in every theme
  await sidebar(null);
  await dev(`const s = D.useStore.getState(); s.newTab()`);
  await sleep(1200);
  for (const p of PRESETS_FOR_SHOTS) {
    for (const mode of ["light", "dark"]) {
      nativeTheme.themeSource = mode;
      await dev(`D.useStore.getState().setPreset(${JSON.stringify(mode)}, ${JSON.stringify(p.id)})`);
      await sleep(700);
      await shot(`theme-${p.id}-${mode}`, { caption: `${p.label} · ${mode === "light" ? "Light" : "Dark"}` });
    }
  }
  }
  nativeTheme.themeSource = "light";

  site.close?.();
  fs.rmSync(demo, { recursive: true, force: true });
  console.log(failures.length ? `\nSHOTS DONE WITH ${failures.length} MISSING: ${failures.join(", ")}` : "\nALL SHOTS DONE");
  app.exit(failures.length ? 1 : 0);
}

/** Sample files for the tools that look at files: notes for "answer from my files", a sample home for the disk scan. */
function makeSampleFiles(demo) {
  const w = (rel, body) => { const p = path.join(demo, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
  w("Notes/science-fair.md", "# Science fair\nThe science fair is on 14 November in the main hall.\nThe poster needs: a title, the question, the method, results with one chart, and at least three sources.\nMs. Rivera checks posters on 10 November.");
  w("Notes/volcano-model.md", "# Volcano model\nBaking soda and vinegar, with red food colouring. Test it outside first.\nBuild the cone from papier-mâché around a plastic bottle.");
  w("Notes/reading-list.txt", "Reading list\n- How volcanoes work (library)\n- Plate tectonics for beginners");
  w("Pictures/IMG_4021.jpg", "sample"); w("Pictures/scan0003.pdf", "%PDF-1.4 sample"); w("Pictures/DSC_0012.JPG", "sample"); w("Pictures/Screenshot 2026-10-01 at 09.12.33.png", "sample"); w("Pictures/Coffee receipt.jpg", "sample");
  const big = (rel, mb) => { const p = path.join(demo, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, Buffer.alloc(mb * 1024 * 1024)); };
  big("Code/robot-arm/node_modules/three/build/three.module.js", 24); big("Code/weather-app/node_modules/react-dom/cjs/react-dom.development.js", 12);
  big("Library/Caches/com.example.video-editor/render-cache.bin", 38); big("Library/Caches/com.example.music/artwork.db", 9);
  big("Downloads/old-game-installer.zip", 18); big("Movies/Holiday trip.mov", 6);
  const old = new Date(Date.now() - 200 * 86400000); fs.utimesSync(path.join(demo, "Downloads/old-game-installer.zip"), old, old);
  return path.join(demo, "Notes");
}

/** Sample pages served from this computer: articles, a school portal, a page with ads, and sample shops. */
async function sampleSite() {
  const { PAGES } = await import("./shots-data.mjs");
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://localhost");
    const page = PAGES[u.pathname];
    res.writeHead(page ? 200 : 404, { "content-type": "text/html; charset=utf-8" });
    res.end(page ? page(u) : "<title>Not found</title>Not found");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = new String(`http://localhost:${server.address().port}`);
  base.close = () => server.close();
  return base;
}
