import { describe, expect, it } from "vitest";
import { guideFor } from "./siteGuides";

describe("site guides", () => {
  it("switches on for Education Perfect and its subdomains only", () => {
    expect(guideFor("https://app.educationperfect.com/app/tasks")?.id).toBe("education-perfect");
    expect(guideFor("https://www.educationperfect.com/")?.id).toBe("education-perfect");
    expect(guideFor("https://educationperfect.com.evil.io/")).toBeNull();
    expect(guideFor("https://example.com")).toBeNull();
    expect(guideFor("")).toBeNull();
  });
  it("explains the ticks and simplifying, and includes the person's notes", () => {
    const g = guideFor("https://app.educationperfect.com/x")!;
    const t = g.text("fractions: type 3/4\npowers: x^2");
    expect(t).toMatch(/GREEN tick means the answer is correct/);
    expect(t).toMatch(/BLUE tick means the answer is on the right track/);
    expect(t).toMatch(/FULLY SIMPLIFIED/);
    expect(t).toContain("fractions: type 3/4");
    expect(g.text("")).toMatch(/has not written down their shortcuts/);
  });
  it("caps how much of the notes is sent", () => {
    expect(guideFor("https://app.educationperfect.com")!.text("x".repeat(9000)).length).toBeLessThan(3500);
  });
});
