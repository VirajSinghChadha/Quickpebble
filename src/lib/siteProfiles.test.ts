import { describe, expect, it } from "vitest";
import { parseProfiles, withProfile } from "./siteProfiles";

describe("site profiles", () => {
  it("stores and removes per-site choices", () => {
    const a = withProfile(undefined, "ep.com", { zoom: 1.25, muted: true });
    expect(parseProfiles(a)["ep.com"]).toEqual({ zoom: 1.25, muted: true });
    const b = withProfile(a, "news.com", { trackers: false });
    expect(Object.keys(parseProfiles(b)).sort()).toEqual(["ep.com", "news.com"]);
    expect(parseProfiles(withProfile(b, "ep.com", null))["ep.com"]).toBeUndefined();
  });

  it("drops empty profiles and clamps bad data", () => {
    expect(parseProfiles(withProfile(undefined, "x.com", {}))).toEqual({});
    expect(parseProfiles('{"x.com":{"zoom":99,"trackers":"yes"}}')["x.com"]).toEqual({ zoom: 3 });
    expect(parseProfiles("{nope")).toEqual({});
  });
});
