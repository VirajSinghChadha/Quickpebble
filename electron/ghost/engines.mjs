// The sources GhostSearch asks. Each is independent of Google and optional: a source that is slow, blocked or down is
// simply left out, and the page says so. Requests carry no cookies, no referrer and no account, and go through the app's
// network stack so a configured proxy (for example Tor) applies.
import { net } from "electron";
import { getSecret } from "../secrets.mjs";

const UA = "Mozilla/5.0 (Windows NT 10.0; rv:128.0) Gecko/20100101 Firefox/128.0";
const TIMEOUT = 5000;
const SECONDARY = new Set(["wikipedia", "marginalia"]); // fast or niche: they never start the grace clock
const GRACE_MS = 1500; // once one source has answered, wait this long for the others, then show what we have

export const decodeEntities = (s) => String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === "#") { const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
  return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…" }[e.toLowerCase()] ?? m;
});
export const stripTags = (s) => decodeEntities(String(s).replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();

async function get(url, { headers = {}, json = false, body, method = "GET" } = {}) {
  const r = await net.fetch(url, { method, body, headers: { "user-agent": UA, "accept-language": "en", ...headers }, credentials: "omit", referrerPolicy: "no-referrer", redirect: "follow", signal: AbortSignal.timeout(TIMEOUT) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return json ? r.json() : r.text();
}

// ---- DuckDuckGo (HTML endpoint, no JavaScript, no tracking) ----
export function parseDuckDuckGo(html) {
  const out = [];
  for (const block of html.split(/<div class="(?:links_main links_deep )?result__body|<div class="result results_links/).slice(1)) {
    const a = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(block);
    if (!a) continue;
    let href = decodeEntities(a[1]);
    if (href.startsWith("//")) href = `https:${href}`;
    try { const u = new URL(href); if (u.hostname.endsWith("duckduckgo.com") && u.pathname.startsWith("/l/")) href = u.searchParams.get("uddg") ?? ""; else if (u.hostname.endsWith("duckduckgo.com") && u.searchParams.has("ad_domain")) continue; } catch { continue; }
    const snip = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/.exec(block);
    if (href) out.push({ title: stripTags(a[2]), url: href, snippet: snip ? stripTags(snip[1]) : "" });
  }
  return out;
}
const duckduckgo = {
  id: "duckduckgo", name: "DuckDuckGo",
  async search(q) {
    const html = await get("https://html.duckduckgo.com/html/", { method: "POST", body: new URLSearchParams({ q, kl: "wt-wt", kp: "-2" }).toString(), headers: { "content-type": "application/x-www-form-urlencoded" } });
    if (/anomaly|captcha/i.test(html) && !html.includes("result__a")) throw new Error("blocked");
    return parseDuckDuckGo(html);
  },
};

// ---- Wikipedia (official API) ----
const wikipedia = {
  id: "wikipedia", name: "Wikipedia",
  async search(q) {
    const v = await get(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=5&format=json&origin=*`, { json: true });
    return (v?.query?.search ?? []).map((r) => ({ title: r.title, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(String(r.title).replace(/ /g, "_"))}`, snippet: stripTags(r.snippet) }));
  },
};

// ---- Brave Search (official API; uses the key from Settings → Web research, if you added one) ----
const brave = {
  id: "brave", name: "Brave Search",
  enabled: () => !!getSecret("brave"),
  async search(q) {
    const v = await get(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=20&text_decorations=false&safesearch=moderate`, { json: true, headers: { accept: "application/json", "x-subscription-token": getSecret("brave") } });
    return (v?.web?.results ?? []).map((r) => ({ title: stripTags(r.title ?? ""), url: r.url, snippet: stripTags(r.description ?? "") }));
  },
};

// ---- Marginalia (independent index of the small, text-heavy web) ----
const marginalia = {
  id: "marginalia", name: "Marginalia",
  async search(q) {
    const v = await get(`https://api.marginalia.nu/public/search/${encodeURIComponent(q)}?count=10`, { json: true });
    return (v?.results ?? []).map((r) => ({ title: stripTags(r.title ?? ""), url: r.url, snippet: stripTags(r.description ?? "") }));
  },
};

// ---- Your own SearXNG instance (Settings → GhostSearch). Needs "json" enabled in that instance's formats. ----
const searxng = (url) => ({
  id: "searxng", name: "Your SearXNG",
  async search(q) {
    const u = new URL("/search", url);
    u.searchParams.set("q", q); u.searchParams.set("format", "json");
    const v = await get(u.href, { json: true });
    return (v?.results ?? []).map((r) => ({ title: stripTags(r.title ?? ""), url: r.url, snippet: stripTags(r.content ?? "") }));
  },
});

export function enabledEngines(db) {
  const list = [duckduckgo, wikipedia, marginalia, brave].filter((e) => !e.enabled || e.enabled());
  const custom = db.getSetting("ghost_searx_url");
  if (custom) { try { if (/^https?:$/.test(new URL(custom).protocol)) list.push(searxng(custom)); } catch { /* ignore a bad URL */ } }
  return list;
}

/**
 * Runs every source at once. Failures never fail the search; they're reported so the page can say who answered.
 * A slow source can't hold the page up: GRACE_MS after the first main web source answers, anyone still silent is left out.
 */
export async function searchAll(engines, query) {
  const lists = {}, failed = [];
  const pending = new Map(engines.map((e) => [e.id, e]));
  await new Promise((resolve) => {
    let grace = null;
    const settle = (id) => {
      pending.delete(id);
      if (!pending.size) { clearTimeout(grace); resolve(); }
      else if (!grace && Object.keys(lists).some((k) => !SECONDARY.has(k))) grace = setTimeout(resolve, GRACE_MS);
    };
    for (const e of engines) {
      e.search(query).then((items) => { if (!pending.has(e.id)) return; if (items.length) lists[e.id] = items; else failed.push({ id: e.id, name: e.name, reason: "no results" }); settle(e.id); })
        .catch((err) => { if (!pending.has(e.id)) return; failed.push({ id: e.id, name: e.name, reason: String(err?.message ?? err).slice(0, 60) }); settle(e.id); });
    }
    if (!engines.length) resolve();
  });
  for (const e of pending.values()) failed.push({ id: e.id, name: e.name, reason: "too slow" });
  return { lists, failed };
}

// ---- Wikipedia summary box (plain text only: no images, so the browser never contacts Wikimedia's image servers) ----
export async function wikiSummary(query) {
  try {
    const v = await get(`https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=1&prop=extracts&exintro=1&explaintext=1&exchars=420&format=json&origin=*`, { json: true });
    const page = Object.values(v?.query?.pages ?? {})[0];
    if (!page?.extract) return null;
    // Only show it when the question is really about that article, not a loose match.
    const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").trim();
    const q = norm(query), t = norm(page.title);
    if (!(q === t || q.includes(t) || t.includes(q) || q.split(" ").filter((w) => w.length > 2).every((w) => t.includes(w)))) return null;
    return { title: page.title, text: page.extract.trim(), url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}` };
  } catch { return null; }
}
