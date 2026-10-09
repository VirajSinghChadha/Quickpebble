// Headless end-to-end check, run with QP_SMOKE=1. Starts a local site, drives the real commands, prints results.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { stats } from "./adblock.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (k, v) => console.log(`SMOKE ${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);

export async function run({ browser, commands, db }) {
  const hits = [];
  const server = http.createServer((req, res) => {
    hits.push(req.url);
    if (req.url.startsWith("/ads/")) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end("window.adLoaded=true"); }
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<!doctype html><title>Pebble test page</title><script>window.__seenQp = typeof window.__qpPage; window.__atHead = !!window.__qp;</script>
      <h1>Sourdough starter guide</h1><p>${"How to feed a sourdough starter every single day with flour and water. ".repeat(12)}</p>
      <a href="/next">next</a><button id=b>Click me</button><input id=i placeholder="Type here">
      <script src="http://ads.doubleclick.net/x.js"></script><script src="/ads/banner.js"></script>`);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const win = browser.windows.get("main");
  await sleep(1500);

  db.setSetting("recall_enabled", "true");
  commands.tab_create(win, { id: "t1" });
  // 127.0.0.1 is "local", so recall would skip it; check indexing separately below.
  commands.tab_navigate(win, { id: "t1", input: `${base}/` });
  await sleep(2500);
  const t = win.tabs.get("t1");
  log("tab", { url: t.url, title: t.title, loading: t.loading, textLen: t.text.length });
  const wc = t.view.webContents;
  log("ua", await wc.executeJavaScript("navigator.userAgent"));
  log("userAgentHasElectron", /Electron/.test(await wc.executeJavaScript("navigator.userAgent")));
  log("injectedAtHead", await wc.executeJavaScript("window.__atHead"));
  log("bridgeExposed", await wc.executeJavaScript("window.__seenQp"));
  log("pageCannotCallOtherCommands", await wc.executeJavaScript("window.__qpPage.invoke('settings_get',{}).then(()=> 'LEAK', e=>'blocked')"));
  const snap = await commands.agent_exec(win, { tabId: "t1", op: "snapshot", args: {} });
  log("agentSnapshot", { elements: snap.elements.length, labels: snap.elements.map((e) => e.label) });
  await commands.agent_exec(win, { tabId: "t1", op: "type", args: { i: snap.elements.findIndex((e) => e.tag === "input"), text: "hello" } });
  log("typed", await wc.executeJavaScript("document.getElementById('i').value"));
  log("blockedTrackerAndAdPath", { adLoaded: await wc.executeJavaScript("!!window.adLoaded"), requests: hits });
  log("blockedCounter", stats.blocked);
  log("trackerNavBlocked", (() => { try { commands.tab_navigate(win, { id: "t1", input: "https://ads.doubleclick.net/" }); return "navigated"; } catch (e) { return String(e); } })());
  await sleep(300);
  commands.tab_navigate(win, { id: "t1", input: `${base}/` });
  await sleep(1500);

  commands.tab_zoom(win, { id: "t1", action: "in" });
  log("zoom", wc.getZoomFactor());
  commands.tab_set_muted(win, { id: "t1", muted: true });
  log("muted", wc.audioMuted);

  // Memory saver: suspend then revive
  browser.destroyView(win, t); t.suspended = true;
  commands.tab_activate(win, { id: "t1" });
  await sleep(1500);
  log("revived", { hasView: !!t.view, suspended: t.suspended, title: t.title });

  // Recall via a public-looking host name is not reachable offline, so index directly then query through the command
  const { remember } = await import("./recall.mjs");
  remember(db, "https://example.com/bread", "Bread", "sourdough starter feeding guide ".repeat(30));
  log("recall", commands.recall_search(win, { query: "what was that sourdough article", limit: 3 }).map((r) => r.url));

  commands.sidebar_set(win, { width: 380 });
  commands.profile_create(win, { name: "Work", color: "#ff0000" });
  log("profiles", commands.profile_list(win));
  log("suggest", commands.suggest(win, { query: "Pebble" }));

  await sleep(800);
  const out = process.env.QP_SMOKE_SHOT || path.join(app.getPath("temp"), "qp-ui.png");
  const grab = async (wc, file) => {
    try { wc.debugger.attach("1.3"); } catch { /* already attached */ }
    const { data } = await wc.debugger.sendCommand("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(file, Buffer.from(data, "base64"));
  };
  await grab(win.ui.webContents, out);
  await grab(t.view.webContents, out.replace(/\.png$/, "-page.png"));
  log("screenshots", out);
  server.close();
  app.exit(0);
}
