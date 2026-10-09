// QP_SMOKE_WEB=1: load real sites, report what they see, and screenshot them.
import fs from "node:fs";
import { app } from "electron";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function run({ browser, commands }) {
  const win = browser.windows.get("main");
  await sleep(1000);
  const sites = (process.env.QP_SMOKE_SITES || "https://www.google.com/search?q=sourdough+starter").split(",");
  let n = 0;
  for (const url of sites) {
    const id = `w${n++}`;
    commands.tab_create(win, { id });
    commands.tab_navigate(win, { id, input: url });
    await sleep(6000);
    const wc = win.tabs.get(id).view.webContents;
    console.log("WEB", url, "->", wc.getURL(), "|", wc.getTitle());
    await wc.executeJavaScript("1").catch(() => {});
    try { wc.debugger.attach("1.3"); } catch {}
    const { data } = await wc.debugger.sendCommand("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(`/tmp/qp-web-${n}.png`, Buffer.from(data, "base64"));
  }
  app.exit(0);
}
