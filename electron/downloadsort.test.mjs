import path from "node:path";
import { describe, expect, it } from "vitest";
import { categoryOf, cleanSuggestion, isGenericName, plannedPath } from "./downloadsort.mjs";

describe("sorting downloads", () => {
  it("files by extension", () => {
    expect(categoryOf("photo.JPG")).toBe("Images");
    expect(categoryOf("Essay.docx")).toBe("Documents");
    expect(categoryOf("report.pdf")).toBe("PDFs");
    expect(categoryOf("data.csv")).toBe("Spreadsheets");
    expect(categoryOf("Quick Pebble.dmg")).toBe("Installers");
    expect(categoryOf("archive.tar.gz")).toBe("Archives");
    expect(categoryOf("mystery.xyz")).toBe("Other");
    expect(categoryOf("noextension")).toBe("Other");
  });
  it("only moves files that sit directly in Downloads, never overwriting", () => {
    const dir = path.resolve("/home/me/Downloads");
    const none = () => false;
    expect(plannedPath(dir, path.join(dir, "cat.png"), none)).toBe(path.join(dir, "Images", "cat.png"));
    expect(plannedPath(dir, path.join(dir, "Images", "cat.png"), none)).toBeNull();          // already in a subfolder
    expect(plannedPath(dir, path.resolve("/etc/passwd"), none)).toBeNull();                    // outside Downloads
    expect(plannedPath(dir, path.resolve("/home/me/Downloads/../Documents/a.pdf"), none)).toBeNull();
    const taken = new Set([path.join(dir, "Images", "cat.png"), path.join(dir, "Images", "cat (1).png")]);
    expect(plannedPath(dir, path.join(dir, "cat.png"), (p) => taken.has(p))).toBe(path.join(dir, "Images", "cat (2).png"));
  });
});

describe("unclear names", () => {
  it("spots names that say nothing", () => {
    for (const n of ["download.pdf", "download (3).pdf", "image.png", "file_12.zip", "Untitled.docx", "1234567890.jpg", "3f2a9c1d8e7b6a5f4e3d2c1b0a9f8e7d.pdf", "550e8400-e29b-41d4-a716-446655440000.png", "report (2).pdf", "attachment.pdf", ".pdf"]) expect(isGenericName(n), n).toBe(true);
  });
  it("leaves clear names alone", () => {
    for (const n of ["Science fair poster.pdf", "invoice-October.pdf", "Quick Pebble 1.3.0.dmg", "resume_viraj.docx", "volcano.png"]) expect(isGenericName(n), n).toBe(false);
  });
  it("turns a model's suggestion into a safe file name", () => {
    expect(cleanSuggestion('"Volcano science fair poster"', ".pdf")).toBe("Volcano science fair poster.pdf");
    expect(cleanSuggestion("Volcano poster.pdf", ".pdf")).toBe("Volcano poster.pdf");
    expect(cleanSuggestion("../../etc/passwd", ".pdf")).toBe("etc passwd.pdf");
    expect(cleanSuggestion("a/b\\c:d", ".png")).toBe("a b c d.png");
    expect(cleanSuggestion("UNKNOWN", ".pdf")).toBeNull();
    for (const bad of ["", "ab", "x".repeat(200), "download", "   "]) expect(cleanSuggestion(bad, ".pdf"), bad).toBeNull();
    expect(cleanSuggestion("A".repeat(80), ".pdf")?.length).toBeLessThanOrEqual(64);
  });
});
