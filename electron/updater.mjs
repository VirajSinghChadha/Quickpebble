// In-app updates for builds that are NOT signed with a paid certificate, using the same protocol as the NotchApples app:
//
//  • Read this project's GitHub releases list (anonymous, nothing else is sent). Not /releases/latest: that returns whatever
//    was published last, which could be another platform's build. Scan the list and keep only releases that carry an
//    installer for THIS platform, so other platforms' releases can never stop this one from updating.
//  • A newer version is announced once (event + notification). "Later" skips that version until an even newer one appears.
//    Nothing is ever installed without a click.
//  • Update downloads the installer from github.com, verifies it (sha512 when the release publishes one; for the Mac app also
//    that it really is Quick Pebble at the expected version, with an intact code signature), stages a copy, and hands off to
//    a tiny script that swaps it in after this process quits, then relaunches.
import { app, Notification, powerMonitor, shell } from "electron";
import { execFile, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const REPO = "VirajSinghChadha/Quickpebble";
export const BUNDLE_ID = "app.quickpebble.browser";
const CHECK_EVERY_MS = 15 * 60_000, FIRST_CHECK_MS = 8_000;

// ---- pure helpers (unit-tested) -------------------------------------------------------------------------------------

/** "v2.0.1" / "2.0.1" -> "2.0.1"; null for tags that aren't a plain version (e.g. "win-v1.2"). */
export function versionFromTag(tag) {
  const m = /^v?(\d+(?:\.\d+){0,3})$/.exec(String(tag).trim());
  return m ? m[1] : null;
}
export function isNewer(a, b) {
  const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0, y = pb[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/** The installer asset for a platform, or null. Mac matches the CPU (arm64 / x64), because both ship in one release. */
export function pickAsset(assets, platform = process.platform, arch = process.arch) {
  const names = assets.map((a) => String(a.name ?? ""));
  const find = (pred) => assets.find((a, i) => pred(names[i]));
  if (platform === "darwin") return find((n) => n.endsWith(".dmg") && n.toLowerCase().includes(arch === "arm64" ? "arm64" : "x64")) ?? null;
  if (platform === "win32") return find((n) => n.endsWith(".exe") && !n.endsWith(".blockmap")) ?? null;
  return find((n) => n.endsWith(".AppImage")) ?? null;
}

/** One entry of the GitHub releases API, or null when it isn't an installable release for this platform. */
export function parseRelease(json, { platform = process.platform, arch = process.arch, allowHost = (h) => h === "github.com" } = {}) {
  if (!json || json.draft === true || json.prerelease === true) return null;
  const version = versionFromTag(json.tag_name);
  const assets = Array.isArray(json.assets) ? json.assets : [];
  const asset = pickAsset(assets, platform, arch);
  if (!version || !asset) return null;
  let url;
  try { url = new URL(asset.browser_download_url); } catch { return null; }
  if (!allowHost(url.hostname)) return null;
  const sums = assets.find((a) => /^latest(-mac|-linux)?\.yml$/.test(a.name ?? ""));
  return { version, title: json.name || `Quick Pebble ${version}`, notes: String(json.body ?? ""), page: json.html_url, assetName: asset.name, assetUrl: url.href, size: asset.size ?? null, checksumsUrl: sums?.browser_download_url ?? null };
}

/** electron-builder's latest*.yml lists every installer with its sha512 (base64). */
export function sha512For(yml, fileName) {
  const lines = String(yml).split("\n");
  for (let i = 0; i < lines.length; i++) {
    const u = /^\s*-?\s*url:\s*(.+?)\s*$/.exec(lines[i]);
    if (!u || decodeURIComponent(u[1].replace(/^["']|["']$/g, "")) !== fileName && u[1].replace(/^["']|["']$/g, "") !== fileName) continue;
    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) { const s = /^\s*sha512:\s*(\S+)\s*$/.exec(lines[j]); if (s) return s[1]; if (/url:/.test(lines[j])) break; }
  }
  return null;
}

/** Where the new app goes. Run from the DMG or a translocated copy, the old app can't be replaced: install into Applications. */
export function installTarget(currentBundle, appName = "Quick Pebble.app") {
  return currentBundle.includes("/AppTranslocation/") || currentBundle.startsWith("/Volumes/") ? path.join("/Applications", appName) : currentBundle;
}

// ---- the updater ---------------------------------------------------------------------------------------------------

const run = (cmd, args) => new Promise((resolve, reject) => execFile(cmd, args, { maxBuffer: 16 * 1024 * 1024 }, (e, out, err) => (e ? reject(new Error((String(err).trim().split("\n").pop() || e.message))) : resolve(String(out)))));

/** Like run(), but returns stdout and stderr together (codesign prints most of its report on stderr). */
const runAll = (cmd, args) => new Promise((resolve) => execFile(cmd, args, { maxBuffer: 16 * 1024 * 1024 }, (_e, out, err) => resolve(`${out}\n${err}`)));

export class Updater {
  constructor(db, emit) {
    this.db = db; this.emit = emit; // emit(channel, payload) to every window's UI
    this.latest = null; this.phase = "idle"; this.notified = null; this.timer = null;
    // Tests may point the updater at a local server; real builds only ever talk to api.github.com / github.com.
    this.testMode = process.env.QP_TEST_UPDATES === "1";
    this.api = (this.testMode && process.env.QP_UPDATE_API) || `https://api.github.com/repos/${REPO}/releases?per_page=20`;
    this.allowHost = (h) => h === "github.com" || (this.testMode && h === "127.0.0.1");
  }
  get current() { return process.env.QP_FAKE_VERSION && this.testMode ? process.env.QP_FAKE_VERSION : app.getVersion(); }
  get skipped() { return this.db.getSetting("update_skipped") ?? ""; }
  get autoCheck() { return this.db.getSetting("auto_update_check") !== "false"; }

  /** Starts the background checks: shortly after launch, every 15 minutes, and when the computer wakes. */
  start() {
    if (this.timer || (!app.isPackaged && !this.testMode)) return;
    setTimeout(() => this.check().catch(() => {}), FIRST_CHECK_MS).unref?.();
    this.timer = setInterval(() => this.check().catch(() => {}), CHECK_EVERY_MS);
    this.timer.unref?.();
    powerMonitor.on("resume", () => this.check().catch(() => {}));
  }

  async fetchLatest() {
    let r;
    try { r = await fetch(this.api, { headers: { accept: "application/vnd.github+json", "user-agent": "QuickPebble" }, signal: AbortSignal.timeout(20000) }); } catch { throw new Error("Couldn't reach GitHub to check for updates."); }
    if (!r.ok) throw new Error("Couldn't reach GitHub to check for updates.");
    const list = await r.json().catch(() => null);
    if (!Array.isArray(list)) throw new Error("GitHub sent an unexpected answer.");
    const releases = list.map((j) => parseRelease(j, { allowHost: this.allowHost })).filter(Boolean).sort((a, b) => (isNewer(a.version, b.version) ? -1 : 1));
    if (!releases[0]) throw new Error(`No release with a ${process.platform === "darwin" ? "Mac" : process.platform === "win32" ? "Windows" : "Linux"} download was found on GitHub.`);
    return releases[0];
  }

  /** The newest release if it's newer than this one and not skipped (a manual check un-skips). */
  async check({ userInitiated = false } = {}) {
    if (["downloading", "installing", "checking"].includes(this.phase)) return this.pending();
    this.phase = "checking";
    try {
      this.latest = await this.fetchLatest();
      if (userInitiated && this.latest.version === this.skipped) this.db.setSetting("update_skipped", "");
    } catch (e) {
      this.phase = "idle";
      if (userInitiated) throw e;
      return null;
    }
    this.phase = "idle";
    const info = this.pending();
    if (info && !userInitiated && this.autoCheck && this.notified !== info.version) {
      this.notified = info.version;
      this.emit("qp://update", info);
      try { if (Notification.isSupported()) new Notification({ title: "Quick Pebble update available", body: `Version ${info.version} is ready. Open Settings → Updates to install it.`, silent: true }).show(); } catch { /* notifications are optional */ }
    }
    return info;
  }

  pending() {
    const l = this.latest;
    if (!l || !isNewer(l.version, this.current) || l.version === this.skipped) return null;
    return { version: l.version, current: this.current, notes: l.notes };
  }

  /** "Later": stop announcing this version; a newer one, or "Check now", brings it back. */
  skip() { if (this.latest) this.db.setSetting("update_skipped", this.latest.version); }

  async download(release, onProgress) {
    const r = await fetch(release.assetUrl, { headers: { "user-agent": "QuickPebble" }, redirect: "follow" });
    if (!r.ok || !r.body) throw new Error("The download didn't finish. Try again.");
    const total = Number(r.headers.get("content-length")) || release.size || null;
    const dest = path.join(os.tmpdir(), `QuickPebble-${release.version}-${crypto.randomUUID()}-${release.assetName}`);
    const out = fs.createWriteStream(dest), hash = crypto.createHash("sha512");
    let downloaded = 0;
    try {
      for await (const chunk of r.body) {
        hash.update(chunk); downloaded += chunk.length;
        if (!out.write(chunk)) await new Promise((res) => out.once("drain", res));
        onProgress({ phase: "downloading", downloaded, total });
      }
      await new Promise((res, rej) => out.end((e) => (e ? rej(e) : res())));
    } catch (e) { out.destroy(); fs.rmSync(dest, { force: true }); throw new Error(`The download didn't finish (${e.message ?? e}). Try again.`); }
    // When the release publishes checksums, the file must match; a corrupted or swapped download never gets installed.
    if (release.checksumsUrl) {
      let yml = null;
      try { const c = await fetch(release.checksumsUrl, { headers: { "user-agent": "QuickPebble" }, signal: AbortSignal.timeout(15000) }); if (c.ok) yml = await c.text(); } catch { /* checksums are best effort */ }
      const want = yml && sha512For(yml, release.assetName);
      if (want && want !== hash.digest("base64")) { fs.rmSync(dest, { force: true }); throw new Error("The download doesn't match its published checksum, so it was discarded."); }
    }
    return dest;
  }

  async install(onProgress = () => {}) {
    if (["downloading", "installing"].includes(this.phase)) throw new Error("An update is already running.");
    const release = this.latest;
    if (!release || !isNewer(release.version, this.current)) throw new Error("Check for an update before installing.");
    this.phase = "downloading";
    try {
      const file = await this.download(release, onProgress);
      this.phase = "installing";
      onProgress({ phase: "installing", downloaded: 0, total: null });
      if (process.platform === "darwin") await this.installMac(file, release);
      else if (process.platform === "win32") await this.installWindows(file);
      else await this.installLinux(file, release);
    } catch (e) { this.phase = "idle"; throw e; }
  }

  async installMac(dmg, release) {
    const mount = fs.mkdtempSync(path.join(os.tmpdir(), "quickpebble-update-"));
    await run("/usr/bin/hdiutil", ["attach", dmg, "-nobrowse", "-noautoopen", "-readonly", "-mountpoint", mount]);
    try {
      const appName = fs.readdirSync(mount).find((n) => n.endsWith(".app"));
      if (!appName) throw new Error("The download doesn't contain the app.");
      const newApp = path.join(mount, appName);
      const plist = (key) => run("/usr/bin/plutil", ["-extract", key, "raw", "-o", "-", path.join(newApp, "Contents", "Info.plist")]).then((s) => s.trim());
      if ((await plist("CFBundleIdentifier")) !== BUNDLE_ID || (await plist("CFBundleShortVersionString")) !== release.version) throw new Error(`The downloaded app isn't the expected Quick Pebble ${release.version}.`);
      const staged = path.join(os.tmpdir(), `QuickPebble-staged-${crypto.randomUUID()}.app`);
      // --norsrc --noextattr: a plain copy off a disk image carries Finder metadata that makes the signature check reject a good app.
      await run("/usr/bin/ditto", ["--norsrc", "--noextattr", newApp, staged]);
      await run("/usr/bin/xattr", ["-cr", staged]).catch(() => {});
      // Intact signature (not tampered with in transit) and really Quick Pebble. Ad-hoc signatures count: the point is integrity, not identity.
      await run("/usr/bin/codesign", ["--verify", staged]);
      const report = await runAll("/usr/bin/codesign", ["-dv", "-r-", staged]);
      if (!report.includes(`Identifier=${BUNDLE_ID}`) && !report.includes(`identifier "${BUNDLE_ID}"`)) throw new Error("The downloaded app isn't signed as Quick Pebble.");
      const target = installTarget(path.resolve(process.execPath, "..", "..", ".."), appName);
      try { fs.accessSync(path.dirname(target), fs.constants.W_OK); } catch { throw new Error(`Can't write to ${path.dirname(target)}. Download the installer from GitHub instead.`); }
      const backup = path.join(os.tmpdir(), `QuickPebble-previous-${crypto.randomUUID()}.app`);
      // Wait for this process to quit, move the old copy aside, put the new one in, clear quarantine, relaunch.
      const script = `while kill -0 ${process.pid} 2>/dev/null; do sleep 0.2; done
[ -e "$1" ] && mv "$1" "$3"
mv "$2" "$1" && xattr -dr com.apple.quarantine "$1" 2>/dev/null
open "$1"`;
      spawn("/bin/sh", ["-c", script, "sh", target, staged, backup], { detached: true, stdio: "ignore" }).unref();
    } finally { run("/usr/bin/hdiutil", ["detach", mount, "-force"]).catch(() => {}); }
    this.quitSoon();
  }

  async installWindows(file) {
    // The NSIS installer upgrades in place and relaunches the app.
    spawn(file, [], { detached: true, stdio: "ignore" }).unref();
    this.quitSoon();
  }

  async installLinux(file, release) {
    const current = process.env.APPIMAGE;
    if (!current) { await shell.openExternal(release.page); throw new Error("This copy wasn't started from an AppImage, so I opened the release page to download the update."); }
    fs.chmodSync(file, 0o755);
    const script = `while kill -0 ${process.pid} 2>/dev/null; do sleep 0.2; done\nmv -f "$2" "$1" && "$1" &`;
    spawn("/bin/sh", ["-c", script, "sh", current, file], { detached: true, stdio: "ignore" }).unref();
    this.quitSoon();
  }

  quitSoon() { setTimeout(() => app.exit(0), 600); app.quit(); }
}
