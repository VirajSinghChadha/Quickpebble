import { describe, expect, it } from "vitest";
import { rankUpgrades, wantsUpgrade } from "./models";

describe("models", () => {
  it("spots requests for more careful work", () => {
    expect(wantsUpgrade("Give me a detailed explanation")).toBe(true);
    expect(wantsUpgrade("be thorough please")).toBe(true);
    expect(wantsUpgrade("what is the weather")).toBe(false);
  });

  it("ranks real models above the light one, one per tier first", () => {
    const names = ["gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-3.5-flash", "gemini-3.8-pro", "gemini-3.8-flash-image", "text-embedding-004", "gemini-3.8-flash-001", "gemini-3.5-flash-tts"];
    const out = rankUpgrades(names, "gemini-3.5-flash-lite").map((m) => m.id);
    expect(out).toEqual(["gemini-3.8-pro", "gemini-3.8-flash", "gemini-3.5-flash"]);
  });

  it("offers nothing when already on the best", () => {
    expect(rankUpgrades(["gemini-3.8-pro", "gemini-3.5-flash-lite"], "gemini-3.8-pro")).toEqual([]);
  });
});
