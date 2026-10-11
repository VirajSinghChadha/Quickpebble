import { describe, expect, it } from "vitest";
import { buildTranscript, chatTitle, cleanSummary, formatBytes, lastUsedLabel, lastWorkedLabel, MAX_CONTEXT_CHARS, plannedAction, projectBrief, projectContext } from "./context";

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


describe("squashing old chats", () => {
  it("builds a transcript from conversation turns only", () => {
    const t = buildTranscript([{ kind: "user", text: "hi" }, { kind: "step", text: "clicked" }, { kind: "assistant", text: "hello" }]);
    expect(t).toBe("Person: hi\nAssistant: hello");
  });
  it("keeps the start and the end of a very long conversation", () => {
    const items = Array.from({ length: 400 }, (_, i) => ({ kind: i % 2 ? "assistant" : "user", text: `line ${i} ` + "w".repeat(300) }));
    const t = buildTranscript(items, 5000);
    expect(t.length).toBeLessThan(5400);
    expect(t).toContain("line 0 ");
    expect(t).toContain("line 399 ");
    expect(t).toContain("left out");
  });
  it("cleans a model's summary", () => {
    expect(cleanSummary('```\n"You planned the fair project and chose a volcano."\n```')).toBe("You planned the fair project and chose a volcano.");
    expect(cleanSummary("ok")).toBe("");
    expect(cleanSummary("x".repeat(5000))).toHaveLength(1500);
  });
});

describe("project brief", () => {
  const now = new Date(2026, 9, 11, 15).getTime();           // Sunday 11 Oct 2026
  const at = (y: number, m: number, d: number) => new Date(y, m, d, 12).getTime() / 1000;
  it("names the day", () => {
    expect(lastWorkedLabel(at(2026, 9, 11), now)).toBe("today");
    expect(lastWorkedLabel(at(2026, 9, 10), now)).toBe("yesterday");
    expect(lastWorkedLabel(at(2026, 9, 6), now)).toBe("Tuesday");
    expect(lastWorkedLabel(at(2026, 9, 3), now)).toBe("3 Oct");
  });
  it("writes the one-line brief", () => {
    expect(projectBrief({ name: "Science fair", chats: 3, last_chat: at(2026, 9, 6), last_used: at(2026, 8, 1) }, now)).toBe("Science fair · 3 chats · last worked Tuesday");
    expect(projectBrief({ name: "Essay", chats: 1, last_chat: at(2026, 9, 11), last_used: 0 }, now)).toBe("Essay · 1 chat · last worked today");
    expect(projectBrief({ name: "New", chats: 0, last_chat: null, last_used: at(2026, 9, 10) }, now)).toBe("New · no chats yet · started yesterday");
  });
});

describe("what clearing does to each chat", () => {
  it("squashes only conversations with something in them that aren't summaries already", () => {
    expect(plannedAction({ messages: 10 }, "squash")).toBe("squash");
    expect(plannedAction({ messages: 2 }, "squash")).toBe("erase");
    expect(plannedAction({ messages: 10, summarized: true }, "squash")).toBe("erase");
    expect(plannedAction({ messages: 10 }, "erase")).toBe("erase");
    expect(plannedAction({}, "squash")).toBe("erase");
  });
});
