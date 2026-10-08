import { describe, expect, it } from "vitest";
import { displayUrl, hostOf, tabLabel } from "./url";

describe("url helpers", () => {
  it("strips www and root path", () => {
    expect(displayUrl("https://www.example.com/")).toBe("example.com");
    expect(displayUrl("https://example.com/a?b=1")).toBe("example.com/a?b=1");
  });
  it("tolerates garbage", () => {
    expect(hostOf("not a url")).toBe("");
    expect(displayUrl("nope")).toBe("nope");
  });
  it("labels tabs", () => {
    expect(tabLabel("", "")).toBe("New Tab");
    expect(tabLabel("  Hi ", "https://a.com")).toBe("Hi");
    expect(tabLabel("", "https://www.a.com")).toBe("a.com");
  });
});
