// Password manager. Passwords are encrypted with AES-256-GCM under a key derived from the master password
// (scrypt, 128 MB). The key lives only in memory and locks after 15 idle minutes. Sites and usernames are stored in
// clear so entries can be listed and matched; passwords never are. Pages can only *report* a login; nothing is saved
// until the person agrees, and a saved login is only filled into a page whose host matches exactly.
import crypto from "node:crypto";
import fs from "node:fs";
import { dialog } from "electron";
import { parseLogins } from "./vault-import.mjs";

const IDLE_LOCK_MS = 15 * 60_000, PENDING_TTL_MS = 5 * 60_000, MIN_MASTER = 8;
const CHECK = Buffer.from("quick-pebble-vault-v1");
const SCRYPT = { N: 1 << 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };

export const normalizeHost = (host) => {
  let h = String(host).trim().replace(/\.$/, "").toLowerCase();
  if (h.startsWith("www.")) h = h.slice(4);
  return h && h.length <= 253 && /^[a-z0-9.-]+$/.test(h) ? h : null;
};
const aad = (host, username) => Buffer.from(`${host}\n${username}`);

export function deriveKey(master, salt) {
  return new Promise((res, rej) => crypto.scrypt(master, salt, 32, SCRYPT, (e, k) => (e ? rej(e) : res(k))));
}
/** nonce (12) || ciphertext || tag (16). `ad` ties the secret to its entry so rows can't be swapped. */
export function encrypt(key, plain, ad) {
  const nonce = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, nonce, { authTagLength: 16 });
  c.setAAD(ad);
  return Buffer.concat([nonce, c.update(plain), c.final(), c.getAuthTag()]);
}
export function decrypt(key, blob, ad) {
  blob = Buffer.from(blob);
  if (blob.length < 12 + 16) return null;
  try {
    const d = crypto.createDecipheriv("aes-256-gcm", key, blob.subarray(0, 12), { authTagLength: 16 });
    d.setAAD(ad);
    d.setAuthTag(blob.subarray(blob.length - 16));
    return Buffer.concat([d.update(blob.subarray(12, blob.length - 16)), d.final()]);
  } catch { return null; }
}

