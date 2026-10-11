import { describe, expect, it } from "vitest";
import { isFetchable, parseMeta } from "./linkpreview.mjs";

describe("link previews", () => {
  it("only fetches public https addresses", () => {
    expect(isFetchable("https://example.com/a")).toBe(true);
    for (const u of ["http://example.com", "https://localhost/x", "https://192.168.1.1/", "https://127.0.0.1", "https://[::1]/", "https://router.local/", "https://user:pw@example.com/", "https://intranet/", "file:///etc/passwd", "javascript:1", "nonsense"]) expect(isFetchable(u), u).toBe(false);
  });
  it("reads the title and description as plain text", () => {
    const m = parseMeta(`<html><head><title>Fallback &amp; co</title><meta property="og:title" content="Volcanoes &quot;explained&quot;"><meta name="description" content="How <b>lava</b> forms"></head>`);
    expect(m.title).toBe('Volcanoes "explained"');
    expect(m.description).toBe("How <b>lava</b> forms");
    expect(parseMeta("<title>  Just a title </title>")).toEqual({ title: "Just a title", description: "" });
    expect(parseMeta("no html here")).toEqual({ title: "", description: "" });
  });
});
