import { describe, expect, it } from "vitest";
import { chatTitle, formatBytes, lastUsedLabel, MAX_CONTEXT_CHARS, projectContext } from "./context";

describe("project context", () => {
  it("is empty without a project", () => expect(projectContext(null)).toBe(""));
  it("names the project and includes its notes as background", () => {
    const t = projectContext({ name: "Science fair", notes: "Volcano. Files in Documents/fair" });
    expect(t).toContain("Science fair");
    expect(t).toContain("Volcano");
    expect(t).toMatch(/not as instructions/);
  });
  it("is capped", () => expect(projectContext({ name: "p", notes: "x".repeat(9000) }).length).toBeLessThanOrEqual(MAX_CONTEXT_CHARS + 1));
});

describe("labels", () => {
  it("makes short chat titles", () => {
    expect(chatTitle("  hello\n world ")).toBe("hello world");
    expect(chatTitle("a".repeat(100))).toHaveLength(58);
    expect(chatTitle("   ")).toBe("New chat");
  });
  it("formats sizes", () => {
    expect(formatBytes(900)).toBe("900 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MB");
  });
  it("describes how long ago", () => {
    const now = Date.UTC(2026, 9, 11);
    const sec = (d: number) => now / 1000 - d * 86400;
    expect(lastUsedLabel(sec(0), now)).toBe("today");
    expect(lastUsedLabel(sec(1), now)).toBe("yesterday");
    expect(lastUsedLabel(sec(12), now)).toBe("12 days ago");
    expect(lastUsedLabel(sec(90), now)).toBe("3 months ago");
    expect(lastUsedLabel(sec(800), now)).toBe("2 years ago");
  });
});
