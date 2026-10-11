import { describe, expect, it } from "vitest";
import { barBounds, lingerMs, sanitizeState, STALE_MS } from "./overlay-state.mjs";

describe("status bar state", () => {
  it("keeps valid updates and trims long text", () => {
    const s = sanitizeState({ phase: "thinking", thinking: "x".repeat(900), next: "  Click\n the button  ", step: 3, max: 40 });
    expect(s.phase).toBe("thinking");
    expect(s.thinking).toHaveLength(420);
    expect(s.next).toBe("Click the button");
    expect([s.step, s.max]).toEqual([3, 40]);
  });
  it("drops anything unexpected", () => {
    expect(sanitizeState(null).phase).toBe("idle");
    expect(sanitizeState({ phase: "<script>" }).phase).toBe("idle");
    const s = sanitizeState({ phase: "acting", thinking: { evil: 1 }, next: 7, step: -1, max: 1e9 });
    expect(s).toEqual({ phase: "acting", thinking: "", next: "", step: undefined, max: undefined });
  });
  it("sits at the bottom centre of the work area, inside it", () => {
    const b = barBounds({ x: 0, y: 25, width: 1440, height: 875 });
    expect(b.x + b.width / 2).toBe(720);
    expect(b.y + b.height).toBeLessThan(900);
    expect(b.y).toBeGreaterThan(25);
    const small = barBounds({ x: 0, y: 0, width: 400, height: 600 });
    expect(small.width).toBeLessThanOrEqual(400 - 24);
  });
  it("hides itself only after a finished or failed task", () => {
    expect(lingerMs("done")).toBe(5000);
    expect(lingerMs("error")).toBe(8000);
    expect(lingerMs("acting")).toBeNull();
    expect(lingerMs("idle")).toBe(0);
  });
  it("treats a working state with no news as stale after 90 seconds", () => {
    expect(STALE_MS).toBe(90000);
    expect(lingerMs("acting") ?? STALE_MS).toBe(90000);
  });
});
