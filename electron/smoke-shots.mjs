// QP_SMOKE_SHOTS=1: drives the real app through its main screens and saves the pieces of each screenshot
// (browser chrome from the UI view, page from the tab view) to /tmp/qp-shots; scripts/compose-screenshots.py joins them.
import fs from "node:fs";
import { app, nativeTheme } from "electron";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = process.env.QP_SHOTS_DIR || "/tmp/qp-shots";

export async function run({ browser, commands, db }) {
  fs.mkdirSync(OUT, { recursive: true });
  const win = browser.windows.get("main");
  const ui = win.ui.webContents;
  const ready = async () => { for (let i = 0; i < 60 && !(await ui.executeJavaScript(`!!document.querySelector('input[placeholder*="Search or enter"]')`).catch(() => false)); i++) await sleep(250); await sleep(1200); };
  db.setSetting("home_onboarded", "home-v1"); // no first-run dialog in the screenshots
  ui.reload();
  await sleep(1500);
  await ready();
  // Capture without animations so panels are never caught mid-fade.
  try { ui.debugger.attach("1.3"); } catch {}
  await ui.debugger.sendCommand("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  const grab = async (wc, file) => { try { wc.debugger.attach("1.3"); } catch {} const { data } = await wc.debugger.sendCommand("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(`${OUT}/${file}`, Buffer.from(data, "base64")); };
  const key = (keyCode, modifiers = []) => { ui.sendInputEvent({ type: "keyDown", keyCode, modifiers }); ui.sendInputEvent({ type: "keyUp", keyCode, modifiers }); };
  const click = (frag) => ui.executeJavaScript(`(() => { const f = ${JSON.stringify(frag.toLowerCase())}; const el = [...document.querySelectorAll('button,[role=tab],[role=option]')].find((e) => ((e.getAttribute('aria-label') || '') + ' ' + (e.title || '') + ' ' + e.textContent).toLowerCase().includes(f)); if (el) { el.click(); return true; } return false; })()`);
  const palette = async (cmd) => { key("P", ["meta", "shift"]); await sleep(500); await ui.insertText(cmd); await sleep(400); await ui.executeJavaScript(`document.querySelector('[role=option]')?.click()`); await sleep(1800); };
  const close = async () => { key("Escape"); await sleep(1800); };
  const meta = {};
  const shot = async (name, { page = null, sidebar = 0 } = {}) => {
    await sleep(1200);
    await grab(ui, `${name}-ui.png`);
    if (page) await grab(page, `${name}-page.png`);
    meta[name] = { sidebar, hasPage: !!page };
    fs.writeFileSync(`${OUT}/meta.json`, JSON.stringify(meta, null, 1));
    console.log("SHOT", name);
  };
  const tabView = () => [...win.tabs.values()].find((t) => t.view)?.view.webContents;
  const open = async (url, wait = 7000) => { const id = [...win.tabs.keys()][0]; commands.tab_navigate(win, { id, input: url }); await sleep(wait); };

  db.setSetting("recall_enabled", "true");
  db.setSetting("home_onboarded", "home-v1");
  nativeTheme.themeSource = "dark";
  await sleep(500);

  // 1. GhostSearch results (dark)
  await open("ghost://search?q=how+to+feed+a+sourdough+starter", 9000);
  await shot("01-ghostsearch-results", { page: tabView() });

  // 3. Assistant with slash commands, beside a results page
  key("J", ["meta"]); await sleep(900);
  await ui.executeJavaScript(`document.querySelector('textarea[aria-label="Message"]')?.focus()`);
  await ui.insertText("/c"); await sleep(600);
  commands.sidebar_set(win, { width: 380 });
  await shot("03-assistant-commands", { page: tabView(), sidebar: 380 });
  await ui.executeJavaScript(`(() => { const t = document.querySelector('textarea[aria-label="Message"]'); if (t) { const s = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; s.call(t, ''); t.dispatchEvent(new Event('input', { bubbles: true })); } })()`);
  key("J", ["meta"]); await sleep(600);
  commands.sidebar_set(win, { width: 0 });

  // Visit real pages so Recall has something genuine to search.
  await open("https://en.wikipedia.org/wiki/Sourdough", 7000);
  await open("https://www.kingarthurbaking.com/recipes/feeding-and-maintaining-your-sourdough-starter-recipe", 8000);
  await open("https://en.wikipedia.org/wiki/Leavening_agent", 6000);

  // 6. Recall in the Library
  key("Y", ["meta"]); await sleep(900);
  await click("memory"); await sleep(500);
  await ui.executeJavaScript(`document.querySelector('input[aria-label^="Search"]')?.focus()`);
  await ui.insertText("sourdough starter"); await sleep(1200);
  await shot("06-recall-memory");
  await close();

  // 2. GhostSearch home (light)
  nativeTheme.themeSource = "light"; await sleep(900);
  await open("ghost://home", 2500);
  await shot("02-ghostsearch-home", { page: tabView() });

  // 4. New tab (light)
  key("W", ["meta"]); await sleep(1200); // closes the GhostSearch tab; a fresh New Tab takes its place
  await shot("04-newtab");

  // dark again for the panels, over a loaded page (the page is hidden while a panel is open, so nothing bleeds through)
  nativeTheme.themeSource = "dark"; await sleep(900);
  await open("ghost://home", 2500);
  await palette("Open Settings"); await shot("05-settings"); await close();
  await palette("Profiles"); await shot("07-profiles"); await close();
  await palette("Privacy Center"); await shot("09-privacy"); await close();
  commands.sidebar_set(win, { width: 380 });
  await click("passwords"); await sleep(1500);
  await shot("08-passwords", { page: tabView(), sidebar: 380 });
  app.exit(0);
}
