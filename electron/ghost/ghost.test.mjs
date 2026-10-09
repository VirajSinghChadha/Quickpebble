import { describe, expect, it } from "vitest";
import { parseDuckDuckGo, stripTags, decodeEntities, searchAll } from "./engines.mjs";
import { cleanUrl, dedupeKey, fuse, parseBang } from "./rank.mjs";
import { homePage, resultsPage } from "./page.mjs";

// A real block from DuckDuckGo's HTML endpoint (trimmed), plus a copy pointing elsewhere and a sponsored result.
const FIXTURE = "<div class=\"result results_links results_links_deep web-result \">\n                  <div class=\"links_main links_deep result__body\"> <!-- This is the visible part -->\n                    \n                      <h2 class=\"result__title\">\n                        <a rel=\"nofollow\" class=\"result__a\" href=\"//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.kingarthurbaking.com%2Frecipes%2Ffeeding%2Dand%2Dmaintaining%2Dyour%2Dsourdough%2Dstarter%2Drecipe&amp;rut=bd3883cfa5f98b9adaca61a346553e51c914e06e3239143b17474a2c5a1d2265\">Feeding and Maintaining Your Sourdough Starter - King Arthur Baking</a>\n                      </h2>\n\n                    \n\n                    \n                      <div class=\"result__extras\">\n                        <div class=\"result__extras__url\">\n                          <span class=\"result__icon\">\n                            <a rel=\"nofollow\" href=\"//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.kingarthurbaking.com%2Frecipes%2Ffeeding%2Dand%2Dmaintaining%2Dyour%2Dsourdough%2Dstarter%2Drecipe&amp;rut=bd3883cfa5f98b9adaca61a346553e51c914e06e3239143b17474a2c5a1d2265\">\n                              <img class=\"result__icon__img\" width=\"16\" height=\"16\" alt=\"\" src=\"//external-content.duckduckgo.com/ip3/www.kingarthurbaking.com.ico\" name=\"i15\" />\n                            </a>\n                          </span>\n                          <a class=\"result__url\" href=\"//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.kingarthurbaking.com%2Frecipes%2Ffeeding%2Dand%2Dmaintaining%2Dyour%2Dsourdough%2Dstarter%2Drecipe&amp;rut=bd3883cfa5f98b9adaca61a346553e51c914e06e3239143b17474a2c5a1d2265\">\n                            www.kingarthurbaking.com/recipes/feeding-and-maintaining-your-sourdough-starter-recipe\n                          </a>\n                          \n                            <span>&nbsp; &nbsp; 2026-09-01T00:00:00.0000000</span>\n                          \n                        </div>\n                      </div>\n                    \n\n                    \n                      \n                        <a class=\"result__snippet\" href=\"//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.kingarthurbaking.com%2Frecipes%2Ffeeding%2Dand%2Dmaintaining%2Dyour%2Dsourdough%2Dstarter%2Drecipe&amp;rut=bd3883cfa5f98b9adaca61a346553e51c914e06e3239143b17474a2c5a1d2265\">Once you&#x27;ve successfully created your own <b>sourdough</b> <b>starter</b>, you&#x27;ll want to keep it healthy with regular <b>feedings</b>. While there are many ways to successfully maintain a <b>starter</b>, there are two basic options to choose from: Here&#x27;s how to feed and maintain your <b>sourdough</b> <b>starter</b>.</a>\n                      \n                    \n\n                    <div class=\"clear\"></div>\n                  </div>\n                </div>\n              \n            \n              \n                <div class=\"result results_links results_links_deep web-result \">\n                  <div class=\"links_main links_deep result__body\"> <!-- This is the visible part -->\n                    \n                      <h2 class=\"result__title\">\n                        <a rel=\"nofollow\" class=\"result__a\" href=\"//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.mydailysourdoughbread.com%2Fhow%2Dto%2Dfeed%2Dsourdough%2Dstarter%2F&amp;rut=d66470c5302a51d66c04b70a9f306b3251e5391000098b45e0fd39ab1e269519\">How to Feed Sourdough Starter (A Beginner&#x27;s Guide to Perfect Bread)</a>\n                      </h2>\n\n                    \n\n                    \n                      <div class=\"result__extras\">\n                        <div class=\"result__extras__url\">\n                          <span class=\"result__icon\">\n                            <a rel=\"nofollow\" href=\"//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.mydailysourdoughbread.com%2Fhow%2Dto%2Dfeed%2Dsourdough%2Dstarter%2F&amp;rut=d66470c5302a51d66c04b70a9f306b3251e5391000098b45e0fd39ab1e269519\">\n                              <img class=\"result__icon__img\" width=\"16\" height=\"16\" alt=\"\" src=\"//external-content.duckduckgo.com/ip3/www.mydailysourdoughbread.com.ico\" name=\"i15\" />\n                            </a>\n                          </span>\n                          <a class=\"result__url\" href=\"//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.mydailysourdoughbread.com%2Fhow%2Dto%2Dfeed%2Dsourdough%2Dstarter%2F&amp;rut=d66470c5302a51d66c04b70a9f306b3251e5391000098b45e0fd39ab1e269519\">\n                            www.mydailysourdoughbread.com/how-to-feed-sourdough-starter/\n                          </a>\n                          \n                            <span>&nbsp; &nbsp; 2025-04-04T00:00:00.0000000</span>\n                          \n                        </div>\n                      </div>\n                    \n\n                    \n                      \n                        <a class=\"result__snippet\" href=\"//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.mydailysourdoughbread.com%2Fhow%2Dto%2Dfeed%2Dsourdough%2Dstarter%2F&amp;rut=d66470c5302a51d66c04b70a9f306b3251e5391000098b45e0fd39ab1e269519\">Learn how to feed <b>sourdough</b> <b>starter</b> properly with our science-backed guide. Master ratios, timing and flour choices for a consistently active <b>starter</b>.</a>\n                      \n                    \n\n                    <div class=\"clear\"></div>\n                  </div>\n                </div>\n              \n            \n              \n                ";

