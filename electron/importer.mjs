// Import from Chrome and Safari on this Mac: history, bookmarks, open tabs and (Chrome) extensions.
// Everything is read locally. Browser databases are copied to a temp file first because the other browser may be running.
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { parseChromeJson } from "./bookmarks.mjs";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
const LIMIT = 5000;
const WEBKIT_EPOCH = 11644473600;   // seconds between 1601 and 1970 (Chrome)
const COCOA_EPOCH = 978307200;      // seconds between 1970 and 2001 (Safari)

/** Chrome stores microseconds since 1601; the query divides to whole seconds first because the raw value is too big for a JS number. */
export const chromeTime = (secs1601) => Math.max(0, Math.floor(Number(secs1601) - WEBKIT_EPOCH));
export const safariTime = (secs) => Math.max(0, Math.floor(Number(secs) + COCOA_EPOCH));
export const isWebUrl = (u) => /^https?:\/\//i.test(String(u));
const web = (rows) => rows.filter((r) => isWebUrl(r.url)).slice(0, LIMIT);

const chromeDir = () => path.join(os.homedir(), "Library/Application Support/Google/Chrome/Default");
const safariDir = () => path.join(os.homedir(), "Library/Safari");

/** Copy a (possibly locked) SQLite file and its WAL beside it, open it read-only-ish, run the query, clean up. */
function readDb(file, sql) {
  if (!fs.existsSync(file)) throw new Error("not-found");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "qp-import-"));
  try {
    const copy = path.join(tmp, "db");
    try { fs.copyFileSync(file, copy); } catch (e) { throw new Error(e?.code === "EPERM" || e?.code === "EACCES" ? "no-access" : "not-found"); }
    for (const x of ["-wal", "-shm"]) { try { fs.copyFileSync(file + x, copy + x); } catch { /* none */ } }
    const db = new DatabaseSync(copy);
    try { return db.prepare(sql).all(); } finally { db.close(); }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

const osa = (script) => new Promise((resolve) => execFile("osascript", ["-e", script], { timeout: 15000 }, (err, out) => resolve(err ? null : String(out))));
const running = (name) => new Promise((resolve) => execFile("pgrep", ["-x", name], (err) => resolve(!err)));

/** Open tab URLs from a running browser, via AppleScript. macOS asks the person once for permission. */
export async function openTabs(browser) {
  const app = browser === "chrome" ? "Google Chrome" : "Safari";
  if (!(await running(app))) return [];
  const script = browser === "chrome"
    ? `tell application "Google Chrome" to get URL of every tab of every window`
    : `tell application "Safari" to get URL of every tab of every window`;
  const out = await osa(script);
  return out ? [...new Set(out.split(/,\s*(?=https?:)/).map((s) => s.trim()).filter(isWebUrl))].slice(0, 200) : [];
}

export function history(browser) {
  if (browser === "chrome") {
    return web(readDb(path.join(chromeDir(), "History"), "SELECT url, title, visit_count AS n, last_visit_time / 1000000 AS t FROM urls WHERE hidden = 0 ORDER BY last_visit_time DESC LIMIT 6000")
      .map((r) => ({ url: r.url, title: r.title ?? "", visits: Number(r.n) || 1, at: chromeTime(r.t) })));
  }
  return web(readDb(path.join(safariDir(), "History.db"), "SELECT i.url AS url, v.title AS title, i.visit_count AS n, MAX(v.visit_time) AS t FROM history_items i JOIN history_visits v ON v.history_item = i.id GROUP BY i.id ORDER BY t DESC LIMIT 6000")
    .map((r) => ({ url: r.url, title: r.title ?? "", visits: Number(r.n) || 1, at: safariTime(r.t) })));
}

/** Safari's Bookmarks.plist is a binary plist; plutil turns it into JSON. */
export function safariBookmarks() {
  return new Promise((resolve, reject) => {
    const f = path.join(safariDir(), "Bookmarks.plist");
    if (!fs.existsSync(f)) return reject(new Error("not-found"));
    execFile("plutil", ["-convert", "json", "-o", "-", f], { maxBuffer: 50_000_000 }, (err, out) => {
      if (err) return reject(new Error(/Operation not permitted/i.test(String(err.message)) ? "no-access" : "not-found"));
      try { resolve(walkSafari(JSON.parse(out))); } catch { reject(new Error("not-found")); }
    });
  });
}
export function walkSafari(node, folder = "") {
  const out = [];
  for (const c of node?.Children ?? []) {
    if (c.WebBookmarkType === "WebBookmarkTypeLeaf" && isWebUrl(c.URLString)) out.push({ url: c.URLString, title: c.URIDictionary?.title ?? c.URLString, folder });
    else if (c.WebBookmarkType === "WebBookmarkTypeList" && c.Title !== "com.apple.ReadingList") out.push(...walkSafari(c, [folder, c.Title].filter(Boolean).join("/")));
  }
  return out.slice(0, LIMIT);
}

export function chromeBookmarks() {
  const f = path.join(chromeDir(), "Bookmarks");
  if (!fs.existsSync(f)) throw new Error("not-found");
  return parseChromeJson(fs.readFileSync(f, "utf8")).slice(0, LIMIT);
}

/** Installed Chrome extensions: id and a readable name where the manifest has one. */
export function chromeExtensions() {
  const root = path.join(chromeDir(), "Extensions");
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const id of fs.readdirSync(root)) {
    if (!/^[a-p]{32}$/.test(id)) continue;
    const versions = fs.readdirSync(path.join(root, id)).sort();
    const dir = path.join(root, id, versions[versions.length - 1] ?? "");
    try {
      const m = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
      out.push({ id, name: resolveName(m.name, dir, m.default_locale) });
    } catch { out.push({ id, name: id }); }
  }
  return out;
}
function resolveName(name, dir, locale) {
  const m = /^__MSG_(.+)__$/.exec(String(name ?? ""));
  if (!m) return String(name || "Extension");
  try { return JSON.parse(fs.readFileSync(path.join(dir, "_locales", locale || "en", "messages.json"), "utf8"))[m[1]]?.message ?? m[1]; } catch { return m[1]; }
}

/** Plain-language reason for a failed read, so the screen can tell the person what to do. */
export const explain = (browser, e) => String(e?.message) === "no-access"
  ? `macOS is blocking access to ${browser === "safari" ? "Safari's" : "Chrome's"} files. Open System Settings → Privacy & Security → Full Disk Access, turn on Quick Pebble, then try again.`
  : String(e?.message) === "not-found" ? `${browser === "safari" ? "Safari" : "Chrome"} data was not found on this computer.`
  : `Could not read ${browser === "safari" ? "Safari" : "Chrome"} data (${String(e?.message).slice(0, 100)}).`;
