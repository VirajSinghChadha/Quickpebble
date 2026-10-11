import { describe, expect, it } from "vitest";
import { chromeTime, isWebUrl, safariTime, walkSafari } from "./importer.mjs";

describe("importing from other browsers", () => {
  it("converts Chrome and Safari timestamps to unix seconds", () => {
    expect(chromeTime(13_370_000_000_000_000)).toBe(13_370_000_000 - 11_644_473_600);
    expect(safariTime(0)).toBe(978_307_200);
    expect(chromeTime(0)).toBe(0);
  });
  it("only keeps web addresses", () => {
    expect(isWebUrl("https://a.com")).toBe(true);
    expect(isWebUrl("javascript:alert(1)")).toBe(false);
    expect(isWebUrl("file:///etc/passwd")).toBe(false);
  });
  it("walks Safari bookmark folders and skips the reading list", () => {
    const tree = { Children: [
      { WebBookmarkType: "WebBookmarkTypeLeaf", URLString: "https://a.com", URIDictionary: { title: "A" } },
      { WebBookmarkType: "WebBookmarkTypeList", Title: "School", Children: [{ WebBookmarkType: "WebBookmarkTypeLeaf", URLString: "https://b.edu", URIDictionary: { title: "B" } }] },
      { WebBookmarkType: "WebBookmarkTypeList", Title: "com.apple.ReadingList", Children: [{ WebBookmarkType: "WebBookmarkTypeLeaf", URLString: "https://c.com" }] },
      { WebBookmarkType: "WebBookmarkTypeLeaf", URLString: "javascript:x" },
    ] };
    expect(walkSafari(tree)).toEqual([{ url: "https://a.com", title: "A", folder: "" }, { url: "https://b.edu", title: "B", folder: "School" }]);
  });
});
