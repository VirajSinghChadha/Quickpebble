import { describe, expect, it } from "vitest";
import { buildReport, redact } from "./diagnostics.mjs";

describe("report redaction", () => {
  it("removes keys, tokens, emails, personal folders and query strings", () => {
    const text = [
      "key AIzaSyDUMMYDUMMYDUMMYDUMMYDUMMYDUMMY12345 failed",
      "sb_publishable_abcDEF123_xyz and sb_secret_hunter2",
      "jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJl",
      "Authorization: Bearer abcdefghijklmnop1234",
      "sk-proj-ABCDEFGHIJKLMNOPQRSTUV",
      "mail me at viraj@example.com",
      "/Users/suminsethi/Desktop/Claude folder/x.js and C:\\Users\\Alex\\file.txt",
      "GET https://example.com/path?token=SECRET&x=1 failed",
      "xsmtpsib-1234-abcdef",
    ].join("\n");
    const out = redact(text);
    for (const secret of ["AIzaSy", "sb_publishable_abc", "hunter2", "eyJhbGci", "abcdefghijklmnop1234", "sk-proj", "viraj@example.com", "suminsethi", "Alex", "SECRET", "xsmtpsib-1234"]) expect(out).not.toContain(secret);
    expect(out).toContain("[email]");
    expect(out).toContain("/Users/~/Desktop");
    expect(out).toContain("https://example.com/path?[query removed]");
  });
  it("leaves ordinary text alone", () => expect(redact("Could not reach Ollama. Start it with `ollama serve`.")).toBe("Could not reach Ollama. Start it with `ollama serve`."));
});

describe("report text", () => {
  const base = { version: "2.0.1", electron: "44.0.0", chrome: "130", settings: { theme: "dark", newtab_layout: "classic" } };
  it("has version and settings but no log unless asked", () => {
    const t = buildReport({ ...base, includeLog: false });
    expect(t).toMatch(/Quick Pebble 2.0.1/);
    expect(t).toMatch(/theme=dark/);
    expect(t).not.toMatch(/Recent warnings/);
  });
  it("adds the log when the person ticked the box, still redacted", () => {
    const t = buildReport({ ...base, includeLog: true, extra: ["12:00:00 error key AIzaSyDUMMYDUMMYDUMMYDUMMYDUMMYDUMMY12345 bad"] });
    expect(t).toMatch(/Recent warnings and errors/);
    expect(t).not.toContain("AIzaSy");
  });
  it("is capped", () => expect(buildReport({ ...base, includeLog: true, extra: Array(5000).fill("x".repeat(100)) }).length).toBeLessThanOrEqual(30000));
});
