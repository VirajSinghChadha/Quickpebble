// GhostSearch: a private meta-search engine that runs inside the browser at ghost://search?q=…
import { protocol } from "electron";
import { enabledEngines, searchAll, wikiSummary } from "./engines.mjs";
import { fuse, parseBang } from "./rank.mjs";
import { errorPage, homePage, resultsPage } from "./page.mjs";

// Must run before the app is ready.
export function registerGhostScheme() {
  protocol.registerSchemesAsPrivileged([{ scheme: "ghost", privileges: { standard: true, secure: true } }]);
}

const HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
  // No scripts, no remote anything: only the inline stylesheet and the data: icon.
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action ghost:; base-uri 'none'",
};
const html = (body, status = 200) => new Response(body, { status, headers: HEADERS });

const cache = new Map(); // short in-memory cache so Back/Reload don't re-query; never written to disk
const TTL = 2 * 60_000;

export function ghostHandler(db) {
  return async (request) => {
    let u;
    try { u = new URL(request.url); } catch { return html(errorPage("Bad address."), 400); }
    if (u.hostname === "home" || (u.hostname === "search" && !u.searchParams.get("q")?.trim())) return html(homePage());
    if (u.hostname !== "search") return html(errorPage("Page not found."), 404);
    const query = u.searchParams.get("q").trim().slice(0, 400);
    const bang = parseBang(query);
    if (bang) return new Response(null, { status: 302, headers: { location: bang.url, "referrer-policy": "no-referrer" } });
    const key = `${query}|${db.getSetting("ghost_searx_url") ?? ""}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL) return html(hit.page);
    const t0 = Date.now();
    const engines = enabledEngines(db);
    const [{ lists, failed }, summary] = await Promise.all([searchAll(engines, query), wikiSummary(query)]);
    const results = fuse(lists, { blockTrackers: db.getSetting("block_trackers") !== "false" });
    const page = resultsPage({ query, results, summary, failed, engines, ms: Date.now() - t0 });
    if (results.length) { cache.set(key, { at: Date.now(), page }); if (cache.size > 40) cache.delete(cache.keys().next().value); }
    return html(page);
  };
}
export const clearGhostCache = () => cache.clear();
