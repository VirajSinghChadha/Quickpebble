// QP_SMOKE_UI=1: drives the real React UI (typing in the address bar) against a local site and checks the result.
import http from "node:http";
import fs from "node:fs";
import { app } from "electron";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function run({ browser, commands }) {
  const server = http.createServer((req, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(`<!doctype html><title>Typed in the bar</title><h1>Hello from ${req.url}</h1>`); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/hi`;
  const win = browser.windows.get("main");
  const ui = win.ui.webContents;
  for (let i = 0; i < 40 && !(await ui.executeJavaScript(`!!document.querySelector('input[placeholder*="Search or enter"]')`).catch(() => false)); i++) await sleep(250);
  await sleep(800);
  const state = () => ui.executeJavaScript(`JSON.stringify({ tabs: [...document.querySelectorAll('[role=tab]')].map(t => t.textContent.trim()), address: document.querySelector('input[aria-label="Address"], input[placeholder*="Search or enter"]')?.value })`);
  console.log("UI before", await state());
  await ui.executeJavaScript(`document.querySelector('input[placeholder*="Search or enter"]').focus()`);
  await ui.insertText(url);
  await sleep(300);
  for (const type of ["keyDown", "keyUp"]) ui.sendInputEvent({ type, keyCode: "Enter" });
  await sleep(3000);
  console.log("UI after", await state());
  const tabs = [...win.tabs.values()].map((t) => ({ url: t.url, title: t.title, hasView: !!t.view }));
  console.log("MAIN tabs", JSON.stringify(tabs));
  // new tab via UI shortcut path, then close it
  ui.sendInputEvent({ type: "keyDown", keyCode: "T", modifiers: ["meta"] });
  await sleep(800);
  console.log("MAIN tabs after cmd+T", win.tabs.size);
  for (const [n, w] of [["ui", ui]]) {
    try { w.debugger.attach("1.3"); } catch {}
    const { data } = await w.debugger.sendCommand("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(`/tmp/qp-${n}-driven.png`, Buffer.from(data, "base64"));
  }
  const active = [...win.tabs.values()].find((t) => t.url);
  if (active?.view) { try { active.view.webContents.debugger.attach("1.3"); } catch {} const { data } = await active.view.webContents.debugger.sendCommand("Page.captureScreenshot", { format: "png" }); fs.writeFileSync("/tmp/qp-page-driven.png", Buffer.from(data, "base64")); }
  server.close();
  app.exit(0);
}
