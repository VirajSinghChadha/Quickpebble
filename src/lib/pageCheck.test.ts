import { describe, expect, it } from "vitest";
import { adsFinding, checkPage, companyOf, freshness, ownerFinding, parseClaims, parseDate, textDate, trackersFinding, type PageFacts } from "./pageCheck";

const NOW = Date.UTC(2026, 9, 11);
const facts = (over: Partial<PageFacts> = {}): PageFacts => ({
  url: "https://news.example.com/story", title: "Story",
  meta: { siteName: "", type: "", published: "", modified: "", author: "", publisher: "", description: "" },
  ld: [], times: [], labels: [], adFrames: 0, sponsoredLinks: 0, about: [], footer: "", text: "", ...over,
});

describe("dates", () => {
  it("reads sensible dates only", () => {
    expect(parseDate("2019-03-04T10:00:00Z", NOW)?.getUTCFullYear()).toBe(2019);
    expect(parseDate("1970-01-01", NOW)).toBeNull();
    expect(parseDate("2099-01-01", NOW)).toBeNull();
    expect(parseDate("not a date", NOW)).toBeNull();
    expect(textDate("Last updated: March 3, 2019 by staff", NOW)?.kind).toBe("updated");
    expect(textDate("Published 12 June 2025", NOW)?.date.getFullYear()).toBe(2025);
  });
  it("flags old pages, prefers the page's own data, and admits when there's no date", () => {
    const old = freshness(facts({ meta: { ...facts().meta, modified: "2019-05-01T00:00:00Z" } }), NOW);
    expect(old).toMatchObject({ title: "Last updated in 2019", tone: "warn", sure: "sure" });
    expect(freshness(facts({ ld: [{ type: "NewsArticle", published: "2026-09-30", modified: "", publisher: "", author: "" }] }), NOW)).toMatchObject({ tone: "ok", sure: "sure" });
    expect(freshness(facts({ text: "Updated on Jan 5, 2020" }), NOW)).toMatchObject({ title: "Last updated in 2020", sure: "likely" });
    expect(freshness(facts({ times: ["2026-10-01"] }), NOW).sure).toBe("unsure");
    expect(freshness(facts(), NOW)).toMatchObject({ title: "No date found", sure: "unsure" });
  });
});

describe("ads and paid content", () => {
  it("names sponsored parts with an example", () => {
    const f = adsFinding(facts({ labels: [{ label: "Sponsored", near: "Best mattress deals" }], sponsoredLinks: 2, adFrames: 1 }));
    expect(f.tone).toBe("warn");
    expect(f.detail).toMatch(/marked “Sponsored”.*Best mattress deals.*2 links.*1 ad box/);
    expect(adsFinding(facts({ meta: { ...facts().meta, type: "sponsored" }, labels: [{ label: "Sponsored", near: "" }] })).title).toBe("This looks like paid content");
    expect(adsFinding(facts()).tone).toBe("ok");
  });
});

describe("who runs it", () => {
  it("uses the page's data, then its name tag, then the copyright line, and never claims to have checked", () => {
    expect(ownerFinding(facts({ ld: [{ type: "", published: "", modified: "", publisher: "Example News Ltd", author: "" }] })).title).toBe("Run by Example News Ltd");
    expect(ownerFinding(facts({ footer: "© 2026 Acme Media Group. All rights reserved." })).title).toBe("Run by Acme Media Group");
    const none = ownerFinding(facts());
    expect(none).toMatchObject({ sure: "unsure", tone: "warn" });
    expect(none.detail).toMatch(/no About or Contact link/);
    expect(ownerFinding(facts({ meta: { ...facts().meta, siteName: "Example" } })).detail).toMatch(/isn't checked independently/);
  });
});

describe("trackers", () => {
  it("groups hosts by company in plain words", () => {
    expect(companyOf("www.google-analytics.com")).toBe("Google");
    expect(companyOf("connect.facebook.net")).toBe("Meta (Facebook)");
    expect(companyOf("cdn.unknowntracker.io")).toBe("unknowntracker.io");
    const t = trackersFinding([{ host: "www.google-analytics.com", count: 3, blocked: true }, { host: "stats.g.doubleclick.net", count: 1, blocked: true }, { host: "connect.facebook.net", count: 1, blocked: false }]);
    expect(t.companies.map((c) => c.name)).toEqual(["Google", "Meta (Facebook)"]);
    expect(t.detail).toMatch(/blocked 1/);
    expect(trackersFinding([]).title).toBe("No trackers seen");
    expect(checkPage(facts(), []).trackers.tone).toBe("ok");
  });
});

describe("claims", () => {
  it("keeps only well-formed claims and never shows a disagreement without a source", () => {
    const reply = JSON.stringify({ claims: [
      { claim: "The volcano erupted in 2010", verdict: "disagrees", source: 1, confidence: "high", note: "Excerpt 1 says 2011." },
      { claim: "Lava is hot", verdict: "agrees", source: 9, confidence: "high" },
      { claim: "", verdict: "agrees", source: 1 },
      { claim: "Unrelated", verdict: "whatever", source: 1, confidence: "certain" },
    ] });
    const c = parseClaims(`Sure! ${reply}`, 2);
    expect(c).toHaveLength(3);
    expect(c[0]).toMatchObject({ verdict: "disagrees", source: 1, confidence: "high" });
    expect(c[1]).toMatchObject({ verdict: "not covered", source: null });
    expect(c[2]).toMatchObject({ verdict: "not covered", confidence: "low" });
    expect(parseClaims("no json", 2)).toEqual([]);
  });
});