describe("DuckDuckGo parser", () => {
  const out = parseDuckDuckGo(FIXTURE + FIXTURE.replace(/kingarthurbaking\.com%2Frecipes[^&"]*/g, "example.org%2Fa%3Futm_source%3Dx%26id%3D1") + '<div class="result results_links result--ad"><a class="result__a" href="//duckduckgo.com/y.js?ad_domain=shop.com&amp;u=1">Buy now</a></div>');
  it("extracts real destination URLs, titles and snippets, and skips ads", () => {
    expect(out.length).toBe(4); // two real results, their copy, and no sponsored one
    expect(out[0].url).toMatch(/^https:\/\/www\.kingarthurbaking\.com\/recipes\/feeding-and-maintaining/);
    expect(out[0].title).toBe("Feeding and Maintaining Your Sourdough Starter - King Arthur Baking");
    expect(out[0].snippet.length).toBeGreaterThan(20);
    expect(out.map((r) => r.url)).toContain("https://www.example.org/a?utm_source=x&id=1");
    expect(out.some((r) => /duckduckgo\.com/.test(r.url))).toBe(false);
  });
  it("decodes entities and strips tags", () => {
    expect(stripTags("<b>Fish</b> &amp; chips&#39;s&nbsp;x")).toBe("Fish & chips's x");
    expect(decodeEntities("&#x41;&#66;&bogus;")).toBe("AB&bogus;");
  });
});

describe("cleaning and ranking", () => {
  it("strips tracking parameters and fragments, rejects non-web and credentialed URLs", () => {
    expect(cleanUrl("https://a.com/p?utm_source=x&id=2&fbclid=z&gclid=1#frag")).toBe("https://a.com/p?id=2");
    for (const bad of ["javascript:alert(1)", "file:///etc/passwd", "ftp://a.com/", "https://user:pw@a.com/", "nope"]) expect(cleanUrl(bad)).toBeNull();
  });
  it("treats http/https, www and trailing slashes as the same page", () => {
    expect(dedupeKey("http://www.A.com/x/")).toBe(dedupeKey("https://a.com/x"));
    expect(dedupeKey("https://a.com/x?q=1")).not.toBe(dedupeKey("https://a.com/x"));
  });
  it("fuses sources: agreement wins, duplicates merge, trackers vanish, https preferred", () => {
    const r = fuse({
      ddg: [{ title: "Only DDG", url: "https://one.com/" }, { title: "Shared", url: "http://www.shared.com/p/", snippet: "short" }, { title: "Ad", url: "https://x.doubleclick.net/a" }],
      wiki: [{ title: "Shared page title", url: "https://shared.com/p?utm_medium=y", snippet: "a much longer snippet here" }],
    });
    expect(r.map((x) => x.url)).toEqual(["https://shared.com/p", "https://one.com/"]);
    expect(r[0].sources.sort()).toEqual(["ddg", "wiki"]);
    expect(r[0].snippet).toBe("a much longer snippet here");
    expect(fuse({ a: [{ title: "T", url: "https://x.doubleclick.net/a" }] }, { blockTrackers: false })).toHaveLength(1);
  });
  it("is deterministic and limits output", () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ title: `T${i}`, url: `https://s${i}.com/` }));
    expect(fuse({ a: many }).length).toBe(30);
    expect(fuse({ a: many }, { limit: 5 }).map((x) => x.url)).toEqual(many.slice(0, 5).map((x) => x.url));
  });
});

