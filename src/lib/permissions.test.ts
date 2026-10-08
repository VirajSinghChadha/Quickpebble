import { describe, expect, it } from "vitest";
import { fallbackSite, hostOf, isAllowed, loadSite, parseGenerated, saveSite } from "./permissions";

describe("permissions", () => {
  it("derives a host and falls back for no page", () => {
    expect(hostOf("https://www.example.com/a?b=1")).toBe("example.com");
    expect(hostOf("")).toBe("this computer");
    expect(hostOf("not a url")).toBe("this computer");
  });

  it("parses a Gemini-written list and drops bad entries", () => {
    const reply = 'Sure! {"permissions":[{"id":"submit_quiz_answers","label":"Submit quiz answers","allowed":true},{"id":"skip_lessons","label":"Skip lessons","allowed":false},{"id":"Bad Id","label":"x"},{"id":"skip_lessons","label":"dup"},{"id":"buy_credits","label":"Buy credits","allowed":false}]}';
    const site = parseGenerated(reply)!;
    expect(site.items.map((i) => i.id)).toEqual(["submit_quiz_answers", "skip_lessons", "buy_credits"]);
    expect(isAllowed(site, "submit_quiz_answers")).toBe(true);
    expect(isAllowed(site, "skip_lessons")).toBe(false);
  });

  it("rejects unusable replies so the caller falls back", () => {
    expect(parseGenerated("no json")).toBeNull();
    expect(parseGenerated('{"permissions":[{"id":"a","label":"A"}]}')).toBeNull();
    expect(parseGenerated('{"permissions":"nope"}')).toBeNull();
  });

  it("saves per site and loads back; unknown categories are not allowed", () => {
    const site = parseGenerated('{"permissions":[{"id":"aa","label":"A","allowed":true},{"id":"bb","label":"B"},{"id":"cc","label":"C"}]}')!;
    const json = saveSite(undefined, "ep.com", site);
    const back = loadSite(json, "ep.com")!;
    expect(back.items).toHaveLength(3);
    expect(isAllowed(back, "aa")).toBe(true);
    expect(isAllowed(back, "zz")).toBe(false);
    expect(loadSite(json, "other.com")).toBeNull();
  });

  it("still reads the older flat format and ignores malformed data", () => {
    const old = '{"shop.com":{"purchases":true}}';
    expect(isAllowed(loadSite(old, "shop.com")!, "purchases")).toBe(true);
    expect(loadSite("{nope", "x.com")).toBeNull();
    expect(fallbackSite().items.length).toBe(6);
  });
});
