import { describe, expect, it } from "vitest";
import { chunk, parseTranslation, translatePage, type Item, type TranslateIO } from "./translate";

describe("translate", () => {
  it("chunks by size and keeps order", () => {
    const items: Item[] = [[0, "a".repeat(1000)], [1, "b".repeat(1000)], [2, "c".repeat(1000)], [3, "d"]];
    const out = chunk(items, 2400);
    expect(out.map((b) => b.map((x) => x[0]))).toEqual([[0, 1], [2, 3]]);
    expect(chunk([[0, "x".repeat(5000)]], 2400)).toHaveLength(1);
    expect(chunk([])).toEqual([]);
  });

  it("accepts only replies with exactly the right shape", () => {
    expect(parseTranslation('{"t":["uno","dos"]}', 2)).toEqual(["uno", "dos"]);
    expect(parseTranslation('Here you go: {"t":["uno"]}', 2)).toBeNull();
    expect(parseTranslation('["uno","dos"]', 2)).toEqual(["uno", "dos"]);
    expect(parseTranslation('{"t":["uno",2]}', 2)).toBeNull();
    expect(parseTranslation("nope", 1)).toBeNull();
  });

  function io(over: Partial<TranslateIO> = {}) {
    const applied: [number, string][] = [];
    const base: TranslateIO = {
      collect: async () => ({ items: [[0, "Hello"], [1, "World"]], lang: "en" }),
      apply: async (p) => void applied.push(...p),
      chat: async (_s, m) => JSON.stringify({ t: (JSON.parse(m[0].content) as string[]).map((x) => x.toUpperCase()) }),
      progress: () => {},
      ...over,
    };
    return { base, applied };
  }

  it("translates every batch and applies it in place", async () => {
    const { base, applied } = io();
    const r = await translatePage("Spanish", base, { aborted: false });
    expect(r).toEqual({ translated: 2, failedBatches: 0, total: 2 });
    expect(applied).toEqual([[0, "HELLO"], [1, "WORLD"]]);
  });

  it("retries a bad reply once, then skips the batch without half-applying", async () => {
    let calls = 0;
    const { base, applied } = io({ chat: async () => (calls++, '{"t":["only one"]}') });
    const r = await translatePage("French", base, { aborted: false });
    expect(calls).toBe(2);
    expect(r.failedBatches).toBe(1);
    expect(applied).toEqual([]);
  });

  it("stops when aborted", async () => {
    const { base, applied } = io();
    await translatePage("German", base, { aborted: true });
    expect(applied).toEqual([]);
  });
});
