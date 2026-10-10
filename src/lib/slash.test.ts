import { describe, expect, it } from "vitest";
import { parseSlash, slashMatches } from "./slash";

describe("slash commands", () => {
  it("expands known commands and passes the argument through", () => {
    expect(parseSlash("/compare battery life")).toMatchObject({ name: "compare", allTabs: true });
    expect(parseSlash("/compare battery life")!.prompt).toContain("battery life");
    expect(parseSlash("/Recall sourdough")).toMatchObject({ recall: true, prompt: "sourdough" });
    expect(parseSlash("/tldr")!.allTabs).toBeUndefined();
  });
  it("leaves ordinary text and unknown commands alone", () => {
    expect(parseSlash("hello")).toBeNull();
    expect(parseSlash("/etc/passwd please")).toBeNull();
    expect(parseSlash("/nope")).toBeNull();
  });
  it("suggests commands while typing", () => {
    expect(slashMatches("/co").map((c) => c.name)).toEqual(["compare"]);
    expect(slashMatches("/").length).toBeGreaterThan(4);
    expect(slashMatches("/compare x")).toEqual([]);
    expect(slashMatches("hi")).toEqual([]);
  });
});
