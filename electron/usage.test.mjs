import { describe, expect, it } from "vitest";
import { Db } from "./db.mjs";
import { DEFAULT_LIMIT, dayKey, level, UsageCounter } from "./usage.mjs";

const make = (start = new Date(2026, 9, 11, 10)) => {
  const clock = { now: start };
  const c = new UsageCounter(new Db(":memory:"), () => clock.now);
  return { c, clock };
};

describe("usage meter", () => {
  it("counts calls today and starts again tomorrow", () => {
    const { c, clock } = make();
    expect(c.summary()).toMatchObject({ calls: 0, limit: DEFAULT_LIMIT, level: "ok" });
    c.add(); c.add(3);
    expect(c.read()).toBe(4);
    clock.now = new Date(2026, 9, 12, 0, 5);
    expect(c.read()).toBe(0);
    c.add(2);
    expect(c.summary().calls).toBe(2);
  });
  it("ignores nonsense amounts", () => {
    const { c } = make();
    for (const bad of [0, -1, 1.5, NaN, 5000, "3", null, undefined]) c.add(bad);
    expect(c.read()).toBe(c.read());
    expect(c.read()).toBe(1);   // only the default call (undefined -> 1) counted
  });
  it("survives a corrupted stored value", () => {
    const { c } = make();
    c.db.setSetting("usage_today", "{not json");
    expect(c.read()).toBe(0);
    c.add(2);
    expect(c.read()).toBe(2);
  });
  it("warns at 80% and again at the limit", () => {
    expect(level(79, 100)).toBe("ok");
    expect(level(80, 100)).toBe("near");
    expect(level(100, 100)).toBe("over");
    expect(level(5, 0)).toBe("ok");
  });
  it("uses the person's own limit when sensible", () => {
    const { c } = make();
    c.db.setSetting("usage_limit", "250");
    expect(c.limit()).toBe(250);
    for (const bad of ["5", "abc", "1000000", ""]) { c.db.setSetting("usage_limit", bad); expect(c.limit()).toBe(DEFAULT_LIMIT); }
  });
  it("formats the day as local year-month-day", () => expect(dayKey(new Date(2026, 0, 5))).toBe("2026-01-05"));
});
