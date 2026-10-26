import { describe, expect, it } from "vitest";
import { approvedPlanNote, normalizeSetting, parsePlan, planText, shouldPreview } from "./plan";

describe("plan preview", () => {
  it("reads a good plan", () => {
    const p = parsePlan('Sure! {"big": true, "steps": ["Open Notes", " Create a note ", "Type the list"]}');
    expect(p).toEqual({ big: true, steps: ["Open Notes", "Create a note", "Type the list"] });
  });
  it("rejects anything unusable", () => {
    for (const bad of ["", "no json", '{"steps": "open"}', '{"steps": []}', '{"big": true}', "{broken"]) expect(parsePlan(bad)).toBeNull();
  });
  it("trims and caps the steps", () => {
    const p = parsePlan(JSON.stringify({ big: false, steps: Array.from({ length: 30 }, (_, i) => `step ${i} ${"x".repeat(400)}`) }));
    expect(p?.steps).toHaveLength(10);
    expect(p?.steps[0].length).toBeLessThanOrEqual(160);
  });
  it("big only when the model says so exactly", () => {
    expect(parsePlan('{"big": "yes", "steps": ["a"]}')?.big).toBe(false);
  });
  it("decides when to show it", () => {
    const small = { big: false, steps: ["Open Notes"] };
    const big = { big: true, steps: ["a", "b", "c", "d", "e"] };
    expect(shouldPreview("big", big)).toBe(true);
    expect(shouldPreview("big", small)).toBe(false);
    expect(shouldPreview("always", small)).toBe(true);
    expect(shouldPreview("never", big)).toBe(false);
    expect(shouldPreview("big", null)).toBe(false);
  });
  it("defaults an unknown setting to big tasks only", () => {
    expect(normalizeSetting(undefined)).toBe("big");
    expect(normalizeSetting("sometimes")).toBe("big");
    expect(normalizeSetting("always")).toBe("always");
  });
  it("writes the plan and the instruction to follow it", () => {
    const plan = { big: true, steps: ["Open Notes", "Write"] };
    expect(planText(plan)).toBe("1. Open Notes\n2. Write");
    expect(approvedPlanNote(plan)).toMatch(/approved this plan[\s\S]*1\. Open Notes[\s\S]*ask the person/);
  });
});


describe("plan preview in auto mode", () => {
  it("skips the big-task preview unless the setting is always", () => {
    const big = { big: true, steps: ["a"] };
    expect(shouldPreview("big", big, false)).toBe(true);
    expect(shouldPreview("big", big, true)).toBe(false);
    expect(shouldPreview("always", big, true)).toBe(true);
    expect(shouldPreview("never", big, false)).toBe(false);
  });
});
