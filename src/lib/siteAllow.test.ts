import { describe, expect, it } from "vitest";
import { addSite, hostOfUrl, isSiteAllowed, parseSites, removeSite } from "./siteAllow";

describe("allow everything on a website", () => {
  it("reduces a page address to its host", () => {
    expect(hostOfUrl("https://www.educationperfect.com/app/x?y=1")).toBe("educationperfect.com");
    expect(hostOfUrl("javascript:alert(1)")).toBeNull();
    expect(hostOfUrl("file:///etc/passwd")).toBeNull();
    expect(hostOfUrl("https://localhost:3000")).toBeNull();
    expect(hostOfUrl("nonsense")).toBeNull();
  });
  it("keeps only well-formed hosts from storage", () => {
    expect(parseSites('["a.com","<b>.com","a.com",5,"x y.com"]')).toEqual(["a.com"]);
    expect(parseSites("broken")).toEqual([]);
    expect(parseSites('{"a":1}')).toEqual([]);
  });
  it("matches the site and its subdomains, not look-alikes", () => {
    const s = ["educationperfect.com"];
    expect(isSiteAllowed(s, "https://app.educationperfect.com/x")).toBe(true);
    expect(isSiteAllowed(s, "https://educationperfect.com")).toBe(true);
    expect(isSiteAllowed(s, "https://evileducationperfect.com")).toBe(false);
    expect(isSiteAllowed(s, "https://educationperfect.com.evil.io")).toBe(false);
    expect(isSiteAllowed(s, "")).toBe(false);
  });
  it("adds and removes", () => {
    expect(addSite([], "a.com")).toEqual(["a.com"]);
    expect(addSite(["a.com"], "a.com")).toEqual(["a.com"]);
    expect(addSite([], "bad host")).toEqual([]);
    expect(removeSite(["a.com", "b.com"], "a.com")).toEqual(["b.com"]);
  });
});
