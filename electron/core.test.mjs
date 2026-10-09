import { describe, expect, it } from "vitest";
import { allowNavigation, httpsUpgrade, isTrackerHost, normalizeInput } from "./security.mjs";
import { shouldBlock } from "./adblock.mjs";
import { ftsQuery, isIndexable } from "./recall.mjs";
import { Db } from "./db.mjs";
import { parseChromeJson, parseNetscapeHtml } from "./bookmarks.mjs";
import { parseRss, braveSources } from "./home.mjs";
import { shouldSuspend } from "./memory-saver.mjs";

describe("security", () => {
  it("normalises input", () => {
    expect(normalizeInput("rust lang", "duckduckgo").href).toBe("https://duckduckgo.com/?q=rust+lang");
    expect(normalizeInput("example.com").href).toBe("https://example.com/");
    expect(normalizeInput("localhost:3000").href).toBe("http://localhost:3000/");
    expect(normalizeInput("   ")).toBeNull();
    expect(normalizeInput("javascript:alert(1)", "duckduckgo").href).toMatch(/^https:\/\/duckduckgo\.com\/\?q=/);
  });
  it("matches trackers on label boundaries", () => {
    expect(isTrackerHost("securepubads.g.doubleclick.net")).toBe(true);
    expect(isTrackerHost("notdoubleclick.net")).toBe(false);
  });
  it("only allows web navigation", () => {
    expect(allowNavigation("file:///etc/passwd", true)).toBe(false);
    expect(allowNavigation("javascript:alert(1)", true)).toBe(false);
    expect(allowNavigation("https://x.doubleclick.net/a", true)).toBe(false);
    expect(allowNavigation("https://x.doubleclick.net/a", false)).toBe(true);
    expect(allowNavigation("about:blank", true)).toBe(true);
  });
  it("upgrades http to https except on local hosts", () => {
    const up = (s) => httpsUpgrade(s)?.href ?? null;
    expect(up("http://example.com:80/a?b=1")).toBe("https://example.com/a?b=1");
    for (const u of ["http://localhost:3000/", "http://192.168.1.5/", "http://127.0.0.1:8080/", "http://printer.local/", "http://intranet/", "https://example.com/"]) expect(up(u)).toBeNull();
  });
});

describe("native blocker decision", () => {
  const top = "news.site";
  it("blocks third-party trackers, never first party or main frames", () => {
    expect(shouldBlock({ url: "https://x.doubleclick.net/a.js", top, type: "script" })).toBe(true);
    expect(shouldBlock({ url: "https://news.site/ads/banner.js", top, type: "script" })).toBe(false);
    expect(shouldBlock({ url: "https://x.doubleclick.net/", top, type: "mainFrame" })).toBe(false);
    expect(shouldBlock({ url: "https://x.doubleclick.net/a.js", top, type: "script" }, { enabled: false })).toBe(false);
  });
  it("strict mode blocks third-party ad paths; extra filter lists apply", () => {
    expect(shouldBlock({ url: "https://cdn.other.com/pagead/x.js", top, type: "script" })).toBe(false);
    expect(shouldBlock({ url: "https://cdn.other.com/pagead/x.js", top, type: "script" }, { strict: true })).toBe(true);
    expect(shouldBlock({ url: "https://cdn.other.com/z.js", top, type: "script" }, { extra: (u) => u.includes("z.js") })).toBe(true);
  });
});

describe("recall", () => {
  it("skips sensitive pages and quotes queries", () => {
    for (const u of ["https://mail.google.com/mail/", "https://www.mybank.com/home", "https://shop.com/checkout/1", "http://localhost:3000/", "file:///x"]) expect(isIndexable(u)).toBe(false);
    expect(isIndexable("https://en.wikipedia.org/wiki/Pebble")).toBe(true);
    expect(ftsQuery("What was that article about sourdough starters?")).toBe('"sourdough" OR "starters"');
    expect(ftsQuery('"; DROP TABLE x; --')).toBe('"drop" OR "table"');
    expect(ftsQuery("the and ?!")).toBeNull();
  });
  it("indexes, ranks, stems, forgets and clears with history", () => {
    const db = new Db(":memory:");
    const body = (s) => `${s} ${"filler words to make this look like a real article. ".repeat(10)}`;
    db.recallPut("https://a.com/bread", "Sourdough guide", body("how to feed a sourdough starter every day"));
    db.recallPut("https://b.com/cars", "Engines", body("how a combustion engine works"));
    const hits = db.recallSearch(ftsQuery("sourdough starter"), 5);
    expect(hits.map((h) => h.url)).toEqual(["https://a.com/bread"]);
    expect(db.recallSearch(ftsQuery("engines"), 5)).toHaveLength(1); // stemming
    db.recallForget("https://a.com/bread");
    expect(db.recallCount()).toBe(1);
    db.clearHistory();
    expect(db.recallCount()).toBe(0);
  });
});

