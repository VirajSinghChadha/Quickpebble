import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { Db } from "./db.mjs";
import { docxText, FileIndex, fileText, htmlText, rtfText } from "./fileindex.mjs";
import { collapse, dayBounds, Timeline } from "./timeline.mjs";
import { noteTracker } from "./adblock.mjs";

const dirs = [];
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "qp-know-")); dirs.push(d); return d; };

/** The smallest real PDF with one line of text (xref offsets are computed so it is valid). */
function tinyPdf(text) {
  const objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>"];
  const stream = `BT /F1 18 Tf 20 80 Td (${text}) Tj ET`;
  objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  let out = "%PDF-1.4\n";
  const offsets = objs.map((o, i) => { const at = out.length; out += `${i + 1} 0 obj\n${o}\nendobj\n`; return at; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, "latin1");
}
const tinyDocx = (text) => Buffer.from(zipSync({ "word/document.xml": strToU8(`<w:document><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`) }));

describe("reading files", () => {
  it("gets plain text out of HTML, RTF and Word", () => {
    expect(htmlText("<p>Hi&nbsp;<b>there</b></p><script>evil()</script><p>A &amp; B</p>")).toBe("Hi there\nA & B");
    expect(rtfText("{\\rtf1\\ansi{\\fonttbl\\f0 Helvetica;}\\f0\\fs24 Volcano notes\\par Lava}")).toMatch(/Volcano notes\s+Lava/);
    expect(docxText(tinyDocx("Electricity bill October"))).toBe("Electricity bill October");
  });
  it("reads the text of a real PDF", async () => {
    const d = tmp();
    fs.writeFileSync(path.join(d, "a.pdf"), tinyPdf("Photosynthesis needs sunlight"));
    expect(await fileText(path.join(d, "a.pdf"))).toContain("Photosynthesis needs sunlight");
  });
});

describe("answer from my files", () => {
  it("indexes chosen folders, skips protected ones, keeps up with changes and finds excerpts", async () => {
    const d = tmp();
    fs.mkdirSync(path.join(d, "Private"));
    fs.writeFileSync(path.join(d, "volcano.md"), "# Volcanoes\nMagma rises through the crust and erupts as lava.");
    fs.writeFileSync(path.join(d, "bill.pdf"), tinyPdf("Electricity bill total 84 dirhams"));
    fs.writeFileSync(path.join(d, "essay.docx"), tinyDocx("The French revolution began in 1789"));
    fs.writeFileSync(path.join(d, "Private", "diary.txt"), "secret magma thoughts");
    fs.writeFileSync(path.join(d, "photo.jpg"), "not text");
    const idx = new FileIndex(new Db(":memory:"), { guarded: () => [path.join(d, "Private")] });
    idx.addFolder(d);
    const first = await idx.indexFolder(d);
    expect(first.files).toBe(3);
    expect(idx.search("magma lava").map((h) => h.name)).toEqual(["volcano.md"]);
    expect(idx.search("electricity bill")[0].name).toBe("bill.pdf");
    expect(idx.search("revolution 1789")[0].snippet).toMatch(/1789/);
    fs.writeFileSync(path.join(d, "volcano.md"), "Now about glaciers only.");
    fs.utimesSync(path.join(d, "volcano.md"), new Date(), new Date(Date.now() + 5000));
    fs.rmSync(path.join(d, "essay.docx"));
    await idx.indexFolder(d);
    expect(idx.search("magma")).toEqual([]);
    expect(idx.search("glaciers")[0].name).toBe("volcano.md");
    expect(idx.search("revolution")).toEqual([]);
    expect(idx.folders()[0]).toMatchObject({ path: path.resolve(d), files: 2 });
    idx.removeFolder(d);
    expect(idx.search("glaciers")).toEqual([]);
    expect(idx.stats()).toEqual({ folders: 0, files: 0 });
  });
  it("refuses system folders and limits how many folders", () => {
    const idx = new FileIndex(new Db(":memory:"));
    expect(() => idx.addFolder("/usr/lib")).toThrow(/System/);
    expect(() => idx.addFolder("/")).toThrow(/whole disk/);
  });
});

describe("timeline", () => {
  const ON = (db) => db.setSetting("timeline_enabled", "1");
  it("knows where a day starts and ends", () => {
    const [a, b] = dayBounds("2026-10-11", 0);
    expect(new Date(a * 1000).toISOString()).toBe("2026-10-11T00:00:00.000Z");
    expect(b - a).toBe(86400);
    expect(() => dayBounds("yesterday")).toThrow();
  });
  it("records nothing while off, and only web pages and tasks while on", () => {
    const db = new Db(":memory:");
    const t = new Timeline(db);
    expect(t.note("page", "Cats", "https://cats.example")).toBe(false);
    ON(db);
    expect(t.note("page", "Cats", "https://cats.example")).toBe(true);
    expect(t.note("page", "Local", "file:///etc/passwd")).toBe(false);
    expect(t.note("evil", "x", "y")).toBe(false);
  });
  it("merges pages, downloads and clean-ups by time, and clear-all hides the past", () => {
    const db = new Db(":memory:");
    ON(db);
    const t = new Timeline(db);
    const day = new Date().toLocaleDateString("sv-SE");
    const now = Math.floor(Date.now() / 1000);
    t.note("page", "Volcano facts", "https://a.example/1", now - 300);
    t.note("page", "More volcano", "https://a.example/2", now - 200);
    t.note("task", "Assistant task: tidy my notes", "", now - 100);
    db.downloadsPut({ id: 1, name: "poster.pdf", url: "https://b.example/poster.pdf", path: "/x", ok: true, started: now - 50, finished: now - 40, size: 1 });
    const ev = t.day(day).events;
    expect(ev.map((e) => e.kind)).toEqual(["download", "task", "page"]);
    expect(ev[2]).toMatchObject({ site: "a.example", count: 2 });
    t.clear();
    expect(t.day(day).events).toEqual([]);
    db.setSetting("timeline_enabled", "0");
    expect(t.day(day)).toEqual({ on: false, events: [] });
  });
  it("collapses quick visits to the same site", () => {
    expect(collapse([{ kind: "page", site: "a", at: 1000 }, { kind: "page", site: "a", at: 900 }, { kind: "page", site: "b", at: 800 }]).map((e) => e.count ?? 1)).toEqual([2, 1]);
  });
});

describe("trackers per page", () => {
  it("counts each tracker host and starts over on a new site", () => {
    const m = new Map();
    noteTracker(m, 7, "news.example", "www.google-analytics.com", true);
    noteTracker(m, 7, "news.example", "www.google-analytics.com", false);
    noteTracker(m, 7, "news.example", "connect.facebook.net", false);
    expect([...m.get(7).hosts.entries()]).toEqual([["www.google-analytics.com", { count: 2, blocked: true }], ["connect.facebook.net", { count: 1, blocked: false }]]);
    noteTracker(m, 7, "shop.example", "ads.example", true);
    expect(m.get(7).hosts.size).toBe(1);
  });
});
