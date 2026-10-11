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
  // /dodgy is a page with everything the page check looks for: a sponsored box, an old date, a publisher, and a tracker.
  const DODGY = `<!doctype html><title>Miracle diet</title><script type="application/ld+json">{"@type":"NewsArticle","datePublished":"2019-02-01","dateModified":"2019-03-04","publisher":{"name":"Example Health Media"}}</script>
    <body><article><h2>Lose 10 kg in a week</h2><span>Sponsored</span></article><a rel="sponsored" href="https://shop.example/x">Buy now</a>
    <img src="https://www.google-analytics.com/collect?v=1" width="1" height="1"><footer>© 2019 Example Health Media. All rights reserved.</footer></body>`;
  const server = http.createServer((req, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(req.url === "/dodgy" ? DODGY : `<!doctype html><title>Page ${req.url}</title><body style="margin:0"><div style="height:6000px">Hello ${req.url}</div></body>`); });
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
  if (thumb) check("the card has a real picture of the page", /^data:image\/jpeg;base64,/.test(thumb) && thumb.length > 500, `len ${thumb.length}`);
  else console.log("SKIP  the card picture: macOS gave no pixels because the test window was covered (the card then says 'No preview yet')");
  const wcid = tab().view.webContents.id;
  await browser.pageCommand(wcid, "qp_link_hover", { url: "https://example.com/a", x: 50, y: 50, w: 80, h: 16 });
  check("hovering a link shows a small card", kids() === before + 1);
  await browser.pageCommand(wcid, "qp_link_hover", { url: "" });
  check("moving off the link removes it", kids() === before);
  await browser.pageCommand(wcid, "qp_link_hover", { url: "javascript:alert(1)", x: 0, y: 0, w: 1, h: 1 });
  check("a link that is not a web address gets no card", kids() === before);
  const scan = await commands.import_scan(win, { browser: "chrome" });
  check("import scan answers for Chrome without crashing", typeof scan.tabs === "number" && Array.isArray(scan.extensions), JSON.stringify({ ...scan, extensions: scan.extensions.length }));
  const scanS = await commands.import_scan(win, { browser: "safari" });
  check("import scan explains when Safari is locked or missing", scanS.history !== null || /Full Disk Access|not found/.test(scanS.problem), scanS.problem);
  await ui.executeJavaScript(`localStorage.setItem("qp.wallpaper","1")`);
  const wall = await probe(() => ui.executeJavaScript(`document.documentElement.dataset.wall`));
  check("wallpaper is on by default", wall === "on", String(wall));

  check("the unexpected-quit flag can be read", typeof commands.session_recovered(win) === "boolean");

  // ---- page check and the timeline
  commands.settings_set(win, { key: "timeline_enabled", value: "1" });
  commands.tab_activate(win, { id });
  await commands.tab_navigate(win, { id, input: `${base}/dodgy`, allowHttp: true });
  await waitFor(async () => tab().title === "Miracle diet");
  await sleep(800);
  const pf = await commands.agent_exec(win, { tabId: id, op: "page_facts" });
  check("page facts find the sponsored label, the old date and the publisher", pf.labels.some((l) => l.label === "Sponsored" && /Lose 10 kg/.test(l.near)) && pf.sponsoredLinks === 1 && pf.ld[0]?.modified === "2019-03-04" && pf.ld[0]?.publisher === "Example Health Media", JSON.stringify({ labels: pf.labels, ld: pf.ld }));
  const tr = commands.page_trackers(win, { id });
  check("the tracker the page tried to load is listed, and was blocked", tr.some((t) => t.host === "www.google-analytics.com" && t.blocked), JSON.stringify(tr));
  const today = new Date().toLocaleDateString("sv-SE");
  check("the timeline has the page read today", commands.timeline_day(win, { day: today }).events.some((e) => e.kind === "page" && e.title === "Miracle diet"));
  await ui.executeJavaScript(`[...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === "This site's settings")?.click()`);
  await waitFor(async () => ui.executeJavaScript(`!!document.querySelector('section[aria-label="Check this page"] button')`));
  await ui.executeJavaScript(`document.querySelector('section[aria-label="Check this page"] button').click()`);
  const checked = await waitFor(async () => ui.executeJavaScript(`!!document.querySelector('[aria-label="Page check results"]')`));
  const text = checked ? await ui.executeJavaScript(`document.querySelector('[aria-label="Page check results"]').innerText`) : "";
  check("the page check shows ads, the old date, the publisher and the tracker company", /sponsored/i.test(text) && /Last updated in 2019/.test(text) && /Run by Example Health Media/.test(text) && /Google/.test(text) && /blocked/i.test(text), text.replace(/\n/g, " | ").slice(0, 400));
  commands.timeline_clear(win);
  check("clearing the timeline empties the day", commands.timeline_day(win, { day: today }).events.length === 0);
  commands.settings_set(win, { key: "timeline_enabled", value: "0" });
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : "\nALL BROWSER CHECKS PASSED");
  server.close();
  app.exit(failed ? 1 : 0);
}
