import { describe, expect, it } from "vitest";
import { makeTab, nextActiveAfterClose, sortTabs, useStore } from "./useStore";

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

describe("crash recovery state", () => {
  const event = (id: string, over: Record<string, unknown> = {}) => ({ window: "main", id, url: "https://a.example", title: "A", favicon: "", audible: false, recording: false, loading: false, suspended: false, muted: false, ...over });
  it("new tabs are not crashed and start at the top of the page", () => {
    expect(makeTab()).toMatchObject({ crashed: false, scrollY: 0 });
  });
  it("a tab event can mark a tab crashed and clear it again", () => {
    const t = makeTab({ url: "https://a.example" });
    useStore.setState({ tabs: [t], activeId: t.id });
    useStore.getState().applyEvent(event(t.id, { crashed: true }));
    expect(useStore.getState().tabs[0].crashed).toBe(true);
    useStore.getState().applyEvent(event(t.id));
    expect(useStore.getState().tabs[0].crashed).toBe(false);
  });
  it("remembers how far down a page was scrolled, and keeps it when an event doesn't say", () => {
    const t = makeTab({ url: "https://a.example" });
    useStore.setState({ tabs: [t], activeId: t.id });
    useStore.getState().applyEvent(event(t.id, { scrollY: 1200 }));
    expect(useStore.getState().tabs[0].scrollY).toBe(1200);
    useStore.getState().applyEvent(event(t.id));
    expect(useStore.getState().tabs[0].scrollY).toBe(1200);
  });
});
