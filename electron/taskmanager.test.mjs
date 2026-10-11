import { describe, expect, it } from "vitest";
import { summarize } from "./taskmanager.mjs";

const m = (pid, mbUsed, cpu = 0) => ({ pid, memory: { workingSetSize: mbUsed * 1024 }, cpu: { percentCPUUsage: cpu } });

describe("task manager", () => {
  it("lists tabs heaviest first with their memory", () => {
    const r = summarize([m(1, 120), m(2, 480, 12.34), m(3, 90), m(9, 200)], [
      { id: "a", title: "Docs", url: "https://docs.example", pid: 1 },
      { id: "b", title: "Video", url: "https://v.example", pid: 2, audible: true },
      { id: "c", title: "Mail", url: "https://m.example", pid: 3, pinned: true },
    ]);
    expect(r.rows.map((x) => x.id)).toEqual(["b", "a", "c"]);
    expect(r.rows[0]).toMatchObject({ mb: 480, cpu: 12.3, audible: true });
    expect(r.tabs_mb).toBe(690);
    expect(r.other_mb).toBe(200);
    expect(r.total_mb).toBe(890);
    expect(r.processes).toBe(4);
  });
  it("suspended and unloaded tabs use nothing and are labelled", () => {
    const r = summarize([m(1, 300)], [{ id: "a", title: "Live", pid: 1 }, { id: "b", title: "Asleep", pid: 0, suspended: true }, { id: "c", title: "", url: "", pid: 0 }]);
    expect(r.rows.find((x) => x.id === "b")).toMatchObject({ mb: 0, suspended: true, live: false });
    expect(r.rows.find((x) => x.id === "c").title).toBe("New tab");
    expect(r.suspended).toBe(1);
  });
  it("tabs sharing a process split its memory and the total counts it once", () => {
    const r = summarize([m(5, 400)], [{ id: "a", title: "A", pid: 5 }, { id: "b", title: "B", pid: 5 }]);
    expect(r.rows.map((x) => [x.mb, x.shared])).toEqual([[200, true], [200, true]]);
    expect(r.tabs_mb).toBe(400);
  });
  it("copes with a tab whose process has already gone", () => {
    const r = summarize([], [{ id: "a", title: "Gone", pid: 77 }]);
    expect(r.rows[0]).toMatchObject({ mb: 0, live: false });
    expect(r.total_mb).toBe(0);
  });
});
