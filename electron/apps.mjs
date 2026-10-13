// Installed apps (macOS): when each was last opened, how big it is, the files it leaves behind in the Library, and installers in
// Downloads/Desktop for apps that are already installed. Read-only: removing anything goes through the dry-run list.
import { execFile } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DAY = 86400_000;
const run = (cmd, args, timeout = 15000) => new Promise((resolve) => execFile(cmd, args, { timeout, maxBuffer: 16 * 1024 * 1024 }, (err, out) => resolve(err ? "" : String(out))));

/** "Visual Studio Code" / "visual-studio-code-1.93.0-arm64.dmg" → "visualstudiocode": compare names without versions and noise. */
export function normalizeName(s) {
  return String(s).toLowerCase()
    .replace(/\.(app|dmg|pkg|mpkg|zip|exe|msi)$/i, "")
    .replace(/[-_ ]?(v?\d+([._]\d+)*)([-_ ]?(beta|rc|alpha)\d*)?/g, " ")
    .replace(/\b(setup|installer|install|darwin|macos|mac|osx|universal|arm64|aarch64|x64|x86_64|intel|apple ?silicon|latest|release|stable)\b/g, " ")
    .replace(/[^a-z0-9]/g, "");
}

/** Is this file an installer for one of these installed apps? Returns the app name or null. */
export function installerFor(fileName, appNames) {
  if (!/\.(dmg|pkg|mpkg)$/i.test(fileName) && !/(setup|install).*\.zip$/i.test(fileName)) return null;
  const n = normalizeName(fileName);
  if (n.length < 3) return null;
  let best = null;
  for (const a of appNames) {
    const k = normalizeName(a);
    if (k.length < 3) continue;
    if (n === k || (n.startsWith(k) && k.length >= 4) || (k.startsWith(n) && n.length >= 5)) { if (!best || k.length > normalizeName(best).length) best = a; }
  }
  return best;
}

/** Where an app's leftovers live in the person's Library, by bundle id and by name. Only existing paths are returned. */
export function leftoverCandidates(home, bundleId, appName) {
  const L = path.join(home, "Library");
  const out = [];
  if (bundleId && /^[A-Za-z0-9.-]{3,200}$/.test(bundleId)) {
    for (const sub of ["Application Support", "Caches", "Containers", "HTTPStorages", "WebKit", "Logs", "Saved Application State", "Application Scripts"]) {
      out.push(path.join(L, sub, sub === "Saved Application State" ? `${bundleId}.savedState` : bundleId));
    }
    out.push(path.join(L, "Preferences", `${bundleId}.plist`), path.join(L, "Cookies", `${bundleId}.binarycookies`), path.join(L, "LaunchAgents", `${bundleId}.plist`));
  }
  if (appName && /^[\p{L}\p{N}][\p{L}\p{N} .&+()'_-]{1,79}$/u.test(appName)) {
    for (const sub of ["Application Support", "Caches", "Logs"]) out.push(path.join(L, sub, appName));
  }
  return [...new Set(out)];
}

export const LEFTOVER_ROOTS = (home) => ["Application Support", "Caches", "Containers", "HTTPStorages", "WebKit", "Logs", "Saved Application State", "Application Scripts", "Preferences", "Cookies", "LaunchAgents"].map((s) => path.join(home, "Library", s));

/** Apps that must never be offered for removal: Apple's own, and this app. */
export const isProtectedApp = (bundleId, name) => /^com\.apple\./i.test(bundleId ?? "") || /^app\.quickpebble\./i.test(bundleId ?? "") || /^quick pebble$/i.test(name ?? "");

/** Reads what Spotlight knows about an app: bundle id and when it was last opened. */
async function appInfo(appPath) {
  const out = await run("mdls", ["-name", "kMDItemCFBundleIdentifier", "-name", "kMDItemLastUsedDate", "-name", "kMDItemDisplayName", appPath]);
  const get = (k) => (out.match(new RegExp(`${k}\\s*=\\s*"?([^"\\n]*)"?`)) ?? [])[1];
  const used = get("kMDItemLastUsedDate");
  const lastUsed = used && used !== "(null)" ? Date.parse(used.replace(" +0000", "Z").replace(" ", "T")) : NaN;
  return { bundleId: get("kMDItemCFBundleIdentifier") ?? "", lastUsed: Number.isFinite(lastUsed) ? lastUsed : null };
}

/** Size of a folder in bytes, using du (much faster than walking app bundles in JavaScript). */
export async function duBytes(p) {
  const out = await run("du", ["-sk", p], 60000);
  const kb = Number(out.split(/\s/)[0]);
  return Number.isFinite(kb) ? kb * 1024 : null;
}

/** Installed apps in /Applications and ~/Applications, with last-opened time and size. macOS only. */
export async function installedApps({ home = os.homedir(), withSize = true } = {}) {
  if (process.platform !== "darwin") return [];
  const dirs = ["/Applications", path.join(home, "Applications")];
  const apps = [];
  for (const d of dirs) {
    let names = [];
    try { names = (await fsp.readdir(d)).filter((n) => n.endsWith(".app")); } catch { continue; }
    for (const n of names) apps.push({ name: n.replace(/\.app$/, ""), path: path.join(d, n) });
  }
  const out = [];
  for (const a of apps.slice(0, 400)) {
    const info = await appInfo(a.path);
    out.push({ ...a, ...info, size: withSize ? await duBytes(a.path) : null, protected: isProtectedApp(info.bundleId, a.name) });
  }
  return out;
}

/** Apps not opened for `days` days (or never, by Spotlight's record), biggest first. */
export function forgottenApps(apps, days, now = Date.now()) {
  return apps.filter((a) => !a.protected && (a.lastUsed == null || now - a.lastUsed >= days * DAY)).sort((a, b) => (b.size ?? 0) - (a.size ?? 0));
}

export const existing = (paths) => paths.filter((p) => { try { fs.lstatSync(p); return true; } catch { return false; } });

/** Paths of running apps (so an app that is open is never removed while it runs). */
export async function runningAppPaths() {
  const out = await run("ps", ["-axo", "comm="]);
  return new Set(out.split("\n").map((l) => (l.match(/^(.*?\.app)\//) ?? [])[1]).filter(Boolean));
}
