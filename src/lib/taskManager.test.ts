import { describe, expect, it } from "vitest";
import { barPercent, formatMb, weight } from "./taskManager";

describe("task manager helpers", () => {
  it("formats memory", () => {
    expect(formatMb(0)).toBe("0 MB");
    expect(formatMb(340.4)).toBe("340 MB");
    expect(formatMb(1536)).toBe("1.5 GB");
    expect(formatMb(-5)).toBe("0 MB");
  });
  it("labels heavy tabs", () => {
    expect(weight(120)).toBe("light");
    expect(weight(300)).toBe("heavy");
    expect(weight(900)).toBe("huge");
  });
  it("scales bars against the heaviest tab", () => {
    expect(barPercent(500, 500)).toBe(100);
    expect(barPercent(250, 500)).toBe(50);
    expect(barPercent(1, 500)).toBe(3);
    expect(barPercent(0, 500)).toBe(0);
    expect(barPercent(10, 0)).toBe(0);
  });
});
