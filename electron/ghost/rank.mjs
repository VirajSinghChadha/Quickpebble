// Merging and cleaning results from several sources. Pure functions, no network.
import { isTrackerHost } from "../security.mjs";

const TRACKING_PARAMS = /^(utm_[a-z]+|fbclid|gclid|gclsrc|dclid|msclkid|mc_eid|mc_cid|igshid|yclid|_hsenc|_hsmi|vero_id|ref_src|ref_url|spm|srsltid|oly_enc_id|oly_anon_id|rb_clickid|wickedid|s_cid)$/i;

/** Removes tracking parameters and fragments; returns null for anything that isn't a plain web URL. */
export function cleanUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (u.username || u.password) return null;
  for (const k of [...u.searchParams.keys()]) if (TRACKING_PARAMS.test(k)) u.searchParams.delete(k);
  u.hash = "";
  return u.href;
}

/** Key for treating http/https, www and trailing slashes as the same page. */
export function dedupeKey(url) {
  const u = new URL(url);
  const path = u.pathname.replace(/\/+$/, "") || "";
  return `${u.hostname.replace(/^www\./, "")}${path}${u.search}`.toLowerCase();
}

export const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } };

/**
 * Reciprocal-rank fusion: a result scores 1/(k+rank) in every list that has it, so pages several independent sources
 * agree on rise to the top, and no single source decides the order. `lists` is { engine: [{title,url,snippet}] }.
 */
export const WEIGHTS = { duckduckgo: 1, brave: 1, searxng: 1, marginalia: 0.85, wikipedia: 0.6 };
export function fuse(lists, { k = 60, limit = 30, blockTrackers = true, weights = WEIGHTS } = {}) {
  const byKey = new Map();
  for (const [engine, items] of Object.entries(lists)) {
    items.forEach((item, i) => {
      const url = cleanUrl(item.url);
      if (!url) return;
      if (blockTrackers && isTrackerHost(new URL(url).hostname)) return;
      const key = dedupeKey(url);
      const entry = byKey.get(key) ?? { url, title: "", snippet: "", sources: [], score: 0 };
      entry.score += (weights[engine] ?? 1) / (k + i + 1);
      if (!entry.sources.includes(engine)) entry.sources.push(engine);
      if (!entry.title || (item.title && item.title.length > entry.title.length && item.title.length < 140)) entry.title = item.title || entry.title;
      if (item.snippet && item.snippet.length > entry.snippet.length) entry.snippet = item.snippet;
      // Prefer https when sources disagree.
      if (url.startsWith("https:") && entry.url.startsWith("http:")) entry.url = url;
      byKey.set(key, entry);
    });
  }
  return [...byKey.values()]
    .map((e) => ({ ...e, title: e.title.trim() || hostOf(e.url), snippet: e.snippet.trim() }))
    .sort((a, b) => b.score - a.score || a.url.localeCompare(b.url))
    .slice(0, limit);
}

/** Local "bangs": `!w cats` jumps straight to Wikipedia. No third party ever sees the shortcut. */
const BANGS = {
  w: "https://en.wikipedia.org/w/index.php?search=", wiki: "https://en.wikipedia.org/w/index.php?search=",
  yt: "https://www.youtube.com/results?search_query=", gh: "https://github.com/search?q=", so: "https://stackoverflow.com/search?q=",
  mdn: "https://developer.mozilla.org/en-US/search?q=", osm: "https://www.openstreetmap.org/search?query=", maps: "https://www.openstreetmap.org/search?query=",
  npm: "https://www.npmjs.com/search?q=", imdb: "https://www.imdb.com/find/?q=", r: "https://www.reddit.com/search/?q=", ddg: "https://duckduckgo.com/?q=",
  br: "https://search.brave.com/search?q=",
};
export function parseBang(query) {
  const m = /^!(\w+)\s+(.+)$/.exec(query.trim()) ?? (() => { const t = /^(.+?)\s+!(\w+)$/.exec(query.trim()); return t ? [null, t[2], t[1]] : null; })();
  if (!m) return null;
  const base = BANGS[m[1].toLowerCase()];
  return base ? { bang: m[1].toLowerCase(), url: base + encodeURIComponent(m[2].trim()) } : null;
}
