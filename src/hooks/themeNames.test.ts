import { describe, expect, it } from "vitest";
import { PRESETS, presetLabel } from "./useTheme";

describe("theme names", () => {
  it("every theme has a visible name, and two-colour themes say their colours", () => {
    expect(PRESETS.map((p) => p.name)).toEqual(["Pebble", "Ocean", "Forest", "Sunset", "Lavender", "Rose", "Graphite", "Aurora", "Sunrise", "Twilight"]);
    for (const p of PRESETS) expect(p.label.startsWith(p.name)).toBe(true);
    expect(presetLabel("aurora")).toBe("Aurora (teal + violet)");
    expect(presetLabel("sunrise")).toBe("Sunrise (orange + pink)");
    expect(presetLabel("twilight")).toBe("Twilight (indigo + cyan)");
    expect(presetLabel("nonsense")).toBe("Pebble");
  });
});
