// Chrome extensions on the real Chromium extension runtime (content scripts, MV2/MV3 background workers, chrome.storage,
// chrome.runtime, scripting, alarms …). Install from the Chrome Web Store or a .crx file. Extensions start OFF.
// Electron has no toolbar popups or webRequest API, so installs carry explicit warnings for those.
import { app, dialog } from "electron";
import fs from "node:fs";
import path from "node:path";
import { unzipSync } from "fflate";

const MAX_CRX = 60 * 1024 * 1024, MAX_UNPACKED = 100 * 1024 * 1024, MAX_FILES = 3000;
export const validId = (id) => typeof id === "string" && /^[a-z0-9_-]{1,80}$/.test(id);
const isStoreId = (s) => /^[a-p]{32}$/.test(s);

/** Accepts a bare id or a Chrome Web Store URL and returns the extension id. */
export function storeIdFromInput(input) {
  const s = String(input).trim();
  if (isStoreId(s)) return s;
  let u; try { u = new URL(s); } catch { return null; }
  if (u.hostname !== "chromewebstore.google.com" && !(u.hostname === "chrome.google.com" && u.pathname.startsWith("/webstore"))) return null;
  return u.pathname.split("/").find(isStoreId) ?? null;
}

/** Strips the CRX header and returns the embedded ZIP bytes (plain ZIPs pass through). */
export function crxZipBytes(data) {
  data = Buffer.from(data);
  if (data.subarray(0, 2).toString() === "PK") return data;
  if (data.length < 16 || data.subarray(0, 4).toString() !== "Cr24") throw new Error("Not a Chrome extension (.crx) file");
  const v = data.readUInt32LE(4);
  const start = v === 3 ? 12 + data.readUInt32LE(8) : v === 2 ? 16 + data.readUInt32LE(8) + data.readUInt32LE(12) : null;
  if (start == null) throw new Error(`Unsupported CRX version ${v}`);
  if (start >= data.length) throw new Error("Corrupt CRX header");
  return data.subarray(start);
}

/** Unpacks into dest, refusing absolute paths, `..`, and archives that are too big once expanded. */
export function unpack(zipBytes, dest) {
  let files;
  try { files = unzipSync(new Uint8Array(zipBytes)); } catch (e) { throw new Error(`Bad archive: ${e.message ?? e}`); }
  const names = Object.keys(files);
  if (names.length > MAX_FILES) throw new Error("Archive has too many files");
  let total = 0;
  for (const name of names) {
    if (name.endsWith("/")) continue;
    const rel = path.normalize(name);
    if (path.isAbsolute(rel) || rel.split(path.sep).includes("..")) continue;
    total += files[name].length;
    if (total > MAX_UNPACKED) throw new Error("Extension is too large when unpacked");
    const out = path.join(dest, rel);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, files[name]);
  }
}

const strings = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
function resolveMsg(dir, manifest, text) {
  const m = /^__MSG_(.+)__$/.exec(text);
  if (!m) return text;
  for (const loc of [manifest.default_locale ?? "en", "en"]) {
    try {
      const msgs = JSON.parse(fs.readFileSync(path.join(dir, "_locales", loc, "messages.json"), "utf8"));
      const hit = Object.entries(msgs).find(([k]) => k.toLowerCase() === m[1].toLowerCase());
      if (hit?.[1]?.message) return hit[1].message;
    } catch { /* try the next locale */ }
  }
  return m[1];
}

const UNSUPPORTED = new Set(["webRequest", "webRequestBlocking", "declarativeNetRequest", "declarativeNetRequestWithHostAccess", "declarativeNetRequestFeedback", "nativeMessaging", "proxy", "sidePanel", "identity", "downloads", "history", "bookmarks", "topSites", "tabGroups", "debugger", "pageCapture", "tabCapture"]);

export function buildInfo(dir, id, source) {
  let raw;
  try { raw = fs.readFileSync(path.join(dir, "manifest.json"), "utf8"); } catch { throw new Error("manifest.json is missing"); }
  let m; try { m = JSON.parse(raw.replace(/^﻿/, "")); } catch (e) { throw new Error(`Invalid manifest: ${e.message}`); }
  if (typeof m.name !== "string") throw new Error("Manifest has no name");
  let perms = strings(m.permissions), hosts = strings(m.host_permissions);
  hosts.push(...perms.filter((p) => p.includes("://") || p === "<all_urls>"));
  perms = perms.filter((p) => !(p.includes("://") || p === "<all_urls>"));
  const scripts = Array.isArray(m.content_scripts) ? m.content_scripts : [];
  for (const cs of scripts) hosts.push(...strings(cs.matches));
  hosts = [...new Set(hosts)].sort();
  const warnings = [];
  if (m.action?.default_popup || m.browser_action?.default_popup) warnings.push("Its toolbar popup can't be shown yet. Content scripts and background logic still run.");
  const bad = perms.filter((p) => UNSUPPORTED.has(p));
  if (bad.length) warnings.push(`Uses browser APIs that Quick Pebble doesn't provide yet: ${bad.join(", ")}. Ad blockers that rely on these won't block anything (Quick Pebble already blocks ads natively).`);
  if (!scripts.length && !m.background) warnings.push("Has no content scripts or background code, so it has nothing that can run.");
  return { id, name: resolveMsg(dir, m, m.name), version: String(m.version ?? "0"), description: resolveMsg(dir, m, String(m.description ?? "")), enabled: false, hosts, permissions: perms, has_content_scripts: scripts.length > 0, warnings, source };
}

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "extension";

