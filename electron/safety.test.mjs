import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Db } from "./db.mjs";
import { checkPath, checkRoot, isInside, parseProtected } from "./fsguard.mjs";
import { moveToTrash, trashInfo, trashTarget } from "./trash.mjs";
import { ActionLog, undoStep } from "./actionlog.mjs";
import { checkItems, describeItem, Tasks } from "./receipts.mjs";

const id = (p) => p;   // realpath stand-in: no symlinks
const L = { platform: "linux", home: "/home/me", realpath: id };

describe("protected and chosen folders", () => {
  it("knows what is inside what, without being fooled by look-alike names", () => {
    expect(isInside("/home/me/Downloads/a.pdf", "/home/me/Downloads", "linux")).toBe(true);
    expect(isInside("/home/me/Downloads2/a.pdf", "/home/me/Downloads", "linux")).toBe(false);
    expect(isInside("/home/me/Downloads/../Documents/a.pdf", "/home/me/Downloads", "linux")).toBe(false);
    expect(isInside("/Users/Me/downloads/A.pdf", "/Users/me/Downloads", "darwin")).toBe(true);    // macOS disks ignore case
    expect(isInside("/home/Me/downloads/A.pdf", "/home/me/Downloads", "linux")).toBe(false);
  });
  it("only allows paths strictly inside a chosen folder", () => {
    const roots = ["/home/me/Downloads"];
    expect(checkPath("/home/me/Downloads/a.pdf", { ...L, roots })).toBeNull();
    expect(checkPath("/home/me/Downloads/sub/b.png", { ...L, roots })).toBeNull();
    expect(checkPath("/home/me/Downloads", { ...L, roots })).toMatch(/too important|outside/);
    expect(checkPath("/home/me/Documents/x.pdf", { ...L, roots })).toMatch(/outside/);
    expect(checkPath("/home/me/Downloads/../Documents/x.pdf", { ...L, roots })).toMatch(/outside/);
    expect(checkPath("relative/a.pdf", { ...L, roots })).toMatch(/full file paths/);
    expect(checkPath("/home/me/Downloads/a\0.pdf", { ...L, roots })).toMatch(/usable/);
    expect(checkPath("/home/me/Downloads/a.pdf", { ...L, roots: [] })).toMatch(/No folder/);
  });
  it("never touches protected or system folders, even when they were chosen", () => {
    const guarded = ["/home/me/Downloads/Taxes"];
    expect(checkPath("/home/me/Downloads/Taxes/2025.pdf", { ...L, roots: ["/home/me/Downloads"], guarded })).toMatch(/protected/);
    expect(checkPath("/home/me/Downloads/Taxes", { ...L, roots: ["/home/me/Downloads"], guarded })).toMatch(/protected/);
    expect(checkPath("/usr/lib/x.so", { ...L, roots: ["/usr"] })).toMatch(/System/);
    expect(checkPath("/home/me/Library", { ...L, roots: ["/home/me"] })).toMatch(/too important/);
    expect(checkPath("/home/me/Library/Caches", { ...L, roots: ["/home/me/Library"] })).toMatch(/too important/);
    expect(checkPath("/home/me/Library/Caches/app.cache", { ...L, roots: ["/home/me/Library/Caches"] })).toBeNull();
  });
  it("follows symlinks in folders, so a link can't lead outside", () => {
    const fake = (p) => (p.startsWith("/home/me/Downloads/sneaky") ? p.replace("/home/me/Downloads/sneaky", "/etc") : p);
    expect(checkPath("/home/me/Downloads/sneaky/passwd", { ...L, roots: ["/home/me/Downloads"], realpath: fake })).toMatch(/System/);
    const real = fs.mkdtempSync(path.join(os.tmpdir(), "qp-guard-"));
    fs.mkdirSync(path.join(real, "inside"));
    fs.mkdirSync(path.join(real, "outside"));
    fs.symlinkSync(path.join(real, "outside"), path.join(real, "inside", "link"));
    expect(checkPath(path.join(real, "inside", "link", "f.txt"), { roots: [path.join(real, "inside")] })).toMatch(/outside/);
    expect(checkPath(path.join(real, "inside", "f.txt"), { roots: [path.join(real, "inside")] })).toBeNull();
    // A destination folder that doesn't exist yet, under a symlinked parent (macOS: /var -> /private/var), still counts as inside.
    expect(checkPath(path.join(real, "inside", "New", "Deeper", "f.txt"), { roots: [path.join(real, "inside")] })).toBeNull();
    fs.rmSync(real, { recursive: true });
  });
  it("lets people pick ordinary folders, not system ones or the whole disk", () => {
    expect(checkRoot("/home/me/Downloads", L)).toBeNull();
    expect(checkRoot("/etc", L)).toMatch(/System/);
    expect(checkRoot("/", L)).toMatch(/whole disk/);
    expect(checkRoot("/home/me/Secret/x", { ...L, guarded: ["/home/me/Secret"] })).toMatch(/protected/);
  });
  it("reads the protected list setting safely", () => {
    expect(parseProtected('["/a","/a","relative",5,"/b/../c"]')).toEqual([path.resolve("/a"), path.resolve("/c")]);
    expect(parseProtected("not json")).toEqual([]);
    expect(parseProtected(JSON.stringify(Array.from({ length: 80 }, (_, i) => `/f${i}`)))).toHaveLength(50);
  });
});

