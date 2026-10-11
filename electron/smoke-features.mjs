// QP_SMOKE_FEATURES=1: checks the assistant features inside the real app: status bar window, project memory, single-search home page,
// project picker and Storage settings. Prints PASS/FAIL lines and exits non-zero if anything fails.
import { app, globalShortcut, screen as display } from "electron";
import fs from "node:fs";
import path from "node:path";
import { getSecret } from "./secrets.mjs";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`); if (!ok) failed++; };

export async function run({ browser, commands, statusBar, safety }) {
  const win = browser.windows.get("main");
  commands.settings_set(win, { key: "ai_provider", value: "ollama" });   // these checks are about the chat itself, not the Gemini key guide
  const ui = win.ui.webContents;
  const js = (code) => ui.executeJavaScript(code);
  const until = async (code, ms = 8000) => { for (let t = 0; t < ms; t += 250) { if (await js(code).catch(() => false)) return true; await sleep(250); } return false; };
  const closeDialogs = async () => { for (let i = 0; i < 6 && (await js(`!!document.querySelector('button[aria-label="Close"]')`)); i++) { await js(`document.querySelector('button[aria-label="Close"]')?.click()`); await sleep(400); } };
  const openSettings = async () => { await closeDialogs(); await js(`[...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Settings')?.click()`); return until(`[...document.querySelectorAll('h3')].some(h => /assistant safety/i.test(h.textContent))`); };

  // ---------- status bar window
  commands.screen_overlay(win, { state: { phase: "thinking", thinking: "I can see the desktop and the Dock.", next: "Open Notes", step: 2, max: 40 } });
  await sleep(1500);
  const bar = statusBar.win;
  const work = display.getPrimaryDisplay().workArea;
  const b = bar?.getBounds();
  check("status bar opens", !!bar && bar.isVisible());
  check("status bar is at the bottom centre", !!b && b.y + b.height <= work.y + work.height && b.y > work.y + work.height / 2 && Math.abs(b.x + b.width / 2 - (work.x + work.width / 2)) < 3, JSON.stringify(b));
  check("status bar never takes focus", bar && !bar.isFocusable());
  check("status bar stays on top", bar && bar.isAlwaysOnTop());
  const shown = await bar.webContents.executeJavaScript(`JSON.stringify({ title: document.getElementById('title').textContent, count: document.getElementById('count').textContent, think: document.getElementById('think').textContent, next: document.getElementById('next').textContent })`);
  const s = JSON.parse(shown);
  check("status bar shows phase, step, thinking and next action", s.title === "Thinking" && /step 2 of 40/.test(s.count) && /desktop/.test(s.think) && /Open Notes/.test(s.next), shown);
  commands.screen_overlay(win, { state: { phase: "paused", step: 3, max: 40 } });
  await sleep(500);
  const pausedUi = JSON.parse(await bar.webContents.executeJavaScript(`JSON.stringify({ title: document.getElementById('title').textContent, button: document.getElementById('pause').textContent, think: document.getElementById('think').textContent })`));
  check("paused bar offers Resume and explains what to do", bar.isVisible() && pausedUi.title === "Paused" && pausedUi.button === "Resume" && /your step yourself/.test(pausedUi.think), JSON.stringify(pausedUi));
  const flows = await bar.webContents.executeJavaScript(`new Promise((r) => { document.getElementById('pause').click(); setTimeout(() => r(true), 100); })`);
  check("the Pause button on the bar is clickable", flows === true);
  check("pause hotkey is registered", globalShortcut.isRegistered("CommandOrControl+Alt+P"));
  commands.screen_overlay(win, { state: { phase: "<img src=x onerror=alert(1)>", thinking: "<b>x</b>" } });
  await sleep(300);
  check("bad status is sanitised and hides the bar", !bar.isVisible());
  commands.screen_overlay(win, { state: { phase: "done", thinking: "All done" } });
  await sleep(600);
  check("finished state shows then lingers", bar.isVisible());
  commands.screen_overlay(win, { state: { phase: "idle" } });
  await sleep(300);
  check("idle hides the bar", !bar.isVisible());

  // ---------- project memory commands
  const pid = commands.ctx_project_save(win, { project: { name: "Smoke project", notes: "Notes for the smoke test" } });
  check("project saved", Number.isInteger(pid));
  const cid = commands.ctx_chat_new(win, { title: "Smoke chat", projectId: pid });
  commands.ctx_chat_append(win, { id: cid, items: [{ kind: "user", text: "hello" }, { kind: "assistant", text: "hi there" }] });
  const loaded = commands.ctx_chat_load(win, { id: cid });
  check("chat persists and reloads", loaded.items.length === 2 && loaded.items[1].text === "hi there");
  const rejected = (() => { try { commands.ctx_chat_append(win, { id: 99999, items: [{ kind: "user", text: "x" }] }); return false; } catch { return true; } })();
  check("writing to a missing chat is refused", rejected);
  check("storage report lists nothing recent", commands.ctx_stale(win, { days: 30 }).chats.length === 0);
  check("account session can be saved (stays signed in)", (() => { try { commands.settings_set(win, { key: "account_session", value: JSON.stringify({ session: { a: 1 } }) }); return !!JSON.parse(commands.settings_get(win).account_session); } catch { return false; } })());

  // ---------- API keys: usable, never on disk (no keychain involvement)
  commands.ai_set_key(win, { provider: "gemini", key: "TEST-KEY-1234567" });
  check("account key is usable by the AI", getSecret("gemini") === "TEST-KEY-1234567");
  const secretsFile = path.join(app.getPath("userData"), "secrets.json");
  check("account key is not written to disk or the keychain", !fs.existsSync(secretsFile) || !/gemini/.test(fs.readFileSync(secretsFile, "utf8")));
  commands.ai_set_key(win, { provider: "gemini", key: "" });
  check("signing out clears the key", getSecret("gemini") === null);

  // ---------- real interface
  for (let i = 0; i < 40 && !(await js(`!!document.querySelector('input[placeholder*="Search or enter"]')`).catch(() => false)); i++) await sleep(250);
  await sleep(1200);
  check("home page has exactly one search box (the address bar)", (await js(`document.querySelectorAll('input[placeholder*="Search or enter"]').length`)) === 1);
  check("old centre search box is gone", (await js(`!document.querySelector('input[aria-label="Search the web"]')`)));
  check("shortcut tiles are round", await js(`[...document.querySelectorAll('.quick-tiles span')].some(e => getComputedStyle(e).borderRadius.includes('9999') || parseFloat(getComputedStyle(e).borderRadius) >= 28)`));
  await js(`[...document.querySelectorAll('button')].find(b => /assistant/i.test(b.getAttribute('aria-label') || b.title || ''))?.click()`);
  await sleep(1200);
  check("global shortcut for the assistant is registered", globalShortcut.isRegistered("CommandOrControl+Shift+Space"));
  await js(`document.querySelector('button[aria-label="Close side panel"]')?.click()`);
  await sleep(500);
  browser.emitUi(win, "qp://assistant", {});
  await sleep(900);
  check("the shortcut opens the assistant with the cursor in its box", await js(`!!document.querySelector('aside textarea') && document.activeElement === document.querySelector('aside textarea')`));
  check("assistant shows the project picker", await js(`!!document.querySelector('select[aria-label^="Project the assistant"]')`));
  check("assistant shows new chat and past chats buttons", await js(`!!document.querySelector('button[aria-label="New chat"]') && !!document.querySelector('button[aria-label="Past chats"]')`));
  check("saved project appears in the picker", await js(`[...document.querySelectorAll('select[aria-label^="Project the assistant"] option')].some(o => o.textContent === 'Smoke project')`));
  await js(`[...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Settings')?.click()`);
  await sleep(1200);
  check("settings has a Storage section", await js(`[...document.querySelectorAll('h3')].some(h => /^storage$/i.test(h.textContent.trim()))`));
  check("storage clean-up can be reviewed", await js(`[...document.querySelectorAll('button')].some(b => /review what can be cleared/i.test(b.textContent))`));
  await js(`[...document.querySelectorAll('button')].find(b => /review what can be cleared/i.test(b.textContent))?.click()`);
  await sleep(1000);
  check("clean-up dialog opens with a safe empty state", await js(`/nothing has gone unused|unused chats and project notes/i.test(document.body.innerText)`));

  // ---------- usage meter, plan setting
  const u = commands.usage_today(win);
  check("usage meter reports today's calls against a limit", Number.isInteger(u.calls) && u.limit === 1000 && u.level === "ok", JSON.stringify(u));
  commands.settings_set(win, { key: "usage_limit", value: "250" });
  check("daily limit can be changed", commands.usage_today(win).limit === 250);
  check("a silly limit is refused", (() => { try { commands.settings_set(win, { key: "usage_limit", value: "3" }); return false; } catch { return true; } })());
  commands.settings_set(win, { key: "screen_plan", value: "always" });
  check("plan preview setting saves", commands.settings_get(win).screen_plan === "always");
  check("unknown plan setting refused", (() => { try { commands.settings_set(win, { key: "screen_plan", value: "sometimes" }); return false; } catch { return true; } })());
  check("settings show the usage meter and the plan option", await js(`document.body.innerText.includes('AI calls today') && !!document.querySelector('select[aria-label="Preview the plan"]') && !!document.querySelector('input[aria-label="Daily AI call limit"]')`));

  // ---------- problem report, tour, squash
  const rp = commands.report_preview(win, { includeLog: false });
  check("report preview carries version info and no log unless asked", /Quick Pebble/.test(rp.text) && !/Recent warnings/.test(rp.text) && !!rp.version, rp.text.split("\n")[0]);
  check("report with the log attached still has no keys or tokens", !/AIza|eyJ|sb_secret/.test(commands.report_preview(win, { includeLog: true }).text) && /Recent warnings/.test(commands.report_preview(win, { includeLog: true }).text));
  check("settings offer the tour, the problem report and the clean-up", await js(`[...document.querySelectorAll('button')].some(b => /take the tour/i.test(b.textContent)) && [...document.querySelectorAll('button')].some(b => /report a problem/i.test(b.textContent))`));
  const squashChat = commands.ctx_chat_new(win, { title: "Old chat to squash", projectId: pid });
  commands.ctx_chat_append(win, { id: squashChat, items: Array.from({ length: 6 }, (_, i) => ({ kind: i % 2 ? "assistant" : "user", text: `message ${i}: a few words about the volcano project` })) });
  const squashed = commands.ctx_chat_squash(win, { id: squashChat, summary: "You planned a volcano project: materials, steps and a poster outline for the fair." });
  const afterSquash = commands.ctx_chat_peek(win, { id: squashChat });
  check("an old chat can be squashed to one summary", squashed.saved > 0 && afterSquash.items.length === 1 && afterSquash.items[0].kind === "summary");
  check("the project knows how many chats it has", commands.ctx_projects(win).find((p) => p.id === pid)?.chats >= 2);
  commands.ctx_clear(win, { chatIds: [squashChat], projectIds: [] });

  // ---------- safety foundation: dry run, confirm, receipt, undo, protected folders, settings
  const box = fs.mkdtempSync(path.join(app.getPath("temp"), "qp-safety-"));
  for (const n of ["a.txt", "b.txt", "keep.txt"]) fs.writeFileSync(path.join(box, n), n);
  fs.mkdirSync(path.join(box, "Locked"));
  fs.writeFileSync(path.join(box, "Locked", "secret.txt"), "x");
  commands.settings_set(win, { key: "protected_folders", value: JSON.stringify([path.join(box, "Locked")]) });
  check("protected folders are listed", commands.protected_list(win)[0] === path.join(box, "Locked"));
  const items = [...["a.txt", "b.txt", "keep.txt"].map((n) => ({ kind: "move", path: path.join(box, n), to: path.join(box, "Sorted", n), size: 5 })), { kind: "move", path: path.join(box, "Locked", "secret.txt"), to: path.join(box, "Sorted", "secret.txt") }, { kind: "trash", path: "/etc/hosts" }];
  const view = safety.tasks.preview({ title: "Smoke tidy", roots: [box], items });
  check("a dry run lists everything and changes nothing", view.items.length === 5 && fs.existsSync(path.join(box, "a.txt")) && !fs.existsSync(path.join(box, "Sorted")));
  check("protected and outside paths are refused in the list", /protected/.test(view.items[3].problem) && !!view.items[4].problem && view.ready === 3, JSON.stringify(view.items.map((i) => i.problem)));
  const receipt = await commands.task_confirm(win, { id: view.id, picks: [0, 1, 3, 4] });
  check("confirm does only the ticked, allowed items", receipt.done.length === 2 && fs.existsSync(path.join(box, "Sorted", "a.txt")) && fs.existsSync(path.join(box, "keep.txt")) && fs.existsSync(path.join(box, "Locked", "secret.txt")), JSON.stringify(receipt));
  check("a receipt is saved", commands.receipts_list(win, {})[0]?.id === view.id);
  check("each change is in the undo list", commands.actions_list(win, {}).filter((r) => r.task === view.id).length === 2);
  const undone = commands.actions_undo_task(win, { task: view.id });
  check("undo this whole task puts the files back", undone.undone === 2 && fs.existsSync(path.join(box, "a.txt")) && fs.existsSync(path.join(box, "b.txt")));
  check("a used list can't be confirmed twice", await commands.task_confirm(win, { id: view.id, picks: [2] }).then(() => false, () => true));
  check("bad safety settings are refused", ["screen_watch:yes", "screen_app_permissions:[1]", 'screen_app_permissions:{"a/b":"allow"}', "protected_folders:{}"].every((kv) => { const [key, ...v] = kv.split(":"); try { commands.settings_set(win, { key, value: v.join(":") }); return false; } catch { return true; } }));
  commands.settings_set(win, { key: "screen_app_permissions", value: JSON.stringify({ Notes: "allow", Mail: "deny" }) });
  commands.settings_set(win, { key: "screen_watch", value: "1" });
  await openSettings();
  await until(`document.querySelector('[aria-label="App permissions"]')?.innerText.includes('Mail')`);
  check("settings has an Assistant safety section with Watch mode", await js(`[...document.querySelectorAll('h3')].some(h => /assistant safety/i.test(h.textContent)) && document.querySelector('input[aria-label="Watch mode"]')?.checked === true`));
  check("settings list app answers with Revoke and Forget", await js(`(() => { const t = document.querySelector('[aria-label="App permissions"]')?.innerText ?? ''; return /Notes\\s*Allowed/.test(t) && /Mail\\s*Not allowed/.test(t) && /Revoke/.test(t) && /Forget/.test(t); })()`));
  check("settings list the protected folder", await js(`(document.querySelector('[aria-label="Protected folders"]')?.innerText ?? '').includes('Locked')`));
  await js(`[...document.querySelectorAll('[aria-label="App permissions"] button')].find(b => b.textContent === 'Revoke')?.click()`);
  await until(`!document.querySelector('[aria-label="App permissions"]')?.innerText.includes('Notes')`);
  check("revoking an app forgets it", JSON.parse(commands.settings_get(win).screen_app_permissions).Notes === undefined);
  await js(`[...document.querySelectorAll('button')].find(b => b.textContent === 'Open' && b.closest('[aria-label="Assistant safety"]'))?.click()`);
  await sleep(900);
  check("Recent changes shows the task with its undone items", await js(`document.body.innerText.includes('Recent changes') && document.body.innerText.includes('Smoke tidy') && /Undone/.test(document.body.innerText)`));
  await js(`[...document.querySelectorAll('[role="tab"]')].find(b => b.textContent === 'Receipts')?.click()`);
  await sleep(300);
  check("Recent changes shows the receipt", await js(`/Smoke tidy[\\s\\S]*2 done/.test(document.body.innerText)`));
  await js(`document.querySelector('button[aria-label="Close"]')?.click()`);
  commands.settings_set(win, { key: "screen_watch", value: "0" });
  commands.settings_set(win, { key: "protected_folders", value: "[]" });
  fs.rmSync(box, { recursive: true, force: true });

  // ---------- Mac clean-up (reads only, except inside a throwaway folder)
  const pics = fs.mkdtempSync(path.join(app.getPath("temp"), "qp-photos-"));
  const png = Buffer.alloc(32); png.writeUInt32BE(0x89504e47, 0); png.write("IHDR", 12, "ascii"); png.writeUInt32BE(1179, 16); png.writeUInt32BE(2556, 20);
  fs.writeFileSync(path.join(pics, "IMG_0001.PNG"), png);
  fs.writeFileSync(path.join(pics, "Screenshot 2026-10-01 at 09.00.00.png"), png);
  fs.writeFileSync(path.join(pics, "Coffee receipt.jpg"), "x");
  fs.writeFileSync(path.join(pics, "beach.jpg"), "x");
  const ph = await commands.clean_photos_scan(win, { folder: pics });
  check("photo triage suggests screenshots and receipts only", ph.view.ready === 3 && ph.unsure === 1 && ph.view.items.every((i) => /Screenshots|Receipts/.test(i.to)), JSON.stringify(ph.view.items.map((i) => i.what)));
  const phr = await commands.task_confirm(win, { id: ph.view.id, picks: ph.view.items.map((i) => i.i) });
  check("confirmed photo moves happen and can be undone", phr.done.length === 3 && fs.existsSync(path.join(pics, "Receipts", "Coffee receipt.jpg")) && commands.actions_undo_task(win, { task: ph.view.id }).undone === 3 && fs.existsSync(path.join(pics, "Coffee receipt.jpg")));
  fs.writeFileSync(path.join(pics, "scan0003.pdf"), "%PDF-1.4");
  const rc = await commands.clean_rename_candidates(win, { folder: pics });
  check("rename by content finds unclear names and says how each is looked at", rc.files.some((f) => f.name === "scan0003.pdf" && f.mode === "picture") && !rc.files.some((f) => f.name === "beach.jpg") && !!rc.provider);
  check("a system folder can't be chosen to rename in", await commands.clean_rename_candidates(win, { folder: "/usr/bin" }).then(() => false, () => true));
  fs.rmSync(pics, { recursive: true, force: true });
  const slow = await commands.system_slow(win);
  check("why-is-it-slow reads real processes", slow.groups.length > 3 && slow.memTotal > 0, `${slow.groups.length} apps, culprits: ${slow.culprits.map((c) => c.name).join(", ") || "none"}`);
  const ra = await commands.apps_running(win, { hours: 48 });
  check("running apps are listed and unused-app tracking starts off", ra.running.length > 0 && ra.tracking === false && ra.unused.length === 0, `${ra.running.length} open`);
  const tidy = await commands.clean_tidy(win, { folders: ["desktop", "downloads"] });
  check("Desktop/Downloads tidy-up only plans moves that stay in those folders", tidy.items.every((i) => i.kind === "move" && (i.problem === null || /protected/.test(i.problem))), `${tidy.ready} planned`);
  commands.task_cancel(win, { id: tidy.id });
  const inst = await commands.clean_installers(win);
  check("old installer search runs and only lists installers", inst.items.every((i) => /\.(dmg|pkg|mpkg|zip)$/i.test(i.path)), `${inst.items.length} found`);
  commands.task_cancel(win, { id: inst.id });
  await openSettings();
  await js(`[...document.querySelectorAll('button')].find(b => b.textContent === 'Open clean-up')?.click()`);
  await until(`!!document.querySelector('section[aria-label="Login items"]')`);
  const tools = await js(`[...document.querySelectorAll('section[aria-label]')].map(s => s.getAttribute('aria-label')).join(',')`);
  check("the clean-up panel shows every tool", ["Disk", "Installers", "Forgotten apps", "Tidy", "Rename by content", "Photo triage", "Slow", "Quit unused apps", "Login items"].every((t) => tools.includes(t)), tools);
  await js(`[...document.querySelectorAll('button')].find(b => b.textContent === 'Plan the tidy-up…')?.click()`);
  await sleep(1500);
  check("planning opens the review list and nothing has changed yet", await js(`/Nothing has changed yet/.test(document.body.innerText) && !!document.querySelector('[aria-label="Changes to review"]')`));
  await js(`[...document.querySelectorAll('button')].find(b => b.textContent === 'Cancel')?.click()`);
  await sleep(400);
  await js(`[...document.querySelectorAll('button')].find(b => b.textContent === 'Check now')?.click()`);
  for (let i = 0; i < 32 && !(await js(`/Memory: .+ of .+ in use/.test(document.body.innerText)`)); i++) await sleep(250);
  check("the slow-Mac check shows memory in the panel", await js(`/Memory: .+ of .+ in use/.test(document.body.innerText)`), await js(`(document.querySelector('section[aria-label="Slow"]')?.innerText ?? 'no section').slice(0, 300)`));
  await closeDialogs();

  // ---------- clean up the test data
  commands.ctx_clear(win, { chatIds: [cid], projectIds: [pid] });
  check("test data erased only when asked", commands.ctx_chats(win).length === 0 && commands.ctx_projects(win).length === 0);

  console.log(failed ? `\n${failed} CHECK(S) FAILED` : "\nALL FEATURE CHECKS PASSED");
  app.exit(failed ? 1 : 0);
}