export class Extensions {
  /** `sessions()` returns the normal (non-private) sessions extensions should be loaded into. */
  constructor(sessions) {
    this.sessions = sessions;
    this.loaded = new Map(); // `${ses partition}|${id}` -> electron extension id
  }
  get root() { const d = path.join(app.getPath("userData"), "extensions"); fs.mkdirSync(d, { recursive: true }); return d; }
  meta(dir) { try { return JSON.parse(fs.readFileSync(path.join(dir, ".qp-meta.json"), "utf8")); } catch { return null; } }
  writeMeta(dir, info) { fs.writeFileSync(path.join(dir, ".qp-meta.json"), JSON.stringify(info, null, 2)); }

  list() {
    return fs.readdirSync(this.root, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith(".")).map((e) => this.meta(path.join(this.root, e.name))).filter(Boolean).sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  }

  installBytes(bytes, idHint, source) {
    const zip = crxZipBytes(bytes);
    const stage = path.join(this.root, `.staging-${process.pid}`);
    fs.rmSync(stage, { recursive: true, force: true });
    fs.mkdirSync(stage, { recursive: true });
    try {
      unpack(zip, stage);
      const probe = buildInfo(stage, "tmp", source);
      const id = idHint ?? `local-${slug(probe.name)}`;
      if (!validId(id)) throw new Error("Invalid extension id");
      const info = { ...probe, id };
      this.writeMeta(stage, info);
      const dest = path.join(this.root, id);
      this.unloadEverywhere(id);
      fs.rmSync(dest, { recursive: true, force: true });
      fs.renameSync(stage, dest);
      return info;
    } finally { fs.rmSync(stage, { recursive: true, force: true }); }
  }

  async installStore(input) {
    const id = storeIdFromInput(input);
    if (!id) throw new Error("Paste a Chrome Web Store link or a 32-letter extension ID.");
    const url = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=130.0.0.0&acceptformat=crx2,crx3&x=id%3D${id}%26installsource%3Dondemand%26uc`;
    let r;
    try { r = await fetch(url, { signal: AbortSignal.timeout(30000) }); } catch { throw new Error("Couldn't reach the Chrome Web Store."); }
    if (!r.ok) throw new Error(`The Chrome Web Store answered with HTTP ${r.status}. Check the link.`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (!buf.length) throw new Error("The Chrome Web Store has no download for that extension.");
    if (buf.length > MAX_CRX) throw new Error("That extension is too large.");
    return this.installBytes(buf, id, "Chrome Web Store");
  }

  async installFile(w) {
    const r = await dialog.showOpenDialog(w.win, { filters: [{ name: "Chrome extension", extensions: ["crx", "zip"] }], properties: ["openFile"] });
    if (r.canceled || !r.filePaths[0]) return null;
    if (fs.statSync(r.filePaths[0]).size > MAX_CRX) throw new Error("That file is too large.");
    return this.installBytes(fs.readFileSync(r.filePaths[0]), null, path.basename(r.filePaths[0]));
  }

  async setEnabled(id, enabled) {
    if (!validId(id)) throw new Error("invalid id");
    const dir = path.join(this.root, id);
    const info = this.meta(dir);
    if (!info) throw new Error("Extension not found");
    info.enabled = !!enabled;
    this.writeMeta(dir, info);
    if (enabled) await this.loadInto(id);
    else this.unloadEverywhere(id);
  }
  remove(id) {
    if (!validId(id)) throw new Error("invalid id");
    this.unloadEverywhere(id);
    fs.rmSync(path.join(this.root, id), { recursive: true, force: true });
  }

  async loadInto(id, sessions = this.sessions()) {
    const dir = path.join(this.root, id);
    for (const ses of sessions) {
      const key = `${ses.storagePath ?? "default"}|${id}`;
      if (this.loaded.has(key)) continue;
      try {
        const ext = await ses.extensions.loadExtension(dir, { allowFileAccess: false });
        this.loaded.set(key, { ses, extId: ext.id });
      } catch (e) { console.error(`extension ${id} failed to load:`, e?.message ?? e); }
    }
  }
  /** Called for each new normal session, and at startup for existing ones. */
  async loadEnabledInto(ses) {
    for (const info of this.list().filter((i) => i.enabled)) await this.loadInto(info.id, [ses]);
  }
  unloadEverywhere(id) {
    for (const [key, { ses, extId }] of [...this.loaded]) {
      if (!key.endsWith(`|${id}`)) continue;
      try { ses.extensions.removeExtension(extId); } catch { /* already gone */ }
      this.loaded.delete(key);
    }
  }
}
