// Link hover previews. Without the opt-in setting the card shows only the address, nothing is fetched.
// With it on, we ask the linked site once (no cookies, no referrer) for its title and description.
import net from "node:net";

const MAX_BYTES = 120_000;

/** Only public https addresses are ever fetched: never localhost, a private network, or a bare IP. */
export function isFetchable(raw) {
  let u;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== "https:" || u.username || u.password) return false;
  const h = u.hostname.toLowerCase();
  if (!h.includes(".") || h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".lan") || net.isIP(h.replace(/^\[|\]$/g, ""))) return false;
  return true;
}

const decode = (s) => s.replace(/&(amp|lt|gt|quot|#39|apos);/g, (_, e) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'" }[e])).replace(/\s+/g, " ").trim();

/** Title and description from the start of an HTML page. Text only; nothing from the page is ever run. */
export function parseMeta(html) {
  const head = String(html).slice(0, MAX_BYTES);
  const meta = (name) => {
    for (const m of head.matchAll(/<meta\b(?:"[^"]*"|'[^']*'|[^>"'])*>/gi)) {
      const tag = m[0];
      const key = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
      if (key === name) { const c = /content\s*=\s*("([^"]*)"|'([^']*)')/i.exec(tag); if (c) return decode(c[2] ?? c[3] ?? ""); }
    }
    return "";
  };
  const title = meta("og:title") || decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1] ?? "");
  const description = meta("og:description") || meta("description");
  return { title: title.slice(0, 120), description: description.slice(0, 160) };
}

export class LinkPreviews {
  constructor() { this.cache = new Map(); this.last = 0; }
  async get(url) {
    if (this.cache.has(url)) return this.cache.get(url);
    if (!isFetchable(url) || Date.now() - this.last < 700) return null;   // at most about one lookup a second
    this.last = Date.now();
    let meta = null;
    try {
      const r = await fetch(url, { redirect: "follow", credentials: "omit", referrerPolicy: "no-referrer", headers: { Accept: "text/html", "Accept-Language": "en", Range: `bytes=0-${MAX_BYTES}` }, signal: AbortSignal.timeout(4000) });
      if (r.ok && /html/i.test(r.headers.get("content-type") ?? "") && isFetchable(r.url)) {
        const chunks = []; let n = 0;
        for await (const c of r.body) { chunks.push(c); n += c.length; if (n >= MAX_BYTES) break; }
        meta = parseMeta(Buffer.concat(chunks).toString("utf8"));
      }
    } catch { /* offline or blocked: just no details */ }
    this.cache.set(url, meta);
    if (this.cache.size > 60) this.cache.delete(this.cache.keys().next().value);
    return meta;
  }
}
