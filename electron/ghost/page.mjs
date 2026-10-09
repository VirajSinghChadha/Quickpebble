// GhostSearch pages: plain HTML and CSS, no JavaScript, nothing loaded from anywhere else.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const LOGO = `<svg viewBox="0 0 64 64" width="__S__" height="__S__" aria-hidden="true"><path d="M32 6c-12 0-21 9-21 21v27l7-5 7 5 7-5 7 5 7-5 7 5V27C53 15 44 6 32 6z" fill="currentColor"/><circle cx="24" cy="28" r="4.5" fill="var(--bg)"/><circle cx="40" cy="28" r="4.5" fill="var(--bg)"/></svg>`;
export const FAVICON = `data:image/svg+xml,${encodeURIComponent(LOGO.replace(/__S__/g, "64").replace("currentColor", "#6d5dfc").replace(/var\(--bg\)/g, "#fff"))}`;

const CSS = `:root{--bg:#fff;--fg:#1a1a2e;--mut:#6b7280;--line:#e5e7eb;--card:#f8f8fc;--acc:#6d5dfc;--link:#4338ca}
@media (prefers-color-scheme:dark){:root{--bg:#0f1020;--fg:#ececf5;--mut:#9ca3b8;--line:#272a45;--card:#171a33;--acc:#a99dff;--link:#a5b4fc}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
a{color:var(--link);text-decoration:none}a:hover{text-decoration:underline}
.logo{color:var(--acc);display:flex;align-items:center;gap:10px;font-weight:700;letter-spacing:-.02em;color:var(--fg)}.logo svg{color:var(--acc)}
form.s{display:flex;gap:8px;width:100%;max-width:640px}input[type=search]{flex:1;min-width:0;padding:13px 18px;border:1px solid var(--line);border-radius:999px;background:var(--card);color:var(--fg);font:inherit;outline:none}input[type=search]:focus{border-color:var(--acc);box-shadow:0 0 0 3px color-mix(in srgb,var(--acc) 25%,transparent)}
button{padding:0 22px;border:0;border-radius:999px;background:var(--acc);color:#fff;font:inherit;font-weight:600;cursor:pointer}
.home{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;padding:24px;text-align:center}.home .logo{font-size:44px}
.pills{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;max-width:640px}.pill{padding:5px 12px;border:1px solid var(--line);border-radius:999px;color:var(--mut);font-size:12.5px}
.top{display:flex;align-items:center;gap:22px;padding:14px 28px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--bg)}.top .logo{font-size:20px}
main{max-width:720px;margin:0 0 0 calc(28px + 130px);padding:18px 28px 60px 0}@media (max-width:1000px){main{margin:0 auto;padding:18px 20px 60px}}
.meta{color:var(--mut);font-size:12.5px;margin:0 0 16px}.r{margin:0 0 22px}.r .u{color:var(--mut);font-size:12.5px;word-break:break-all}.r h3{margin:2px 0 3px;font-size:19px;font-weight:500;line-height:1.3}.r p{margin:0;color:color-mix(in srgb,var(--fg) 85%,var(--bg))}
.via{display:inline-block;margin-left:8px;color:var(--mut);font-size:11.5px}.badge{display:inline-block;padding:0 6px;border:1px solid var(--line);border-radius:6px;margin-left:4px}
.box{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 18px;margin:0 0 24px}.box h2{margin:0 0 6px;font-size:16px}.box small{color:var(--mut)}
.note{color:var(--mut);font-size:12.5px;margin-top:30px;border-top:1px solid var(--line);padding-top:14px}.err{padding:30px 0;color:var(--mut)}`;

const shell = (title, body, bodyClass = "") => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta name="color-scheme" content="light dark"><title>${esc(title)}</title><link rel="icon" href="${FAVICON}"><style>${CSS}</style></head><body class="${bodyClass}">${body}</body></html>`;
const logo = (s) => LOGO.replace(/__S__/g, s);
const box = (q = "", auto = false) => `<form class="s" action="ghost://search" method="get" role="search"><input type="search" name="q" value="${esc(q)}" placeholder="Search privately" aria-label="Search" ${auto ? "autofocus" : ""} autocomplete="off" spellcheck="false"><button type="submit">Search</button></form>`;

export function homePage() {
  return shell("GhostSearch", `<div class="home"><div class="logo">${logo(52)}GhostSearch</div>${box("", true)}<div class="pills"><span class="pill">No tracking</span><span class="pill">No cookies</span><span class="pill">No search history</span><span class="pill">No Google</span><span class="pill">Results from several independent sources</span></div></div>`);
}

export function resultsPage({ query, results, summary, failed, engines, ms }) {
  const names = Object.fromEntries(engines.map((e) => [e.id, e.name]));
  const items = results.map((r) => {
    let host = r.url; try { const u = new URL(r.url); host = `${u.hostname.replace(/^www\./, "")}${u.pathname === "/" ? "" : u.pathname}`.slice(0, 90); } catch { /* keep raw */ }
    const via = r.sources.length > 1 ? `<span class="via">${r.sources.map((s) => `<span class="badge">${esc(names[s] ?? s)}</span>`).join("")}</span>` : "";
    return `<article class="r"><div class="u">${esc(host)}${via}</div><h3><a href="${esc(r.url)}" rel="noreferrer noopener">${esc(r.title)}</a></h3>${r.snippet ? `<p>${esc(r.snippet)}</p>` : ""}</article>`;
  }).join("");
  const answered = [...new Set(results.flatMap((r) => r.sources))].map((s) => names[s] ?? s);
  const down = failed.filter((f) => f.reason !== "no results").map((f) => f.name);
  const wiki = summary ? `<section class="box"><h2><a href="${esc(summary.url)}" rel="noreferrer noopener">${esc(summary.title)}</a></h2><div>${esc(summary.text)}</div><small>From Wikipedia</small></section>` : "";
  const body = `<header class="top"><a class="logo" href="ghost://home" style="text-decoration:none">${logo(26)}GhostSearch</a>${box(query)}</header><main>
    <p class="meta">${results.length ? `${results.length} results · ${esc(answered.join(", "))} · ${ms} ms` : ""}${down.length ? ` · unavailable right now: ${esc(down.join(", "))}` : ""}</p>${wiki}${items || `<div class="err"><h2>No results</h2><p>Nothing came back for “${esc(query)}”. The sources may be busy or blocking requests from this network. Try again in a moment, or add a Brave Search key or your own SearXNG address in Settings.</p></div>`}
    <p class="note">GhostSearch combines independent sources and removes tracking from their links. Your searches are not stored by Quick Pebble, no cookies or account are sent, and the sources see only the query (and your IP address, unless you use a proxy such as Tor).</p></main>`;
  return shell(`${query} – GhostSearch`, body);
}

export const errorPage = (msg) => shell("GhostSearch", `<div class="home"><div class="logo">${logo(40)}GhostSearch</div><p class="err">${esc(msg)}</p>${box("", true)}</div>`);
