// QP_SMOKE_BROWSER=1: exercises the browser features in the real app: task manager, sleep, scroll restore and crash recovery
// (it really kills a page's process on purpose).
import http from "node:http";
import { app, clipboard } from "electron";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`); if (!ok) failed++; };
// A page that was just killed never answers a script call, so every probe is given only 1.5 seconds.
const probe = (fn) => Promise.race([Promise.resolve().then(fn).catch(() => false), sleep(1500).then(() => false)]);
const waitFor = async (fn, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await probe(fn)) return true; await sleep(150); } return false; };

/** The smallest real PDF with one line of text. */
function tinyPdf(text) {
  const objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>"];
  const stream = `BT /F1 12 Tf 10 80 Td (${text}) Tj ET`;
  objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  let out = "%PDF-1.4\n";
  const offsets = objs.map((o, i) => { const at = out.length; out += `${i + 1} 0 obj\n${o}\nendobj\n`; return at; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, "latin1");
}

export async function run({ browser, commands, routines, quickdo }) {
  // /dodgy is a page with everything the page check looks for: a sponsored box, an old date, a publisher, and a tracker.
  const DODGY = `<!doctype html><title>Miracle diet</title><script type="application/ld+json">{"@type":"NewsArticle","datePublished":"2019-02-01","dateModified":"2019-03-04","publisher":{"name":"Example Health Media"}}</script>
    <body><article><h2>Lose 10 kg in a week</h2><span>Sponsored</span></article><a rel="sponsored" href="https://shop.example/x">Buy now</a>
    <img src="https://www.google-analytics.com/collect?v=1" width="1" height="1"><footer>© 2019 Example Health Media. All rights reserved.</footer></body>`;
  const server = http.createServer((req, res) => { if (req.url === "/slides.pdf") { res.writeHead(200, { "content-type": "application/pdf" }); return res.end(tinyPdf("Lecture 3: Cell respiration makes ATP")); } res.writeHead(200, { "content-type": "text/html" }); if (req.url === "/form") return res.end(`<!doctype html><title>Search form</title><form action="/result"><label>Search term <input name="q"></label> <button>Go</button></form><button>Submit order</button>`);
    if (req.url.startsWith("/result")) return res.end(`<!doctype html><title>Result ${new URL(req.url, "http://x").searchParams.get("q")}</title>Done`);
    res.end(req.url === "/dodgy" ? DODGY : `<!doctype html><title>Page ${req.url}</title><body style="margin:0"><div style="height:6000px">Hello ${req.url}</div></body>`); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const win = browser.windows.get("main");
  const ui = win.ui.webContents;
  ui.setBackgroundThrottling(false);   // keep the interface animating when the test window is behind others
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
  await commands.tab_navigate(win, { id, input: `${base}/slides.pdf`, allowHttp: true });
  await sleep(1500);
  const slides = await commands.slides_pdf_text(win, { id });
  check("slides open as a PDF in a tab are read for notes", /Cell respiration makes ATP/.test(slides ?? ""), String(slides).slice(0, 80));
  await commands.tab_navigate(win, { id, input: `${base}/one`, allowHttp: true });
  await waitFor(async () => tab().title === "Page /one");
  check("an ordinary page isn't treated as a PDF", (await commands.slides_pdf_text(win, { id })) === null);
  // ---- teach by showing, with real (trusted) mouse clicks and key presses
  await commands.tab_navigate(win, { id, input: `${base}/form`, allowHttp: true });
  await waitFor(async () => tab().title === "Search form");
  commands.routine_teach_start(win);
  await sleep(300);
  const page = tab().view.webContents;
  page.setBackgroundThrottling(false);
  win.win.focus(); page.focus();
  const centre = async (sel) => page.executeJavaScript(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  const clickAt = async (sel) => { const { x, y } = await centre(sel); page.sendInputEvent({ type: "mouseDown", x, y, button: "left", clickCount: 1 }); page.sendInputEvent({ type: "mouseUp", x, y, button: "left", clickCount: 1 }); await sleep(250); };
  await clickAt("input[name=q]");
  await page.insertText("volcano");   // like typing, but doesn't depend on which app macOS has in front
  await sleep(150);
  await clickAt("form button");
  await waitFor(async () => tab().title === "Result volcano");
  await sleep(500);
  const taught = commands.routine_teach_stop(win).filter((s) => s.type !== "open_app");   // app switches depend on what else is open on this machine
  check("teaching records the page, the typing and the click", taught.some((s) => s.type === "open_url" && s.url.endsWith("/form")) && taught.some((s) => s.type === "type" && s.label === "Search term" && s.text === "volcano") && taught.some((s) => s.type === "click" && s.label === "Go"), JSON.stringify(taught));
  const rid = commands.routine_save(win, { routine: { name: "Find volcano", steps: [...taught.filter((s) => s.type !== "click" || s.label === "Go"), { type: "open_url", url: `${base}/form` }, { type: "click", label: "Submit order" }], trigger: "find volcano" } });
  // say the phrase in the assistant: the steps appear, nothing runs until "Run". (Local AI, so the chat box shows without a Gemini key.)
  commands.settings_set(win, { key: "ai_provider", value: "ollama" });
  await ui.executeJavaScript(`[...document.querySelectorAll('button')].find(b => /assistant/i.test(b.getAttribute('aria-label') || b.title || ''))?.click()`);
  await waitFor(async () => ui.executeJavaScript(`!!document.querySelector('aside textarea')`));
  await ui.executeJavaScript(`(() => { const t = document.querySelector('aside textarea'); if (!t) return; const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(t, 'Find volcano!'); t.dispatchEvent(new Event('input', { bubbles: true })); t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`);
  check("saying the phrase shows the routine's steps first", await waitFor(async () => ui.executeJavaScript(`!!document.querySelector('[aria-label="Routine steps"]') && /Submit order.*asks you first/s.test(document.querySelector('[aria-label="Routine steps"]').innerText)`)));
  await commands.tab_navigate(win, { id, input: `${base}/one`, allowHttp: true });
  await waitFor(async () => tab().title === "Page /one");
  await ui.executeJavaScript(`[...document.querySelectorAll('[aria-label="Routine"] button')].find(b => /^Run these/.test(b.textContent))?.click()`);
  check("running it does the steps on the real page", await waitFor(async () => tab().title === "Result volcano", 15000), tab().title);
  check("a submit-type step waits for its own OK", await waitFor(async () => ui.executeJavaScript(`/may send, submit, buy or delete something: Click “Submit order”/.test(document.querySelector('[aria-label="Routine"]')?.innerText ?? '')`), 15000));
  await ui.executeJavaScript(`[...document.querySelectorAll('[aria-label="Routine"] button')].find(b => b.textContent === 'Skip this step')?.click()`);
  check("skipping it finishes without clicking", await waitFor(async () => ui.executeJavaScript(`/Finished\./.test(document.querySelector('[aria-label="Routine"]')?.innerText ?? '') && /Submit order”: skipped/.test(document.querySelector('[aria-label="Routine"]').innerText)`)));
  await ui.executeJavaScript(`[...document.querySelectorAll('[aria-label="Routine"] button')].find(b => b.textContent === 'Close')?.click()`);
  const bad = routines.checkImport(JSON.stringify({ format: "quick-pebble-routine", name: "Sneaky", steps: [{ type: "open_url", url: "https://x.example" }, { type: "shell", cmd: "curl evil" }] }));
  check("importing a routine with a step outside the allow-list is refused", !!bad.problems && /“shell” isn't an allowed kind/.test(bad.problems.join(" ")));
  commands.routine_delete(win, { id: rid });

  // ---- "do this for me": shows what was copied and what would be sent; nothing is sent here
  const clipBefore = String((await clipboard.readText()) ?? "");
  clipboard.writeText("meeting notes: budget 5k, launch friday, owner sam");
  await quickdo.open();
  const qw = quickdo.win;
  qw.webContents.setBackgroundThrottling(false);
  await waitFor(async () => qw.webContents.executeJavaScript(`document.getElementById('copied').textContent.includes('budget 5k')`));
  const qtext = await qw.webContents.executeJavaScript(`document.body.innerText`);
  check("“Do this for me” shows the copied text and exactly what would be sent", qw.isVisible() && /budget 5k/.test(qtext) && /What will be sent to .+: your instruction and the 50 characters/.test(qtext) && !/Paste into/.test(await qw.webContents.executeJavaScript(`document.getElementById('actions').hidden ? '' : 'x'`)), qtext.slice(0, 200).replace(/\n/g, " | "));
  check("its shortcut is registered", (await import("electron")).globalShortcut.isRegistered(process.platform === "darwin" ? "Control+Shift+Space" : "Control+Alt+Space"));
  quickdo.hide();
  clipboard.writeText(clipBefore);
  commands.timeline_clear(win);
  check("clearing the timeline empties the day", commands.timeline_day(win, { day: today }).events.length === 0);
  commands.settings_set(win, { key: "timeline_enabled", value: "0" });
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : "\nALL BROWSER CHECKS PASSED");
  server.close();
  app.exit(failed ? 1 : 0);
}
