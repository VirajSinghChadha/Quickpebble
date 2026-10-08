import { describe, expect, it } from "vitest";
import { generatePassword, strength } from "./passwords";

describe("passwords", () => {
  it("generates the requested length with every character class", () => {
    for (let i = 0; i < 50; i++) {
      const p = generatePassword(16, true);
      expect(p).toHaveLength(16);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/\d/);
      expect(p).toMatch(/[^A-Za-z0-9]/);
    }
  });

  it("can leave out symbols and clamps silly lengths", () => {
    expect(generatePassword(20, false)).toMatch(/^[A-Za-z0-9]+$/);
    expect(generatePassword(1)).toHaveLength(8);
    expect(generatePassword(500)).toHaveLength(64);
  });

  it("does not repeat itself", () => {
    expect(new Set(Array.from({ length: 20 }, () => generatePassword())).size).toBe(20);
  });

  it("rates strength", () => {
    expect(strength("abc")).toBe("weak");
    expect(strength("Passw0rd12")).toBe("okay");
    expect(strength("correct-Horse-battery-9")).toBe("strong");
  });
});
