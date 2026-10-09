// QP_SMOKE_EXT=1: extensions (local zip + real Web Store) and the password vault end to end.
import http from "node:http";
import { app } from "electron";
import { zipSync, strToU8 } from "fflate";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (k, v) => console.log(`EXT ${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);

export async function run({ browser, commands, extensions }) {
  const win = browser.windows.get("main");
  const server = http.createServer((_q, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end("<!doctype html><title>ext page</title><p>hello</p>"); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/`;

  // ---- local extension with a content script
  const zip = zipSync({
    "manifest.json": strToU8(JSON.stringify({ manifest_version: 3, name: "Demo Marker", version: "1.0", content_scripts: [{ matches: ["http://127.0.0.1/*"], js: ["c.js"], run_at: "document_end" }] })),
    "c.js": strToU8("document.documentElement.setAttribute('data-demo-ext','active')"),
    "../evil.txt": strToU8("traversal"),
  });
  const info = extensions.installBytes(Buffer.from(zip), null, "test.zip");
  log("installed", { id: info.id, enabled: info.enabled, warnings: info.warnings });
  log("listed", commands.extension_list(win).map((e) => e.id));
  commands.tab_create(win, { id: "a" });
  commands.tab_navigate(win, { id: "a", input: url });
  await sleep(2000);
  const wc = () => win.tabs.get("a").view.webContents;
  log("markerWhileOff", await wc().executeJavaScript("document.documentElement.getAttribute('data-demo-ext')"));
  await commands.extension_set_enabled(win, { id: info.id, enabled: true });
  commands.tab_navigate(win, { id: "a", input: url });
  await sleep(2500);
  log("markerWhileOn", await wc().executeJavaScript("document.documentElement.getAttribute('data-demo-ext')"));
  await commands.extension_set_enabled(win, { id: info.id, enabled: false });
  commands.tab_navigate(win, { id: "a", input: url });
  await sleep(2000);
  log("markerAfterOff", await wc().executeJavaScript("document.documentElement.getAttribute('data-demo-ext')"));
  commands.extension_remove(win, { id: info.id });
  log("afterRemove", commands.extension_list(win).length);

  // ---- real Web Store download (Dark Reader)
  try {
    const dr = await commands.extension_install_store(win, { input: "https://chromewebstore.google.com/detail/dark-reader/eimadpbcbfnmbkopoojfekhnkhdbieeh" });
    log("storeInstall", { id: dr.id, name: dr.name, version: dr.version, warnings: dr.warnings });
    await commands.extension_set_enabled(win, { id: dr.id, enabled: true });
    log("storeEnabled", "ok");
    commands.extension_remove(win, { id: dr.id });
  } catch (e) { log("storeInstall", `FAILED ${e.message ?? e}`); }

  // ---- vault
  const v = (c, a = {}) => commands[c](win, a);
  log("vaultStatus", v("vault_status"));
  try { await v("vault_create", { master: "short" }); } catch (e) { log("shortMasterRejected", e.message); }
  await v("vault_create", { master: "correct horse battery" });
  const id = v("vault_save", { host: "WWW.Example.com", username: "me@x.com", password: "s3cret!pw" });
  log("saved", { id, list: v("vault_list", {}), reveal: v("vault_reveal", { id }) });
  v("vault_lock");
  try { v("vault_list", {}); log("lockedList", "LEAK"); } catch (e) { log("lockedList", e.message); }
  try { await v("vault_unlock", { master: "wrong password!" }); } catch (e) { log("wrongMaster", e.message); }
  await v("vault_unlock", { master: "correct horse battery" });
  log("unlocked", v("vault_status"));
  try { v("vault_fill", { tabId: "a", id }); } catch (e) { log("fillOnWrongSite", e.message); }
  // pending-save flow: a page reports a login on an https tab
  const t = win.tabs.get("a"); const realUrl = t.url; t.url = "https://example.com/login";
  browser.pageCommand(t.view.webContents.id, "qp_login_seen", { username: "new@x.com", password: "pw-from-page" });
  t.url = realUrl;
  const saved = v("vault_save_pending", { tabId: "a" });
  log("pendingSaved", v("vault_reveal", { id: saved }));
  server.close();
  app.exit(0);
}
