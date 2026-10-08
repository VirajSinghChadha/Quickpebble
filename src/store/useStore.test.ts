import { describe, expect, it } from "vitest";
import { makeTab, nextActiveAfterClose, sortTabs } from "./useStore";

// crypto.randomUUID exists in Node 20+, so makeTab works without a DOM.
describe("tab helpers", () => {
  it("sorts pinned first and keeps relative order", () => {
    const [a, b, c] = [makeTab(), makeTab({ pinned: true }), makeTab()];
    expect(sortTabs([a, b, c]).map((t) => t.id)).toEqual([b.id, a.id, c.id]);
  });
  it("picks the right neighbour after close", () => {
    const [a, b, c] = [makeTab(), makeTab(), makeTab()];
    expect(nextActiveAfterClose([a, b, c], b.id)).toBe(c.id);
    expect(nextActiveAfterClose([a, b, c], c.id)).toBe(b.id);
    expect(nextActiveAfterClose([a], a.id)).toBeNull();
  });
});
