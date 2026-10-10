// Home-page widgets and Brave web research (port of home.rs and research.rs). All fetching happens here, never in pages.
import { getSecret, setSecret } from "./secrets.mjs";

const MAX_BYTES = 1_500_000;
export const NEWS_SOURCES = {
  bbc: "https://feeds.bbci.co.uk/news/rss.xml",
  "bbc-world": "https://feeds.bbci.co.uk/news/world/rss.xml",
  npr: "https://feeds.npr.org/1001/rss.xml",
  guardian: "https://www.theguardian.com/world/rss",
  aljazeera: "https://www.aljazeera.com/xml/rss/all.xml",
  hn: "https://news.ycombinator.com/rss",
};

async function getText(url) {
  let r;
  try { r = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { "user-agent": "QuickPebble/2" } }); } catch { throw new Error("Couldn't reach the internet."); }
  if (!r.ok) throw new Error(`The service answered with an error (${r.status}).`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error("The response was unexpectedly large, so I stopped.");
  return buf.toString("utf8");
}

export async function weatherSearch(query) {
  const q = String(query).trim();
  if ([...q].length < 2 || q.length > 80) throw new Error("Type at least two letters of a city name.");
  const v = JSON.parse(await getText(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`));
  return (v.results ?? []).flatMap((r) => {
    if (!(Math.abs(r.latitude) <= 90 && Math.abs(r.longitude) <= 180) || typeof r.name !== "string") return [];
    const s = (k) => String(r[k] ?? "").slice(0, 80);
    return [{ name: r.name.slice(0, 80), region: s("admin1"), country: s("country"), lat: r.latitude, lon: r.longitude }];
  });
}

export async function weatherFetch(lat, lon, fahrenheit) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error("That place has no valid location.");
  const unit = fahrenheit ? "fahrenheit" : "celsius", wind = fahrenheit ? "mph" : "kmh";
  const v = JSON.parse(await getText(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1&temperature_unit=${unit}&wind_speed_unit=${wind}`));
  const c = v.current ?? {}, d = v.daily ?? {};
  if (typeof c.temperature_2m !== "number" || typeof c.weather_code !== "number" || typeof d.temperature_2m_max?.[0] !== "number" || typeof d.temperature_2m_min?.[0] !== "number") throw new Error("The weather service sent incomplete data.");
  return { temp: c.temperature_2m, feels: c.apparent_temperature ?? c.temperature_2m, code: c.weather_code, is_day: (c.is_day ?? 1) !== 0, high: d.temperature_2m_max[0], low: d.temperature_2m_min[0], rain_chance: d.precipitation_probability_max?.[0] ?? null, wind: c.wind_speed_10m ?? 0 };
}

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unescape = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === "#") { const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isInteger(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
  return ENT[e.toLowerCase()] ?? m;
});
function tagText(block, tag) {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i").exec(block);
  if (!m) return null;
  let raw = m[1].trim();
  const cdata = /^<!\[CDATA\[([\s\S]*)\]\]>$/.exec(raw);
  if (cdata) raw = cdata[1];
  const text = unescape(raw.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
  return text || null;
}
function linkOf(block) {
  const plain = tagText(block, "link");
  if (plain?.startsWith("http")) return plain;
  const h = /<link\b[^>]*\bhref="([^"]+)"/i.exec(block);
  return h ? unescape(h[1]) : null;
}
export function parseRss(xml, max) {
  const out = [];
  for (const marker of ["<item", "<entry"]) {
    for (const part of xml.split(marker).slice(1)) {
      const block = part.split("</item>")[0].split("</entry>")[0];
      const title = tagText(block, "title"), link = linkOf(block);
      if (!title || !link) continue;
      let u; try { u = new URL(link); } catch { continue; }
      if (!/^https?:$/.test(u.protocol) || out.some((h) => h.url === link)) continue;
      out.push({ title: title.slice(0, 200), url: link });
      if (out.length >= max) return out;
    }
    if (out.length) break;
  }
  return out;
}
export async function newsFetch(source, count = 5) {
  const url = NEWS_SOURCES[source];
  if (!url) throw new Error("Unknown news source.");
  const items = parseRss(await getText(url), Math.min(10, Math.max(1, count)));
  if (!items.length) throw new Error("That feed had no headlines right now.");
  return items;
}

// ---- Brave web research ----
export const researchStatus = () => !!getSecret("brave");
export function researchKeySet(key) {
  if (key.length > 4096) throw new Error("Invalid search key");
  setSecret("brave", key.trim());
}
const plain = (s) => String(s ?? "").replace(/<[^>]*>/g, "").slice(0, 4000);
export function braveSources(value) {
  const seen = new Set(), out = [];
  for (const r of value?.web?.results ?? []) {
    let u; try { u = new URL(r.url); } catch { continue; }
    if (!/^https?:$/.test(u.protocol) || seen.has(u.href)) continue;
    seen.add(u.href);
    let text = plain(r.description);
    for (const e of (r.extra_snippets ?? []).slice(0, 3)) text += `\n${plain(e)}`;
    if (!text.trim()) continue;
    out.push({ title: plain(r.title), url: u.href, text: text.slice(0, 4000) });
    if (out.length === 4) break;
  }
  return out;
}
export async function researchSearch(query) {
  if (!query.trim() || [...query].length > 600 || query.trim().split(/\s+/).length > 75) throw new Error("Use a research question under 600 characters and 75 words");
  const key = getSecret("brave"); if (!key) throw new Error("Add a Brave Search API key in Settings → Web research");
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  for (const [k, v] of Object.entries({ q: query, count: "6", extra_snippets: "true", text_decorations: "false", safesearch: "moderate" })) url.searchParams.set(k, v);
  let r;
  try { r = await fetch(url, { headers: { Accept: "application/json", "X-Subscription-Token": key }, redirect: "error", signal: AbortSignal.timeout(20000) }); } catch { throw new Error("Web research couldn't connect. Check your internet connection."); }
  if (!r.ok) throw new Error(`Search provider returned HTTP ${r.status}. Check your key and search quota.`);
  const results = braveSources(await r.json().catch(() => { throw new Error("Search provider returned an unreadable response"); }));
  if (!results.length) throw new Error("No useful web sources found. Try a more specific question or attach a page.");
  return results;
}
