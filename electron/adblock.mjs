// Native request blocking. Unlike the old script-based blocker, this runs in the browser process on every
// network request (including ones the HTML parser starts), so nothing slips through before page code runs.
import { isTrackerHost } from "./security.mjs";

const AD_PATH = /(^|\/)(ads?|adserver|adframe|adview|adsense|pagead|banners?|sponsored|prebid|popunder)(\/|\.|-|_|$)/i;
export const stats = { blocked: 0 };

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
    callback({ cancel: block });
  });
}