describe("the Trash", () => {
  it("picks a free name like Finder does", () => {
    const taken = new Set(["/T/report.pdf", "/T/report 2.pdf"]);
    expect(trashTarget("/T", "report.pdf", (p) => taken.has(p))).toBe(path.join("/T", "report 3.pdf"));
    expect(trashTarget("/T", "notes", () => false)).toBe(path.join("/T", "notes"));
  });
  it("writes the freedesktop restore note", () => {
    expect(trashInfo("/home/me/a b.txt", new Date("2026-01-02T03:04:05Z"))).toBe("[Trash Info]\nPath=/home/me/a%20b.txt\nDeletionDate=2026-01-02T03:04:05\n");
  });
  it("moves into the person's Trash so it can come back, and never deletes", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "qp-home-"));
    const f = path.join(home, "old.txt");
    fs.writeFileSync(f, "hi");
    const to = await moveToTrash(f, { platform: "darwin", home });
    expect(to).toBe(path.join(home, ".Trash", "old.txt"));
    expect(fs.readFileSync(to, "utf8")).toBe("hi");
    expect(fs.existsSync(f)).toBe(false);
    let asked = null;
    expect(await moveToTrash(path.join(home, "x"), { platform: "win32", home, systemTrash: async (p) => { asked = p; } })).toBeNull();
    expect(asked).toBe(path.join(home, "x"));
    fs.rmSync(home, { recursive: true });
  });
});

describe("undo", () => {
  const dirs = [];
  afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });
  const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "qp-undo-")); dirs.push(d); return d; };

  it("says why something can't be undone", () => {
    const e = { kind: "move", src: "/a/x", dst: "/b/x", undone: false };
    expect(undoStep(e, (p) => p === "/b/x")).toEqual({ from: "/b/x", to: "/a/x" });
    expect(undoStep(e, () => false).error).toMatch(/no longer where/);
    expect(undoStep(e, () => true).error).toMatch(/already back/);
    expect(undoStep({ ...e, undone: true }, () => true).error).toMatch(/Already/);
    expect(undoStep({ kind: "trash", src: "/a/x", dst: null }, () => true).error).toMatch(/system Trash/);
    expect(undoStep({ kind: "setting" }, () => true)).toEqual({ custom: true });
  });
  it("puts files back, one at a time or a whole task, and never overwrites", () => {
    const d = tmp();
    const log = new ActionLog(new Db(":memory:"));
    for (const n of ["a", "b"]) fs.writeFileSync(path.join(d, `${n}.txt`), n);
    fs.mkdirSync(path.join(d, "Sorted"));
    for (const n of ["a", "b"]) {
      fs.renameSync(path.join(d, `${n}.txt`), path.join(d, "Sorted", `${n}.txt`));
      log.record({ task: "t1", taskTitle: "Tidy", kind: "move", what: `Move ${n}`, from: path.join(d, `${n}.txt`), to: path.join(d, "Sorted", `${n}.txt`) });
    }
    const [newest] = log.list();
    expect(newest).toMatchObject({ task: "t1", kind: "move", can_undo: true, undone: false });
    log.undo(newest.id);
    expect(fs.existsSync(path.join(d, "b.txt"))).toBe(true);
    expect(() => log.undo(newest.id)).toThrow(/Already/);
    fs.writeFileSync(path.join(d, "a.txt"), "someone else's");                 // the old spot is taken now
    const r = log.undoTask("t1");
    expect(r.undone).toBe(0);
    expect(r.failed[0].error).toMatch(/already back/);
    expect(fs.readFileSync(path.join(d, "a.txt"), "utf8")).toBe("someone else's");
  });
  it("undoes other kinds through a registered handler", () => {
    const log = new ActionLog(new Db(":memory:"));
    const seen = [];
    log.register("setting", (e) => seen.push([e.what, e.src]));
    const n = log.record({ task: "s", kind: "setting", what: "theme", from: "light", to: "dark" });
    log.undo(n);
    expect(seen).toEqual([["theme", "light"]]);
    expect(() => log.record({ task: "s", kind: "rm -rf", what: "x" })).toThrow(/unknown/);
  });
});

