// Recall: opt-in, on-device full-text index of pages you read (port of recall.rs).
const MIN_BODY = 300, MAX_BODY = 12000;
const SENSITIVE_HOST = ["bank", "paypal", "mail.", "webmail", "accounts.", "login.", "signin.", "auth.", "sso.", "secure.", "wallet", "health", "patient"];
const SENSITIVE_PATH = ["login", "signin", "sign-in", "signup", "sign-up", "checkout", "payment", "billing", "password", "account", "oauth", "2fa", "verify"];
const STOP = new Set("the and for with that this what was were who how why when where which about from have has had you your are can could did does page pages article site read saw see found find remember visited looking last week yesterday earlier some any one".split(" "));

export function isIndexable(url) {
  let u;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || /^[\d.]+$/.test(host) || host.includes(":")) return false;
  if (SENSITIVE_HOST.some((p) => host.includes(p))) return false;
  const path = u.pathname.toLowerCase();
  return !SENSITIVE_PATH.some((p) => path.includes(p));
}

export function remember(db, url, title, text) {
  if (db.getSetting("recall_enabled") !== "true" || !isIndexable(url)) return;
  const body = String(text).split(/\s+/).filter(Boolean).join(" ");
  if ([...body].length < MIN_BODY) return;
  try { db.recallPut(url, title, [...body].slice(0, MAX_BODY).join("")); } catch { /* never break browsing */ }
}

/** Quotes each meaningful word so user text can't alter the FTS5 query; OR-ed, ranked by bm25. */
export function ftsQuery(question) {
  const seen = [];
  for (const raw of String(question).split(/[^\p{L}\p{N}]+/u)) {
    const w = raw.toLowerCase();
    if ([...w].length < 3 || STOP.has(w) || seen.includes(w)) continue;
    seen.push(w);
    if (seen.length === 12) break;
  }
  return seen.length ? seen.map((w) => `"${w}"`).join(" OR ") : null;
}
