// Bookmark import: Chrome's profile file and the Netscape HTML export every browser can produce.
const keep = (u) => { try { return /^https?:$/.test(new URL(u).protocol); } catch { return false; } };
const clean = (s, max) => [...String(s ?? "").trim()].slice(0, max).join("");
const unescape = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&amp;/g, "&");

export function parseChromeJson(text) {
  let v; try { v = JSON.parse(text); } catch { return []; }
  const out = [];
  const walk = (node, folder) => {
    if (node?.type === "url") { if (keep(node.url)) out.push({ url: node.url, title: clean(node.name, 300), folder }); }
    else if (node?.type === "folder") { const name = clean(node.name, 80); for (const c of node.children ?? []) walk(c, name); }
  };
  for (const root of ["bookmark_bar", "other", "synced"]) for (const c of v?.roots?.[root]?.children ?? []) walk(c, "");
  return out;
}

export function parseNetscapeHtml(html) {
  const lower = html.toLowerCase();
  const out = [], stack = [];
  let pending = null, i = 0;
  for (;;) {
    const at = lower.indexOf("<", i);
    if (at < 0) break;
    const rest = lower.slice(at, at + 5);
    if (rest.startsWith("<h3")) {
      const gt = lower.indexOf(">", at); if (gt < 0) break;
      const e = lower.indexOf("</h3>", at); const end = e < 0 ? html.length : e;
      pending = clean(unescape(html.slice(gt + 1, end)), 80);
      i = end;
    } else if (rest.startsWith("<dl")) { stack.push(pending ?? ""); pending = null; i = at + 3; }
    else if (rest.startsWith("</dl")) { stack.pop(); i = at + 4; }
    else if (rest.startsWith("<a ")) {
      const gt = lower.indexOf(">", at); if (gt < 0) break;
      const e = lower.indexOf("</a>", at); const end = e < 0 ? html.length : e;
      const tag = html.slice(at, gt);
      const title = clean(unescape(html.slice(gt + 1, Math.max(end, gt + 1))), 300);
      const m = /href="([^"]*)"/i.exec(tag);
      const url = m ? unescape(m[1]) : null;
      if (url && keep(url)) out.push({ url, title, folder: [...stack].reverse().find((f) => f) ?? "" });
      i = end;
    } else i = at + 1;
  }
  return out;
}