describe("database", () => {
  it("history, bookmarks (+folders, import dedupe), permissions", () => {
    const db = new Db(":memory:");
    db.recordVisit("https://a.com/", "A"); db.recordVisit("https://a.com/", "");
    const [h] = db.searchHistory("a.com", 5);
    expect([h.visit_count, h.title]).toEqual([2, "A"]);
    expect(db.searchHistory("%", 5)).toHaveLength(0);
    expect(db.toggleBookmark("https://a.com/", "A")).toBe(true);
    expect(db.toggleBookmark("https://a.com/", "A")).toBe(false);
    const items = [{ url: "https://a.com/", title: "A", folder: "Work" }, { url: "https://b.com/", title: "B", folder: "" }];
    expect(db.importBookmarks(items)).toBe(2);
    expect(db.importBookmarks(items)).toBe(0);
    db.setPermission("a.com", "camera", "block");
    expect(db.permissionsFor("a.com")).toHaveLength(1);
    db.setPermission("a.com", "camera", "ask");
    expect(db.permissionsFor("a.com")).toHaveLength(0);
  });
});

describe("importers and feeds", () => {
  it("parses Chrome JSON and Netscape HTML", () => {
    const got = parseChromeJson(JSON.stringify({ roots: { bookmark_bar: { children: [{ type: "url", name: "Home", url: "https://a.com/" }, { type: "folder", name: "Work", children: [{ type: "url", name: "Docs", url: "https://b.com/d" }, { type: "url", name: "JS", url: "javascript:alert(1)" }] }] } } }));
    expect(got).toEqual([{ url: "https://a.com/", title: "Home", folder: "" }, { url: "https://b.com/d", title: "Docs", folder: "Work" }]);
    const html = '<DL><DT><H3>Bar</H3><DL><DT><H3>News</H3><DL><DT><A HREF="https://n.com/">N &amp; Co</A></DL></DL></DL>';
    expect(parseNetscapeHtml(html)).toEqual([{ url: "https://n.com/", title: "N & Co", folder: "News" }]);
    expect(parseChromeJson("nope")).toEqual([]);
  });
  it("parses RSS and drops unsafe or duplicate links", () => {
    const xml = "<rss><item><title><![CDATA[Fish &amp; chips <b>x</b>]]></title><link>https://a.com/1</link></item><item><title>Bad</title><link>javascript:1</link></item><item><title>Dup</title><link>https://a.com/1</link></item></rss>";
    expect(parseRss(xml, 5)).toEqual([{ title: "Fish & chips x", url: "https://a.com/1" }]);
    expect(braveSources({ web: { results: [{ url: "javascript:1", description: "x" }, { url: "https://e.com/", title: "<b>A</b>", description: "<i>Real</i>", extra_snippets: ["More"] }] } })).toEqual([{ title: "A", url: "https://e.com/", text: "Real\nMore" }]);
  });
});

describe("memory saver", () => {
  const cfg = { enabled: true, mode: "balanced", timeout_minutes: null };
  const t = { hasPage: true, suspended: false, isActive: false, pinned: false, audible: false, recording: false, downloading: false, idleMs: 3600_000 };
  it("suspends idle tabs but never protected ones", () => {
    expect(shouldSuspend(cfg, t, 0)).toBe(true);
    for (const k of ["isActive", "pinned", "audible", "recording", "downloading"]) expect(shouldSuspend(cfg, { ...t, [k]: true }, 0)).toBe(false);
    expect(shouldSuspend(cfg, { ...t, idleMs: 60_000 }, 0)).toBe(false);
    expect(shouldSuspend(cfg, { ...t, idleMs: 11 * 60_000 }, 0.9)).toBe(true); // pressure halves the 20-minute timeout
  });
});
