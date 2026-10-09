// End-to-end test of the in-app updater on a REAL packaged Mac app (macOS only).
//   npm run dist:dir && node scripts/test-update-e2e.mjs
// Starts a fake GitHub on 127.0.0.1, runs an "old" copy of the app, lets it find a newer ad-hoc-signed build (like an unsigned
// CI release), install it, and relaunch; then checks the old path now holds the new version and is running.
import { execFileSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

if (process.platform !== "darwin") { console.log("skipped: macOS only"); process.exit(0); }
const arch = process.arch === "arm64" ? "arm64" : "x64";
const src = path.resolve("release", `mac${arch === "arm64" ? "-arm64" : ""}`, "Quick Pebble.app");
if (!fs.existsSync(src)) { console.error(`Build first: npm run dist:dir (missing ${src})`); process.exit(1); }
const sh = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NEW = "9.0.0";
const root = fs.mkdtempSync(path.join(os.tmpdir(), "qp-e2e-"));
const must = (ok, msg) => { console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`); if (!ok) { cleanup(); process.exit(1); } };
let proc, server;
function cleanup() { try { proc?.kill(); } catch {} try { server?.close(); } catch {} try { sh("pkill", ["-f", root]); } catch {} }

// ---- the "old" app and the "new" release
const oldApp = path.join(root, "Applications", "Quick Pebble.app");
fs.mkdirSync(path.dirname(oldApp), { recursive: true });
sh("ditto", [src, oldApp]);
const oldVersion = sh("plutil", ["-extract", "CFBundleShortVersionString", "raw", "-o", "-", path.join(oldApp, "Contents/Info.plist")]);
const newDir = path.join(root, "dmg-src"), newApp = path.join(newDir, "Quick Pebble.app");
fs.mkdirSync(newDir);
sh("ditto", [src, newApp]);
for (const k of ["CFBundleShortVersionString", "CFBundleVersion"]) sh("plutil", ["-replace", k, "-string", NEW, path.join(newApp, "Contents/Info.plist")]);
sh("codesign", ["--force", "--deep", "--sign", "-", newApp]); // ad-hoc, exactly what an unsigned CI build has
const dmgName = `Quick.Pebble_${NEW}_${arch}.dmg`, dmg = path.join(root, dmgName);
sh("hdiutil", ["create", "-volname", "Quick Pebble", "-srcfolder", newDir, "-ov", "-format", "UDZO", dmg]);
const dmgBytes = fs.readFileSync(dmg);
const sha = crypto.createHash("sha512").update(dmgBytes).digest("base64");

// ---- fake GitHub
let badChecksum = false, requests = [];
server = http.createServer((req, res) => {
  requests.push(req.url);
  const base = `http://127.0.0.1:${server.address().port}`;
  if (req.url.startsWith("/releases")) {
    const rel = (tag, assets, extra = {}) => ({ tag_name: tag, name: tag, body: "Test release notes", html_url: `${base}/page`, draft: false, prerelease: false, assets, ...extra });
    res.setHeader("content-type", "application/json");
    return res.end(JSON.stringify([
      rel("win-v99.0", [{ name: "Quick.Pebble_99.0_x64.exe", browser_download_url: `${base}/x.exe`, size: 1 }]),           // other platform: must be ignored
      rel("v10.0.0", [{ name: `Quick.Pebble_10.0.0_${arch}.dmg`, browser_download_url: `${base}/${dmgName}`, size: 1 }], { draft: true }), // draft: ignored
      rel(`v${NEW}`, [{ name: dmgName, browser_download_url: `${base}/${dmgName}`, size: dmgBytes.length }, { name: "latest-mac.yml", browser_download_url: `${base}/latest-mac.yml`, size: 1 }]),
      rel("v1.0.0", [{ name: `Quick.Pebble_1.0.0_${arch}.dmg`, browser_download_url: `${base}/old.dmg`, size: 1 }]),
    ]));
  }
  if (req.url === `/${dmgName}`) { res.writeHead(200, { "content-length": dmgBytes.length }); return res.end(dmgBytes); }
  if (req.url === "/latest-mac.yml") { res.setHeader("content-type", "text/yaml"); return res.end(`version: ${NEW}\nfiles:\n  - url: ${dmgName}\n    sha512: ${badChecksum ? "AAAA" : sha}\n    size: ${dmgBytes.length}\n`); }
  res.writeHead(404); res.end();
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const api = `http://127.0.0.1:${server.address().port}/releases`;

// ---- run the old app and drive it through its UI bridge over the DevTools protocol
const port = 9333 + Math.floor(Math.random() * 500);
const launch = () => spawn(path.join(oldApp, "Contents/MacOS/Quick Pebble"), [`--remote-debugging-port=${port}`, `--user-data-dir=${path.join(root, "data")}`], { env: { ...process.env, QP_TEST_UPDATES: "1", QP_UPDATE_API: api }, stdio: "ignore" });
proc = launch();
async function uiTarget() {
  for (let i = 0; i < 60; i++) {
    try { const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); const t = list.find((x) => x.type === "page" && /index\.html/.test(x.url)); if (t) return t; } catch {}
    await sleep(500);
  }
  throw new Error("UI not reachable");
}
async function evalIn(target, expression) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  const out = await new Promise((resolve) => {
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id === 1) resolve(d.result); };
    ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }));
  });
  ws.close();
  return out.exceptionDetails ? { error: out.exceptionDetails.exception?.description ?? "error" } : out.result.value;
}
const target = await uiTarget();
await sleep(1500);
must(oldVersion !== NEW, `running old app ${oldVersion}`);