describe("dry run, confirm, receipt", () => {
  const dirs = [];
  afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });
  const setup = () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "qp-task-"));
    dirs.push(d);
    const db = new Db(":memory:");
    const log = new ActionLog(db);
    const trashed = [];
    const tasks = new Tasks(db, log, { guarded: () => [path.join(d, "Keep")], trash: async (p) => { const to = path.join(d, ".bin", path.basename(p)); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.renameSync(p, to); trashed.push(p); return to; } });
    return { d, db, log, tasks, trashed };
  };

  it("describes each change in plain words", () => {
    expect(describeItem({ kind: "trash", path: "/a/b.zip" })).toBe("Move “b.zip” to the Trash");
    expect(describeItem({ kind: "move", path: "/a/b.zip", to: "/a/Archives/b.zip" })).toBe("Move “b.zip” to Archives");
    expect(describeItem({ kind: "rename", path: "/a/IMG_1.jpg", to: "/a/Beach.jpg" })).toBe("Rename “IMG_1.jpg” to “Beach.jpg”");
  });
  it("flags bad items in the list instead of acting on them", () => {
    const look = { exists: (p) => !p.endsWith("gone.txt") };
    const out = checkItems([
      { kind: "trash", path: "/r/ok.txt" }, { kind: "trash", path: "/r/gone.txt" }, { kind: "trash", path: "/elsewhere/x" },
      { kind: "rename", path: "/r/a.txt", to: "/r/sub/a.txt" }, { kind: "explode", path: "/r/a" }, { kind: "move", path: "/r/a.txt" },
    ], { roots: ["/r"], guarded: [], look });
    expect(out.map((i) => i.problem && i.problem.split(" ")[0])).toEqual([null, "It's", "That", "A", "Unknown", "No"]);
  });
  it("changes nothing until confirmed, then only the ticked items, with undo and a receipt", async () => {
    const { d, log, tasks, trashed } = setup();
    for (const n of ["one.zip", "two.zip", "three.zip"]) fs.writeFileSync(path.join(d, n), "x".repeat(10));
    fs.mkdirSync(path.join(d, "Keep"));
    fs.writeFileSync(path.join(d, "Keep", "tax.pdf"), "x");
    const v = tasks.preview({ title: "Clear old zips", roots: [d], items: ["one.zip", "two.zip", "three.zip", "Keep/tax.pdf"].map((n) => ({ kind: "trash", path: path.join(d, n), size: 10 })) });
    expect(v.ready).toBe(3);
    expect(v.items[3].problem).toMatch(/protected/);
    expect(trashed).toEqual([]);                                   // a dry run touches nothing
    const receipt = await tasks.confirm(v.id, [0, 2, 3, 99]);         // 3 is protected, 99 doesn't exist
    expect(receipt.done.map((x) => x.what)).toEqual(["Move “one.zip” to the Trash", "Move “three.zip” to the Trash"]);
    expect(receipt.bytes).toBe(20);
    expect(fs.existsSync(path.join(d, "two.zip"))).toBe(true);
    expect(fs.existsSync(path.join(d, "Keep", "tax.pdf"))).toBe(true);
    await expect(tasks.confirm(v.id, [1])).rejects.toThrow(/expired/);   // a list can only be used once
    expect(tasks.receipts()[0]).toMatchObject({ id: v.id, title: "Clear old zips" });
    expect(log.undoTask(v.id).undone).toBe(2);
    for (const n of ["one.zip", "three.zip"]) expect(fs.existsSync(path.join(d, n))).toBe(true);
  });
  it("re-checks at confirm time", async () => {
    const { d, tasks } = setup();
    fs.writeFileSync(path.join(d, "a.txt"), "x");
    const v = tasks.preview({ title: "t", roots: [d], items: [{ kind: "trash", path: path.join(d, "a.txt") }] });
    fs.rmSync(path.join(d, "a.txt"));
    const r = await tasks.confirm(v.id, [0]);
    expect(r.done).toEqual([]);
    expect(r.failed[0].error).toMatch(/no longer there/);
  });
  it("moves never overwrite", async () => {
    const { d, tasks } = setup();
    fs.writeFileSync(path.join(d, "a.txt"), "new");
    fs.mkdirSync(path.join(d, "Docs"));
    fs.writeFileSync(path.join(d, "Docs", "a.txt"), "old");
    const v = tasks.preview({ title: "t", roots: [d], items: [{ kind: "move", path: path.join(d, "a.txt"), to: path.join(d, "Docs", "a.txt") }] });
    await tasks.confirm(v.id, [0]);
    expect(fs.readFileSync(path.join(d, "Docs", "a.txt"), "utf8")).toBe("old");
    expect(fs.readFileSync(path.join(d, "Docs", "a (1).txt"), "utf8")).toBe("new");
  });
  it("runs registered kinds and logs them", async () => {
    const { tasks, log } = setup();
    const ran = [];
    tasks.registerKind("quit_app", { check: (it) => (it.label ? null : "No app named."), run: (it) => { ran.push(it.label); return { logKind: "quit_app", what: `Quit ${it.label}` }; } });
    const v = tasks.preview({ title: "Quit", items: [{ kind: "quit_app", label: "Slack" }, { kind: "quit_app" }] });
    expect(v.items[1].problem).toMatch(/No app/);
    await tasks.confirm(v.id, [0, 1]);
    expect(ran).toEqual(["Slack"]);
    expect(log.list()[0]).toMatchObject({ kind: "quit_app", can_undo: false });
  });
});
