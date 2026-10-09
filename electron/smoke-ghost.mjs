// QP_SMOKE_GHOST=1: type a query into the real address bar and capture GhostSearch's live results.
import fs from "node:fs";
import { app } from "electron";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function run({ browser }) {
  const win = browser.windows.get("main");
  const ui = win.ui.webContents;
  await sleep(2500);
  await ui.executeJavaScript(`document.querySelector('input[placeholder*="Search or enter"]').focus()`);
  await ui.insertText(process.env.QP_Q || "how to feed a sourdough starter");
  await sleep(300);
  for (const type of ["keyDown", "keyUp"]) ui.sendInputEvent({ type, keyCode: "Enter" });
  await sleep(9000);
  const t = [...win.tabs.values()][0];
  const wc = t.view.webContents;
  console.log("GHOST url", wc.getURL());
  console.log("GHOST title", wc.getTitle());
  console.log("GHOST meta", await wc.executeJavaScript("document.querySelector('.meta')?.textContent"));
  console.log("GHOST count", await wc.executeJavaScript("document.querySelectorAll('article.r').length"));
  console.log("GHOST first", await wc.executeJavaScript("[...document.querySelectorAll('article.r h3 a')].slice(0,5).map(a=>a.textContent+' -> '+a.href).join('\\n')"));
  console.log("GHOST cookies", JSON.stringify(await wc.session.cookies.get({})));
  console.log("GHOST uiState", await ui.executeJavaScript(`JSON.stringify({ tabs: [...document.querySelectorAll('[role=tab]')].map(t => t.textContent.trim()), address: document.querySelector('input[placeholder*="Search or enter"]')?.value })`));
  try { wc.debugger.attach("1.3"); } catch {}
  const { data } = await wc.debugger.sendCommand("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync("/tmp/qp-ghost.png", Buffer.from(data, "base64"));
  app.exit(0);
}
