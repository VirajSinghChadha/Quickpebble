import { describe, expect, it } from "vitest";
import { shouldShowTour, TOUR_STEPS, TOUR_VERSION, TOUR_WORDS } from "./tour";

describe("first-run tour", () => {
  it("fits in about a minute of reading", () => {
    expect(TOUR_STEPS.length).toBeGreaterThanOrEqual(5);
    expect(TOUR_STEPS.length).toBeLessThanOrEqual(8);
    expect(TOUR_WORDS).toBeLessThanOrEqual(260);   // ~ one minute at a relaxed reading pace, plus the clicks
  });
  it("every step says something clear", () => {
    for (const s of TOUR_STEPS) {
      expect(s.title.length).toBeGreaterThan(3);
      expect(s.body.length).toBeGreaterThan(40);
      expect(s.body.length).toBeLessThanOrEqual(330);
    }
  });
  it("covers sign-in, the assistant and permissions", () => {
    const all = TOUR_STEPS.map((s) => `${s.title} ${s.body}`).join(" ").toLowerCase();
    for (const word of ["signed in", "assistant", "asks before", "pause", "stop", "privacy", "project"]) expect(all).toContain(word);
  });
  it("only offers buttons that go somewhere real", () => {
    for (const s of TOUR_STEPS) if (s.action) expect(["settings", "assistant"]).toContain(s.action.target);
  });
  it("shows once per tour version", () => {
    expect(shouldShowTour(undefined)).toBe(true);
    expect(shouldShowTour("")).toBe(true);
    expect(shouldShowTour("v0")).toBe(true);
    expect(shouldShowTour(TOUR_VERSION)).toBe(false);
  });
});