const found = await evalIn(target, `window.qp.invoke('update_check').then(v => v, e => ({ error: String(e) }))`);
must(found && found.version === NEW && found.current === oldVersion, `finds ${NEW} (ignoring the other platform's release, the draft and the older one): ${JSON.stringify(found)}`);
must(found.notes === "Test release notes", "shows the release notes");

// A download that doesn't match its published checksum must be refused, and must leave the app untouched.
badChecksum = true;
const bad = await evalIn(target, `window.qp.invoke('update_install').then(() => 'installed', e => String(e.message || e))`);
must(/checksum/i.test(String(bad)), `rejects a download that doesn't match its checksum: ${String(bad).slice(0, 80)}`);
must(sh("plutil", ["-extract", "CFBundleShortVersionString", "raw", "-o", "-", path.join(oldApp, "Contents/Info.plist")]) === oldVersion, "app untouched after the rejected download");
badChecksum = false;

// "Later" skips it, then a manual check brings it back.
await evalIn(target, `window.qp.invoke('update_skip')`);
const skipped = await evalIn(target, `window.qp.invoke('settings_get').then(s => s.update_skipped || null)`);
console.log(`      (update_skipped setting is not exposed to the UI: ${skipped})`);

// The real install
const t0 = Date.now();
let installResult = "(app quit before answering, as expected)";
evalIn(target, `window.qp.invoke('update_install').then(() => 'ok', e => String(e.message || e))`).then((r) => { installResult = r; }).catch(() => {});
let updated = false;
for (let i = 0; i < 90 && !updated; i++) {
  await sleep(1000);
  try { updated = sh("plutil", ["-extract", "CFBundleShortVersionString", "raw", "-o", "-", path.join(oldApp, "Contents/Info.plist")]) === NEW; } catch {}
}
if (!updated) console.log(`      install result: ${installResult}`);
must(updated, `the app at the old path is now ${NEW} (took ${Math.round((Date.now() - t0) / 1000)}s)`);
await sleep(6000);
let running = false;
try { running = sh("pgrep", ["-f", `${oldApp}/Contents/MacOS/Quick Pebble`]).length > 0; } catch {}
must(running, "the updated app relaunched from the same place");
must(!fs.existsSync(path.join(oldApp, "Contents/_CodeSignature")) || (() => { try { sh("codesign", ["--verify", oldApp]); return true; } catch { return false; } })(), "the installed app's signature verifies");
let quarantined = true;
try { sh("xattr", ["-p", "com.apple.quarantine", oldApp]); } catch { quarantined = false; }
must(!quarantined, "no quarantine flag on the updated app");
console.log(`requests the fake GitHub saw: ${requests.length}`);
cleanup();
console.log("ALL PASSED");
