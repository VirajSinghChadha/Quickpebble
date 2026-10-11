import { describe, expect, it } from "vitest";
import { Db } from "./db.mjs";
import { ContextStore, staleRows } from "./context.mjs";

const make = () => new ContextStore(new Db(":memory:"));
const DAY = 86400;
const age = (store, table, id, days) => store.db.run(`UPDATE ${table} SET last_used = ?2 WHERE id = ?1`, id, Math.floor(Date.now() / 1000) - days * DAY);

describe("projects", () => {
  it("saves, updates and deletes, keeping chats", () => {
    const s = make();
    const p = s.saveProject({ name: " Science fair ", notes: "Volcano model. Files in ~/Documents/fair" });
    expect(s.projects()[0]).toMatchObject({ id: p, name: "Science fair" });
    s.saveProject({ id: p, name: "Science fair 2", notes: "n" });
    expect(s.projects()[0].name).toBe("Science fair 2");
    const c = s.newChat({ title: "Plan", projectId: p });
    expect(s.deleteProject(p)).toBe(true);
    expect(s.chats().find((x) => x.id === c).project_id).toBeNull();
  });
  it("needs a name and trims huge notes", () => {
    const s = make();
    expect(() => s.saveProject({ name: "  " })).toThrow(/name/);
    const id = s.saveProject({ name: "a", notes: "x".repeat(20000) });
    expect(s.projects().find((p) => p.id === id).notes).toHaveLength(8000);
  });
});

describe("chats", () => {
  it("stores messages in order, ignores junk, and reloads them", () => {
    const s = make();
    const c = s.newChat({ title: "Hello" });
    s.appendMessages(c, [{ kind: "user", text: "hi" }, { kind: "evil", text: "nope" }, { kind: "assistant", text: "" }, { kind: "assistant", text: "hello" }]);
    const loaded = s.loadChat(c);
    expect(loaded.items).toEqual([{ kind: "user", text: "hi" }, { kind: "assistant", text: "hello" }]);
  });
  it("won't write to a chat that is gone", () => {
    expect(() => make().appendMessages(99, [{ kind: "user", text: "x" }])).toThrow(/no longer exists/);
    expect(() => make().loadChat(99)).toThrow(/no longer exists/);
  });
  it("keeps only the most recent messages in a long chat", () => {
    const s = make();
    const c = s.newChat({});
    for (let i = 0; i < 8; i++) s.appendMessages(c, Array.from({ length: 200 }, (_, j) => ({ kind: "say", text: `m${i * 200 + j}` })));
    const items = s.loadChat(c).items;
    expect(items).toHaveLength(1500);
    expect(items.at(-1).text).toBe("m1599");
    expect(items[0].text).toBe("m100");
  });
});

describe("storage clean-up", () => {
  it("lists exactly what is unused, with dates and sizes, and deletes nothing", () => {
    const s = make();
    const old = s.newChat({ title: "Old homework" });
    const fresh = s.newChat({ title: "Today" });
    s.appendMessages(old, [{ kind: "user", text: "abc" }]);
    s.appendMessages(fresh, [{ kind: "user", text: "def" }]);
    const p = s.saveProject({ name: "Old project", notes: "n" });
    age(s, "ctx_chats", old, 45);
    age(s, "ctx_projects", p, 90);
    const report = s.stale(30);
    expect(report.chats.map((c) => c.title)).toEqual(["Old homework"]);
    expect(report.projects.map((x) => x.title)).toEqual(["Old project"]);
    expect(report.chats[0].bytes).toBeGreaterThan(0);
    expect(s.chats()).toHaveLength(2);
    expect(s.stale(100).chats).toHaveLength(0);
  });
  it("clears only the confirmed ids", () => {
    const s = make();
    const a = s.newChat({ title: "a" }), b = s.newChat({ title: "b" });
    s.appendMessages(a, [{ kind: "user", text: "x" }]);
    const p1 = s.saveProject({ name: "keep" }), p2 = s.saveProject({ name: "drop" });
    expect(s.clear({ chatIds: [a], projectIds: [p2] })).toEqual({ chats: 1, projects: 1 });
    expect(s.chats().map((c) => c.id)).toEqual([b]);
    expect(s.projects().map((p) => p.id)).toEqual([p1]);
    expect(s.db.get("SELECT COUNT(*) AS c FROM ctx_messages").c).toBe(0);
    expect(s.clear({ chatIds: ["1; DROP TABLE x", -1, 1.5], projectIds: null })).toEqual({ chats: 0, projects: 0 });
  });
  it("reports usage", () => {
    const s = make();
    s.appendMessages(s.newChat({}), [{ kind: "user", text: "12345" }]);
    expect(s.usage()).toMatchObject({ chats: 1, messages: 1, projects: 0 });
  });
  it("staleRows is pure", () => {
    const rows = [{ last_used: 100 }, { last_used: 100 + 50 * DAY }];
    expect(staleRows(rows, 30, 100 + 60 * DAY)).toHaveLength(1);
  });
});
