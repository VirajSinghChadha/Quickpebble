import { describe, expect, it } from "vitest";
import { matchShortcut } from "./actions";

const ev = (key: string, o: Partial<KeyboardEvent> = {}) => ({ key, shiftKey: false, altKey: false, metaKey: false, ctrlKey: false, ...o });

describe("matchShortcut", () => {
  it("maps ⌘T on mac and Ctrl+T elsewhere", () => {
    expect(matchShortcut(ev("t", { metaKey: true }), true)).toBe("new-tab");
    expect(matchShortcut(ev("t", { ctrlKey: true }), false)).toBe("new-tab");
    expect(matchShortcut(ev("t", { ctrlKey: true }), true)).toBeNull();
  });
  it("requires shift for palette and tab search", () => {
    expect(matchShortcut(ev("P", { metaKey: true, shiftKey: true }), true)).toBe("palette");
    expect(matchShortcut(ev("p", { metaKey: true }), true)).toBeNull();
    expect(matchShortcut(ev("a", { metaKey: true, shiftKey: true }), true)).toBe("tab-search");
  });
  it("maps the extra shortcuts", () => {
    expect(matchShortcut(ev("T", { metaKey: true, shiftKey: true }), true)).toBe("reopen-tab");
    expect(matchShortcut(ev("j", { metaKey: true }), true)).toBe("assistant");
    expect(matchShortcut(ev("-", { ctrlKey: true }), false)).toBe("zoom-out");
  });
  it("ignores alt chords", () => {
    expect(matchShortcut(ev("t", { metaKey: true, altKey: true }), true)).toBeNull();
  });
});
