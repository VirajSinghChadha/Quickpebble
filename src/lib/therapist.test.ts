import { describe, expect, it } from "vitest";
import { makeTab } from "../store/useStore";
import { addSaved, analyze, categorize, findDuplicates, organize } from "./therapist";

const t = (url: string) => makeTab({ url });

describe("tab therapist", () => {
  it("protects active and pinned duplicates regardless of their position", () => {
    const a = t("https://a.com/");
    const active = t(a.url);
    const pinned = makeTab({ url: a.url, pinned: true });
    const other = t(a.url);
    expect(findDuplicates([a, active, pinned, other], active.id).map((x) => x.id)).toEqual([a.id, other.id]);
    expect(findDuplicates([pinned, active, a, other], active.id).map((x) => x.id)).toEqual([a.id, other.id]);
  });
  it("keeps the first copy and flags later duplicates", () => {
    const [a, b, c] = [t("https://a.com/"), t("https://a.com/"), t("https://b.com/")];
    expect(findDuplicates([a, b, c]).map((x) => x.id)).toEqual([b.id]);
  });
  it("ignores blank tabs", () => {
    expect(findDuplicates([t(""), t("")])).toHaveLength(0);
  });
  it("scores like the original extension", () => {
    const tabs = Array.from({ length: 12 }, (_, i) => t(`https://x.com/${i}`));
    expect(analyze(tabs, tabs[0].id).score).toBe(96); // 100 - (12-10)*2
    expect(analyze([t("https://a.com/")], "").message).toMatch(/healthy/);
    const many = Array.from({ length: 60 }, (_, i) => t(`https://x.com/${i}`));
    expect(analyze(many, many[0].id).score).toBeLessThan(40);
  });
  it("categorises by hostname, not substring", () => {
    expect(categorize("https://www.youtube.com/watch")).toBe("Entertainment");
    expect(categorize("https://gist.github.com/x")).toBe("Work");
    expect(categorize("https://evil.com/?u=github.com")).toBeNull();
  });
  it("only groups categories with two or more tabs", () => {
    const [y1, y2, g1] = [t("https://youtube.com/a"), t("https://reddit.com/b"), t("https://github.com/c")];
    const m = organize([y1, y2, g1]);
    expect(m.get(y1.id)).toBe("Entertainment");
    expect(m.has(g1.id)).toBe(false);
  });
  it("does not save the same URL twice", () => {
    const once = addSaved([], { title: "A", url: "https://a.com/", favicon: "" });
    expect(addSaved(once, { title: "A2", url: "https://a.com/", favicon: "" })).toHaveLength(1);
  });
});
