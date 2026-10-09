// Reads the CSV export every password manager can produce. Columns are found by header name, not position.
import { normalizeHost } from "./vault.mjs";

export const MAX_ROWS = 5000;

/** RFC 4180 CSV: quoted fields, doubled quotes, line breaks inside quotes, optional BOM. */
export function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = []; let row = [], field = "", quoted = false;
  const endRow = () => { row.push(field); field = ""; if (row.some((f) => f)) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; endRow(); }
    else field += c;
  }
  if (field || row.length) endRow();
  return rows;
}

const URL_COLS = ["url", "login_uri", "website", "web site", "origin", "site", "uri", "login_url", "hostname", "web address"];
const USER_COLS = ["username", "login_username", "user", "user name", "login", "email", "login name", "identifier"];
const PASS_COLS = ["password", "login_password", "pass", "pwd"];
const NAME_COLS = ["name", "title", "login_name"];
const TYPE_COLS = ["type", "category"];
const find = (header, names) => { for (const n of names) { const i = header.indexOf(n); if (i >= 0) return i; } return -1; };

function hostOf(raw) {
  raw = String(raw ?? "").trim();
  if (!raw) return null;
  let u;
  try { u = new URL(raw); if (!u.hostname) throw 0; } catch { try { u = new URL(`https://${raw}`); } catch { return null; } }
  return /^https?:$/.test(u.protocol) ? normalizeHost(u.hostname) : null;
}

export function parseLogins(text) {
  const rows = parseCsv(text);
  if (!rows.length) throw new Error("That file is empty.");
  const [head, ...body] = rows;
  const header = head.map((h) => h.trim().toLowerCase());
  const pass = find(header, PASS_COLS);
  if (pass < 0) throw new Error("I couldn't find a password column. Is this a password export (CSV)?");
  const url = find(header, URL_COLS), name = find(header, NAME_COLS);
  if (url < 0 && name < 0) throw new Error("I couldn't find a website column in that file.");
  const user = find(header, USER_COLS), kind = find(header, TYPE_COLS);
  const cell = (r, i) => (i >= 0 && r[i] != null ? String(r[i]).trim() : "");
  const out = { logins: [], skipped: 0 };
  for (const r of body.slice(0, MAX_ROWS)) {
    const k = cell(r, kind).toLowerCase();
    const isLogin = !k || ["login", "password", "passwords"].includes(k);
    const password = r[pass] ?? "";
    const host = hostOf(cell(r, url)) ?? (() => { const h = hostOf(cell(r, name)); return h?.includes(".") ? h : null; })();
    if (isLogin && host && password && password.length <= 1024) out.logins.push({ host, username: [...cell(r, user)].slice(0, 256).join(""), password });
    else out.skipped++;
  }
  out.skipped += Math.max(0, body.length - MAX_ROWS);
  return out;
}