export class Vault {
  constructor(db, browser) {
    this.db = db; this.browser = browser;
    this.key = null; this.at = 0;
    this.pending = new Map(); // `${window}|${tab}` -> { host, username, password, at }
  }
  get unlocked() {
    if (this.key && Date.now() - this.at < IDLE_LOCK_MS) return true;
    this.lock();
    return false;
  }
  lock() { this.key?.fill(0); this.key = null; this.pending.clear(); }
  withKey(f) {
    if (!this.unlocked) throw new Error("The vault is locked.");
    this.at = Date.now();
    return f(this.key);
  }
  setKey(k) { this.key?.fill(0); this.key = k; this.at = Date.now(); }
  meta(k) { const r = this.db.get("SELECT v FROM vault_meta WHERE k = ?1", k); return r ? Buffer.from(r.v) : null; }
  setMeta(k, v) { this.db.run("INSERT INTO vault_meta (k, v) VALUES (?1, ?2) ON CONFLICT(k) DO UPDATE SET v = excluded.v", k, v); }
  item(id) { const r = this.db.get("SELECT host, username, blob FROM vault_items WHERE id = ?1", id); return r ? { host: r.host, username: r.username, blob: Buffer.from(r.blob) } : null; }
  list(q = "") {
    const like = `%${String(q).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    return this.db.all("SELECT id, host, username, created_at FROM vault_items WHERE host LIKE ?1 ESCAPE '\\' OR username LIKE ?1 ESCAPE '\\' ORDER BY host, username", like).map((r) => ({ id: Number(r.id), host: r.host, username: r.username, created_at: Number(r.created_at) }));
  }
  store(host, username, password) {
    const h = normalizeHost(host);
    if (!h) throw new Error("Enter a website like example.com.");
    username = String(username ?? "").trim();
    if ([...username].length > 256) throw new Error("That username is too long.");
    if (!password || password.length > 1024) throw new Error("Enter a password (up to 1024 characters).");
    const blob = this.withKey((k) => encrypt(k, Buffer.from(password), aad(h, username)));
    this.db.run("INSERT INTO vault_items (host, username, blob, created_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(host, username) DO UPDATE SET blob = excluded.blob", h, username, blob, Math.floor(Date.now() / 1000));
    return Number(this.db.get("SELECT id FROM vault_items WHERE host = ?1 AND username = ?2", h, username).id);
  }
  plain(id) {
    const it = this.item(id);
    if (!it) throw new Error("That login no longer exists.");
    const p = this.withKey((k) => decrypt(k, it.blob, aad(it.host, it.username)));
    if (!p) throw new Error("Could not decrypt that login.");
    return { ...it, password: p.toString("utf8") };
  }

  commands() {
    const db = this.db;
    return {
      vault_status: () => ({ exists: !!this.meta("salt"), unlocked: this.unlocked }),
      vault_create: async (_w, { master }) => {
        if ([...master].length < MIN_MASTER) throw new Error(`Use at least ${MIN_MASTER} characters for the master password.`);
        if (master.length > 512) throw new Error("That master password is too long.");
        if (this.meta("salt")) throw new Error("A vault already exists.");
        const salt = crypto.randomBytes(16);
        const key = await deriveKey(master, salt);
        this.setMeta("salt", salt);
        this.setMeta("check", encrypt(key, CHECK, Buffer.from("check")));
        this.setKey(key);
      },
      vault_unlock: async (_w, { master }) => {
        const salt = this.meta("salt"), check = this.meta("check");
        if (!salt) throw new Error("No vault yet. Create one first.");
        if (!check) throw new Error("The vault is damaged.");
        if (master.length > 512) throw new Error("Wrong master password.");
        const key = await deriveKey(master, salt);
        const ok = decrypt(key, check, Buffer.from("check"));
        if (!ok || !ok.equals(CHECK)) { key.fill(0); throw new Error("Wrong master password."); }
        this.setKey(key);
      },
      vault_lock: () => this.lock(),
      vault_list: (_w, { query }) => { this.withKey(() => 0); return this.list(query ?? ""); },
      vault_reveal: (_w, { id }) => this.plain(id).password,
      vault_save: (_w, { host, username, password }) => this.store(host, username, password),
      vault_delete: (_w, { id }) => { this.withKey(() => 0); db.run("DELETE FROM vault_items WHERE id = ?1", id); },
      vault_import_file: async (w) => {
        if (!this.unlocked) throw new Error("Unlock the vault first.");
        const r = await dialog.showOpenDialog(w.win, { filters: [{ name: "Passwords (CSV)", extensions: ["csv"] }], properties: ["openFile"] });
        if (r.canceled || !r.filePaths[0]) return null;
        if (fs.statSync(r.filePaths[0]).size > 10_000_000) throw new Error("That file is too large to be a password export.");
        let text;
        try { text = fs.readFileSync(r.filePaths[0], "utf8"); } catch { throw new Error("Could not read that file as text."); }
        const parsed = parseLogins(text);
        text = "";
        const report = { added: 0, updated: 0, unchanged: 0, skipped: parsed.skipped };
        for (const l of parsed.logins) {
          const existing = this.list(l.host).find((e) => e.host === l.host && e.username === l.username);
          if (existing && this.plain(existing.id).password === l.password) { report.unchanged++; continue; }
          try { this.store(l.host, l.username, l.password); existing ? report.updated++ : report.added++; } catch { report.skipped++; }
        }
        return report;
      },
      vault_fill: (w, { tabId, id }) => {
        const it = this.item(id);
        if (!it) throw new Error("That login no longer exists.");
        const t = this.browser.tab(w, tabId);
        let page; try { page = new URL(t.url); } catch { throw new Error("This page has no address."); }
        if (page.protocol !== "https:") throw new Error("Passwords are only filled on secure (https) pages.");
        if (normalizeHost(page.hostname) !== it.host) throw new Error(`This login is saved for ${it.host}, not this site, so I won't fill it here.`);
        const { username, password } = this.plain(id);
        if (!t.view) throw new Error("That tab has no page loaded.");
        t.view.webContents.executeJavaScript(fillScript(username, password));
      },
      vault_save_pending: (w, { tabId }) => {
        if (!this.unlocked) throw new Error("Unlock the vault first.");
        const p = this.takePending(w, tabId);
        return this.store(p.host, p.username, p.password);
      },
      vault_dismiss_pending: (w, { tabId, never }) => {
        try { const p = this.takePending(w, tabId); if (never) db.run("INSERT OR IGNORE INTO vault_never (host) VALUES (?1)", p.host); } catch { /* nothing waiting */ }
      },
    };
  }
  takePending(w, tabId) {
    const key = `${w.label}|${tabId}`;
    const p = this.pending.get(key);
    this.pending.delete(key);
    if (!p) throw new Error("There is no login waiting to be saved.");
    if (Date.now() - p.at > PENDING_TTL_MS) throw new Error("That login prompt expired. Sign in again to save it.");
    return p;
  }

  /** A page reported a submitted login. Identity and host come from the tab, never from the payload. */
  loginSeen(win, tab, args) {
    const password = String(args?.password ?? ""), username = String(args?.username ?? "").trim();
    if (!password || password.length > 1024 || [...username].length > 256 || win.private) return;
    let page; try { page = new URL(tab.url); } catch { return; }
    if (page.protocol !== "https:") return;
    const host = normalizeHost(page.hostname);
    if (!host || this.db.get("SELECT 1 AS x FROM vault_never WHERE host = ?1", host)) return;
    const same = this.list(host).find((e) => e.host === host && e.username === username);
    if (same && this.unlocked) { try { if (this.plain(same.id).password === password) return; } catch { /* locked meanwhile */ } }
    this.pending.set(`${win.label}|${tab.id}`, { host, username, password, at: Date.now() });
    this.browser.emitUi(win, "qp://login-seen", { window: win.label, id: tab.id, host, username });
  }
}

export function fillScript(username, password) {
  const u = JSON.stringify(username), p = JSON.stringify(password);
  return `(function(U,P){
  const vis=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'};
  const set=(el,v)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));};
  const pw=[...document.querySelectorAll('input[type=password]')].find(vis); if(!pw) return false;
  const scope=pw.form||document;
  const cands=[...scope.querySelectorAll('input')].filter(i=>i!==pw&&vis(i)&&/^(text|email|tel)$/i.test(i.type||'text'));
  const user=cands.filter(i=>i.compareDocumentPosition(pw)&Node.DOCUMENT_POSITION_FOLLOWING).pop()||cands[0];
  if(user&&U) set(user,U); set(pw,P); return true;
})(${u},${p})`;
}
