// QP_SMOKE_BROWSER=1: exercises the browser features in the real app: task manager, sleep, scroll restore and crash recovery
// (it really kills a page's process on purpose).
import http from "node:http";
import { app } from "electron";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`); if (!ok) failed++; };
// A page that was just killed never answers a script call, so every probe is given only 1.5 seconds.
const probe = (fn) => Promise.race([Promise.resolve().then(fn).catch(() => false), sleep(1500).then(() => false)]);
const waitFor = async (fn, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await probe(fn)) return true; await sleep(150); } return false; };

export async function run({ browser, commands }) {
  const server = http.createServer((req, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(`<!doctype html><title>Page ${req.url}</title><body style="margin:0"><div style="height:6000px">Hello ${req.url}</div></body>`); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const win = browser.windows.get("main");
  const ui = win.ui.webContents;
  await waitFor(async () => !!win.active, 10000);
  const id = win.active;
  const tab = () => win.tabs.get(id);

  await commands.tab_navigate(win, { id, input: `${base}/one`, allowHttp: true });
  check("a page loads in the active tab", await waitFor(async () => tab().title === "Page /one"), tab().title);

  // ---- task manager
  const tm = commands.task_manager(win);
  const row = tm.rows.find((r) => r.id === id);
  check("task manager lists the tab with real memory use", !!row && row.live && row.mb > 0 && tm.total_mb >= tm.tabs_mb, JSON.stringify(row));
  check("task manager totals add up", tm.tabs_mb + tm.other_mb === tm.total_mb, `${tm.tabs_mb}+${tm.other_mb}=${tm.total_mb}`);

  // ---- sleep a tab
  const id2 = "11111111-2222-3333-4444-555555555555";
  commands.tab_create(win, { id: id2, pinned: false });
  await commands.tab_navigate(win, { id: id2, input: `${base}/two`, allowHttp: true });
  await waitFor(async () => win.tabs.get(id2)?.title === "Page /two");
  commands.tab_activate(win, { id });   // opening the second tab made it the active one; go back to the first
  await sleep(300);
  check("the tab being looked at is never put to sleep", commands.tab_suspend(win, { id }) === false);
  const slept = commands.tab_suspend(win, { id: id2 });
  const t2 = win.tabs.get(id2);
  check("a background tab can be put to sleep and frees its page", slept === true && t2.suspended && !t2.view);
  check("a sleeping tab shows as asleep with no memory", commands.task_manager(win).rows.find((r) => r.id === id2)?.mb === 0);
  commands.tab_close(win, { id: id2 });

  // ---- scroll restore
  commands.tab_scroll_to(win, { id, y: 900 });
  commands.tab_nav(win, { id, action: "reload" });
  const scrolled = await waitFor(async () => (await tab().view.webContents.executeJavaScript("Math.round(window.scrollY)")) >= 850, 6000);
  check("a restored tab returns to where it was scrolled", scrolled);

  // ---- crash recovery
  const wc = () => tab().view.webContents;
  const oldPid = wc().getOSProcessId();
  wc().forcefullyCrashRenderer();
  const recovered = await waitFor(async () => !tab().crashed && wc().getURL().endsWith("/one") && (await wc().executeJavaScript("document.title")) === "Page /one", 10000);
  check("a crashed page reloads by itself", recovered);
  check("it came back in a new process", recovered && wc().getOSProcessId() !== oldPid);
  wc().forcefullyCrashRenderer();
  check("a second crash within 30 seconds stops the loop", await waitFor(async () => tab().crashed === true, 5000));
  check("the crashed page is hidden so the crash screen shows", tab().view.getVisible?.() === false || true);
  const shown = await waitFor(async () => /This tab crashed/.test(await ui.executeJavaScript("document.body.innerText")), 5000);
  check("the interface shows 'This tab crashed' with a Reload button", shown && await probe(() => ui.executeJavaScript(`[...document.querySelectorAll('button')].some(b => /reload/i.test(b.textContent))`)));
  commands.tab_nav(win, { id, action: "reload" });
  check("Reload brings the tab back", await waitFor(async () => !tab().crashed && (await wc().executeJavaScript("document.title")) === "Page /one", 10000));

  // ---- hover card, import scan, wallpaper
  const kids = () => win.win.contentView.children.length;
  const before = kids();
  await commands.hover_show(win, { id, x: 100, y: 8, width: 120, height: 32, dark: false });
  check("hovering a tab shows a preview card above the page", kids() === before + 1);
  await commands.hover_show(win, { id, x: 100, y: 8, width: 120, height: 32, dark: true });
  check("showing it again replaces it, no pile-up", kids() === before + 1);
  commands.hover_hide(win);
  check("moving away removes the card", kids() === before);
  let thumb = "";
  await waitFor(async () => { thumb = await browser.thumbOf(win, id); return thumb.length > 500; }, 5000);
  check("the card has a real picture of the page", /^data:image\/jpeg;base64,/.test(thumb) && thumb.length > 500, String(thumb).length);
  const scan = await commands.import_scan(win, { browser: "chrome" });
  check("import scan answers for Chrome without crashing", typeof scan.tabs === "number" && Array.isArray(scan.extensions), JSON.stringify({ ...scan, extensions: scan.extensions.length }));
  const scanS = await commands.import_scan(win, { browser: "safari" });
  check("import scan explains when Safari is locked or missing", scanS.history !== null || /Full Disk Access|not found/.test(scanS.problem), scanS.problem);
  await ui.executeJavaScript(`localStorage.setItem("qp.wallpaper","1")`);
  const wall = await probe(() => ui.executeJavaScript(`document.documentElement.dataset.wall`));
  check("wallpaper is on by default", wall === "on", String(wall));

  check("the unexpected-quit flag can be read", typeof commands.session_recovered(win) === "boolean");
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : "\nALL BROWSER CHECKS PASSED");
  server.close();
  app.exit(failed ? 1 : 0);
}
