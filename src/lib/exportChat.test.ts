import { describe, expect, it } from "vitest";
import { chatToMarkdown } from "./exportChat";

describe("chatToMarkdown", () => {
  it("exports turns and sources but not step logs", () => {
    const md = chatToMarkdown([
      { id: 1, kind: "user", text: "Why?" },
      { id: 2, kind: "step", text: "clicked", ok: true },
      { id: 3, kind: "assistant", text: "Because [1]", sources: [{ id: 1, title: "A [x]", url: "https://a.com/", text: "" }] },
    ], new Date("2026-01-02T00:00:00Z"));
    expect(md).toContain("2026-01-02");
    expect(md).toContain("**You:** Why?");
    expect(md).toContain("1. [A x](https://a.com/)");
    expect(md).not.toContain("clicked");
  });
});