describe("search fan-out", () => {
  const eng = (id, ms, result) => ({ id, name: id, search: () => new Promise((res, rej) => setTimeout(() => (result instanceof Error ? rej(result) : res(result)), ms)) });
  it("returns early without a slow source and reports it", async () => {
    const t0 = Date.now();
    const { lists, failed } = await searchAll([eng("duckduckgo", 10, [{ title: "a", url: "https://a.com/" }]), eng("slow", 4000, [{ title: "b", url: "https://b.com/" }])], "q");
    expect(Date.now() - t0).toBeLessThan(2500);
    expect(Object.keys(lists)).toEqual(["duckduckgo"]);
    expect(failed).toEqual([{ id: "slow", name: "slow", reason: "too slow" }]);
  });
  it("doesn't let a fast secondary source cut off the main one", async () => {
    const { lists } = await searchAll([eng("wikipedia", 5, [{ title: "w", url: "https://w.org/" }]), eng("duckduckgo", 1800, [{ title: "d", url: "https://d.com/" }])], "q");
    expect(Object.keys(lists).sort()).toEqual(["duckduckgo", "wikipedia"]);
  });
  it("survives errors and empty answers", async () => {
    const { lists, failed } = await searchAll([eng("ok", 5, [{ title: "a", url: "https://a.com/" }]), eng("bad", 5, new Error("blocked")), eng("none", 5, [])], "q");
    expect(Object.keys(lists)).toEqual(["ok"]);
    expect(failed.map((f) => f.reason).sort()).toEqual(["blocked", "no results"]);
  });
  it("returns nothing, quickly, when every source fails", async () => {
    const { lists, failed } = await searchAll([eng("x", 5, new Error("down"))], "q");
    expect(lists).toEqual({});
    expect(failed).toHaveLength(1);
  });
});

describe("ranking weights", () => {
  it("lets a web result beat Wikipedia's equal rank", () => {
    const r = fuse({ wikipedia: [{ title: "Wiki", url: "https://en.wikipedia.org/wiki/X" }], duckduckgo: [{ title: "Web", url: "https://web.com/" }] });
    expect(r[0].url).toBe("https://web.com/");
  });
});

describe("bangs", () => {
  it("jump straight to the site without asking any search source", () => {
    expect(parseBang("!w black holes").url).toBe("https://en.wikipedia.org/w/index.php?search=black%20holes");
    expect(parseBang("react hooks !so").url).toBe("https://stackoverflow.com/search?q=react%20hooks");
    expect(parseBang("!g something")).toBeNull(); // no Google shortcut
    expect(parseBang("hello !!")).toBeNull();
  });
});

describe("pages", () => {
  it("escape everything and carry no scripts or remote resources", () => {
    const page = resultsPage({ query: '"><script>alert(1)</script>', results: [{ url: "https://a.com/?x=\"><img src=x>", title: "<b>T</b>", snippet: "<script>x</script>", sources: ["ddg", "wiki"], score: 1 }], summary: { title: "<i>W</i>", text: "<u>t</u>", url: "https://en.wikipedia.org/wiki/W" }, failed: [{ id: "m", name: "Marginalia", reason: "HTTP 500" }], engines: [{ id: "ddg", name: "DuckDuckGo" }, { id: "wiki", name: "Wikipedia" }], ms: 12 });
    expect(page).not.toMatch(/<script/i);
    expect(page).not.toContain("<img src=x>");
    expect(page).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(page).toContain("unavailable right now: Marginalia");
    expect(page).toContain('rel="noreferrer noopener"');
    expect(page).not.toMatch(/(src|href)="https?:\/\/(?!a\.com|en\.wikipedia)/);
    expect(homePage()).toContain("No Google");
  });
});
