import { describe, expect, it } from "vitest";
import { formatBytes, timeAgo } from "./format";

describe("format", () => {
  it("formats sizes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5 MB");
    expect(formatBytes(250 * 1024 * 1024)).toBe("250 MB");
    expect(formatBytes(null)).toBe("");
    expect(formatBytes(-1)).toBe("");
  });

  it("formats ages", () => {
    const now = 1_000_000_000_000;
    const s = now / 1000;
    expect(timeAgo(s - 5, now)).toBe("just now");
    expect(timeAgo(s - 300, now)).toBe("5 min ago");
    expect(timeAgo(s - 7200, now)).toBe("2 h ago");
    expect(timeAgo(s - 3 * 86400, now)).toBe("3 d ago");
    expect(timeAgo(s + 100, now)).toBe("just now");
  });
});
