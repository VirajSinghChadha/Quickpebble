import { describe, expect, it } from "vitest";
import { defaultPerms, hostOf, loadPerms, savePerms } from "./permissions";

describe("permissions", () => {
  it("derives a host and falls back for no page", () => {
    expect(hostOf("https://www.example.com/a?b=1")).toBe("example.com");
    expect(hostOf("")).toBe("this computer");
    expect(hostOf("not a url")).toBe("this computer");
  });

  it("saves per site and loads them back, merging with defaults", () => {
    const p = { ...defaultPerms(), purchases: true };
    const json = savePerms(undefined, "shop.com", p);
    expect(loadPerms(json, "shop.com")?.purchases).toBe(true);
    expect(loadPerms(json, "other.com")).toBeNull();
    const both = savePerms(json, "a.com", defaultPerms());
    expect(loadPerms(both, "shop.com")?.purchases).toBe(true);
  });

  it("ignores malformed saved data", () => {
    expect(loadPerms("{nope", "x.com")).toBeNull();
    expect(loadPerms('{"x.com":{"purchases":"yes"}}', "x.com")?.purchases).toBe(false);
  });
});
