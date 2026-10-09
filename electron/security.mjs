// URL normalisation, navigation policy and HTTPS upgrade rules (port of security.rs).
import { TRACKER_HOSTS } from "./trackers.mjs";

export { TRACKER_HOSTS };
export const SEARCH_ENGINES = {
  ghostsearch: "ghost://search?q=",
  google: "https://www.google.com/search?q=",
  brave: "https://search.brave.com/search?q=",
  duckduckgo: "https://duckduckgo.com/?q=",
  bing: "https://www.bing.com/search?q=",
  startpage: "https://www.startpage.com/do/search?q=",
  ecosia: "https://www.ecosia.org/search?q=",
};
export const PERMISSIONS = ["camera", "microphone", "location", "notifications"];
export const POLICIES = ["ask", "allow", "block"];

const trackerSet = new Set(TRACKER_HOSTS);

/** True if `host` is, or is a subdomain of, a known ad/tracking host. */
export function isTrackerHost(host) {
  let h = String(host).replace(/\.$/, "").toLowerCase();
  while (h) {
    if (trackerSet.has(h)) return true;
    const i = h.indexOf(".");
    if (i < 0) return false;
    h = h.slice(i + 1);
  }
  return false;
}

export function parseUrl(s) {
  try { return new URL(s); } catch { return null; }
}

/** Only http(s) and about:blank may load; javascript:, file:, data: and custom schemes never can. */
export function allowNavigation(url, blockTrackers) {
  const u = typeof url === "string" ? parseUrl(url) : url;
  if (!u) return false;
  if (u.protocol === "about:") return u.href === "about:blank";
  if (u.protocol === "ghost:") return true; // our own search pages (served by the app, never the network)
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  return !(blockTrackers && isTrackerHost(u.hostname));
}

export function isLocalHost(host) {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local")) return true;
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 127 || a === 10 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  if (h.includes(":")) return h === "::1" || h === "::";
  return !h.includes(".");
}

/** `http://example.com/a` -> `https://example.com/a`; null if not applicable. */
export function httpsUpgrade(url) {
  const u = typeof url === "string" ? parseUrl(url) : new URL(url.href);
  if (!u || u.protocol !== "http:" || isLocalHost(u.hostname)) return null;
  const port = u.port;
  u.protocol = "https:";
  if (port === "80") u.port = "";
  return u;
}

/** Turns whatever the user typed into a loadable URL (or a search URL). */
export function normalizeInput(input, engine = "ghostsearch") {
  const s = String(input ?? "").trim();
  if (!s) return null;
  const direct = parseUrl(s);
  if (direct && (direct.protocol === "http:" || direct.protocol === "https:") && direct.hostname) return direct;
  if (s === "about:blank") return new URL(s);
  const looksLikeHost = !/\s/.test(s) && (s.includes(".") || s.startsWith("localhost") || /^\d+\.\d+\.\d+\.\d+/.test(s));
  if (looksLikeHost) {
    const scheme = s.startsWith("localhost") || s.startsWith("127.") ? "http" : "https";
    const u = parseUrl(`${scheme}://${s}`);
    if (u && (u.hostname.includes(".") || u.hostname === "localhost")) return u;
  }
  const base = SEARCH_ENGINES[engine] ?? SEARCH_ENGINES.ghostsearch;
  return new URL(base + encodeURIComponent(s).replace(/%20/g, "+"));
}
