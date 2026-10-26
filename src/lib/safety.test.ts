import { describe, expect, it } from "vitest";
import { appDecision, appFor, mentionsProtected, parseAppPerms, protectedNote, withApp } from "./safety";
import { fallbackSite } from "./permissions";
import { runScreenAgent, type ScreenIO, type WatchFrame } from "./screenAgent";
import type { ScreenAction, ScreenResponse } from "./ipc";

const res = (action: ScreenAction, extra: Partial<ScreenResponse> = {}, message = "m"): ScreenResponse => ({ user: { thinking: "t", message }, action, ...extra });

describe("apps the assistant may use", () => {
  it("reads only sane saved answers", () => {
    expect(parseAppPerms('{"Notes":"allow","Mail":"deny","Bad\\n":"allow","X":"maybe"}')).toEqual({ Notes: "allow", Mail: "deny" });
    expect(parseAppPerms("[1]")).toEqual({});
    expect(parseAppPerms("junk")).toEqual({});
  });
  it("finds the app a step happens in, ignoring our own window", () => {
    expect(appFor(res({ type: "open_app", app: "Notes" }, { app: "Finder" }))).toBe("Notes");
    expect(appFor(res({ type: "click", point: [1, 1] }, { app: "Finder" }))).toBe("Finder");
    expect(appFor(res({ type: "click", point: [1, 1] }, { app: "Quick Pebble" }))).toBeNull();
    expect(appFor(res({ type: "click", point: [1, 1] }, { app: "Electron" }))).toBeNull();
    expect(appFor(res({ type: "click", point: [1, 1] }))).toBeNull();
  });
  it("asks once, remembers, and can forget", () => {
    expect(appDecision("Notes", {}, new Set())).toBe("ask");
    expect(appDecision("notes", { Notes: "allow" }, new Set())).toBe("allow");
    expect(appDecision("Mail", { Mail: "deny" }, new Set(["mail"]))).toBe("deny");
    expect(appDecision("Mail", {}, new Set(["mail"]))).toBe("allow");
    const saved = withApp(withApp("{}", "Notes", "allow"), "notes", "deny");
    expect(parseAppPerms(saved)).toEqual({ notes: "deny" });
    expect(parseAppPerms(withApp(saved, "Notes", null))).toEqual({});
  });
});

describe("protected folders", () => {
  const folders = ["/Users/me/Documents/Taxes", "/Users/me/Work"];
  it("become rules in the task", () => {
    expect(protectedNote([])).toBe("");
    expect(protectedNote(folders)).toMatch(/never open, change, move, rename or delete[\s\S]*\/Users\/me\/Work/);
  });
  it("are spotted in a step by path or by name, not inside other words", () => {
    expect(mentionsProtected(res({ type: "click", point: [1, 1] }, {}, "Open the Taxes folder"), folders)).toBe("Taxes");
    expect(mentionsProtected(res({ type: "type", text: "/Users/me/Work/plan.txt" }), folders)).toBe("Work");
    expect(mentionsProtected(res({ type: "click", point: [1, 1] }, {}, "Open the Workout app"), folders)).toBeNull();
    expect(mentionsProtected(res({ type: "click", point: [1, 1] }, {}, "Open Notes"), folders)).toBeNull();
  });
});

function io(steps: ScreenResponse[], over: Partial<ScreenIO> = {}) {
  const acted: ScreenAction[] = [];
  const asked: string[] = [];
  const events: string[] = [];
  const frames: WatchFrame[] = [];
  const base: ScreenIO = {
    propose: async () => steps.shift() ?? res({ type: "done" }, {}, "end"),
    act: async (a) => void acted.push(a),
    choose: async (d) => (asked.push(d), "allow"),
    mode: () => "auto",
    permissions: () => fallbackSite(),
    verify: async () => ({ ok: true, problems: "" }),
    setMode: () => {},
    sleep: async () => {},
    onEvent: (e) => void events.push(`${e.kind}:${e.text}`),
    onWatch: (f) => void frames.push(f),
    ...over,
  };
  return { io: base, acted, asked, events, frames };
}

describe("the screen agent with safety on", () => {
  it("stops before acting in an app the person refused", async () => {
    const t = io([res({ type: "click", point: [5, 5] }, { app: "Mail" })], { appAccess: async () => false });
    await runScreenAgent("g", t.io, { aborted: false });
    expect(t.acted).toHaveLength(0);
    expect(t.events.at(-1)).toMatch(/not allowed to work in Mail/);
  });
  it("acts once the app is allowed, asking only about the app", async () => {
    const seen: string[] = [];
    const t = io([res({ type: "open_app", app: "Notes" }), res({ type: "type", text: "hi" }, { app: "Notes" })], { appAccess: async (a) => (seen.push(a), true) });
    await runScreenAgent("g", t.io, { aborted: false });
    expect(seen).toEqual(["Notes", "Notes"]);
    expect(t.acted).toHaveLength(2);
    expect(t.asked).toHaveLength(0);
  });
  it("needs an OK for a step that mentions a protected folder, even in autopilot", async () => {
    const t = io([res({ type: "double_click", point: [5, 5] }, {}, "Open the Taxes folder")], { protectedFolders: () => ["/Users/me/Taxes"] });
    await runScreenAgent("g", t.io, { aborted: false });
    expect(t.asked[0]).toMatch(/protected folder “Taxes”/);
  });
  it("shows what it sees and plans in Watch mode", async () => {
    const t = io([res({ type: "click", point: [500, 500] }, { app: "Finder", shot: "abc" }, "Open Downloads")]);
    await runScreenAgent("g", t.io, { aborted: false });
    expect(t.frames[0]).toMatchObject({ step: 1, shot: "abc", app: "Finder", thinking: "t" });
    expect(t.frames[0].next).toMatch(/Click.*Open Downloads/);
  });
});


describe("auto mode and apps", () => {
  it("allows an app with no answer yet, but never one that was refused", () => {
    expect(appDecision("Notes", {}, new Set(), false)).toBe("ask");
    expect(appDecision("Notes", {}, new Set(), true)).toBe("allow");
    expect(appDecision("Notes", { Notes: "deny" }, new Set(), true)).toBe("deny");
  });
});
