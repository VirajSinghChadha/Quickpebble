// QP_SMOKE_FEATURES=1: checks the assistant features inside the real app: status bar window, project memory, single-search home page,
// project picker and Storage settings. Prints PASS/FAIL lines and exits non-zero if anything fails.
import { app, screen as display } from "electron";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`); if (!ok) failed++; };

export async function run({ browser, commands, statusBar }) {
  const win = browser.windows.get("main");
  const ui = win.ui.webContents;
  const js = (code) => ui.executeJavaScript(code);

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

  // ---------- real interface
  for (let i = 0; i < 40 && !(await js(`!!document.querySelector('input[placeholder*="Search or enter"]')`).catch(() => false)); i++) await sleep(250);
  await sleep(1200);
  check("home page has exactly one search box (the address bar)", (await js(`document.querySelectorAll('input[placeholder*="Search or enter"]').length`)) === 1);
  check("old centre search box is gone", (await js(`!document.querySelector('input[aria-label="Search the web"]')`)));
  check("shortcut tiles are round", await js(`[...document.querySelectorAll('.quick-tiles span')].some(e => getComputedStyle(e).borderRadius.includes('9999') || parseFloat(getComputedStyle(e).borderRadius) >= 28)`));
  await js(`[...document.querySelectorAll('button')].find(b => /assistant/i.test(b.getAttribute('aria-label') || b.title || ''))?.click()`);
  await sleep(1200);
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

  // ---------- clean up the test data
  commands.ctx_clear(win, { chatIds: [cid], projectIds: [pid] });
  check("test data erased only when asked", commands.ctx_chats(win).length === 0 && commands.ctx_projects(win).length === 0);

  console.log(failed ? `\n${failed} CHECK(S) FAILED` : "\nALL FEATURE CHECKS PASSED");
  app.exit(failed ? 1 : 0);
}
