import { describe, expect, it } from "vitest";
import { orderForStrip, toggled } from "./tabGroups";
import type { Tab } from "../store/useStore";

const t = (id: string, group: Tab["group"] = null, pinned = false) => ({ id, group, pinned }) as Tab;
const ids = (items: ReturnType<typeof orderForStrip>) => items.map((i) => (i.kind === "tab" ? i.tab.id : `[${i.group}${i.collapsed ? "-" : "+"}${i.count}]`));

describe("tab strip order", () => {
  const tabs = [t("a", "Work"), t("p", null, true), t("b"), t("c", "Work"), t("d", "School")];
  const groups = ["School", "Work", "Personal"] as const;

  it("puts pinned first, then loose tabs, then each group under its header", () => {
    expect(ids(orderForStrip(tabs, groups, new Set(), "b"))).toEqual(["p", "b", "[School+1]", "d", "[Work+2]", "a", "c"]);
  });

  it("hides a collapsed group's tabs but keeps the active one visible", () => {
    expect(ids(orderForStrip(tabs, groups, new Set(["Work"]), "b"))).toEqual(["p", "b", "[School+1]", "d", "[Work-2]"]);
    expect(ids(orderForStrip(tabs, groups, new Set(["Work"]), "c"))).toEqual(["p", "b", "[School+1]", "d", "[Work-2]", "c"]);
  });

  it("never collapses pinned or ungrouped tabs, and skips empty groups", () => {
    const out = ids(orderForStrip(tabs, groups, new Set(["School", "Work", "Personal"]), "p"));
    expect(out).toContain("p");
    expect(out).toContain("b");
    expect(out.some((x) => x.startsWith("[Personal"))).toBe(false);
  });

  it("toggles without mutating", () => {
    const s = new Set(["a"]);
    expect([...toggled(s, "b")]).toEqual(["a", "b"]);
    expect([...toggled(s, "a")]).toEqual([]);
    expect([...s]).toEqual(["a"]);
  });
});
