// Native request blocking. Unlike the old script-based blocker, this runs in the browser process on every
// network request (including ones the HTML parser starts), so nothing slips through before page code runs.
import { isTrackerHost } from "./security.mjs";

const AD_PATH = /(^|\/)(ads?|adserver|adframe|adview|adsense|pagead|banners?|sponsored|prebid|popunder)(\/|\.|-|_|$)/i;
export const stats = { blocked: 0 };
/** Per page (webContents id): the third-party tracker hosts it tried to load, for "which trackers does this site load?". */
const seenByPage = new Map();

/** Remembers a third-party tracker request for the page; starts over when the page's own site changes. */
export function noteTracker(map, wcId, top, host, blocked) {
  let entry = map.get(wcId);
  if (!entry || entry.top !== top) { entry = { top, hosts: new Map() }; map.set(wcId, entry); }
  if (entry.hosts.size >= 300 && !entry.hosts.has(host)) return;
  const prev = entry.hosts.get(host);
  entry.hosts.set(host, { count: (prev?.count ?? 0) + 1, blocked: blocked || !!prev?.blocked });
  if (map.size > 500) map.delete(map.keys().next().value);
}

/** Trackers seen on a page: [{ host, count, blocked }], most frequent first. */
export function pageTrackers(wcId, top) {
  const e = seenByPage.get(wcId);
  if (!e || (top && e.top !== top)) return [];
  return [...e.hosts.entries()].map(([host, v]) => ({ host, ...v })).sort((a, b) => b.count - a.count);
}

const sameSite = (a, b) => a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);

/** Pure decision, exported for tests. `top` is the host of the page that made the request. */
export function shouldBlock({ url, top, type }, { enabled = true, strict = false, extra = null } = {}) {
  if (!enabled || type === "mainFrame") return false;
  let u;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (top && sameSite(host, top)) return false; // first party
  if (isTrackerHost(host)) return true;
  if (extra && extra(url, host, type, top)) return true;
  return strict && AD_PATH.test(u.pathname);
}

/**
 * Installs the blocker on a session. `configFor(webContents)` returns { enabled, strict } for the page that
 * made the request (so per-site "trackers off" exceptions and Strict mode apply), or null to leave it alone.
 */
export function installBlocker(ses, configFor, extra) {
  ses.webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*"] }, (details, callback) => {
    const wc = details.webContents;
    const cfg = wc ? configFor(wc) : null;
    if (!cfg) return callback({});
    let top = "";
    try { top = new URL(details.frame?.top?.url || wc.getURL()).hostname.toLowerCase(); } catch { /* none */ }
    const block = shouldBlock({ url: details.url, top, type: details.resourceType }, { ...cfg, extra: extra?.() });
    if (block) stats.blocked++;
    try {
      const host = new URL(details.url).hostname.toLowerCase();
      if (top && !sameSite(host, top) && details.resourceType !== "mainFrame" && (block || isTrackerHost(host))) noteTracker(seenByPage, wc.id, top, host, block);
    } catch { /* not a URL we can read */ }
    callback({ cancel: block });
  });
}
