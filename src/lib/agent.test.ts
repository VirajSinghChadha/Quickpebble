import { describe, expect, it } from "vitest";
import { formatObservation, needsApproval, parseStep, runAgent, type AgentEvent, type AgentIO } from "./agent";
import type { PageSnapshot } from "./ipc";

const snap: PageSnapshot = {
  url: "https://shop.test/",
  title: "Shop",
  scroll: { y: 0, max: 0 },
  text: "hello",
  elements: [
    { i: 0, tag: "a", label: "About" },
    { i: 1, tag: "button", label: "Buy now" },
  ],
};

describe("parseStep", () => {
  it("extracts JSON from prose and fences", () => {
    expect(parseStep('Sure!\n```json\n{"say":"ok","action":"click","index":2}\n```')).toMatchObject({ action: "click", index: 2 });
  });
  it("rejects unknown or malformed actions", () => {
    expect(parseStep('{"action":"rm -rf"}')).toBeNull();
    expect(parseStep('{"action":"click"}')).toBeNull();
    expect(parseStep("no json")).toBeNull();
    expect(parseStep('{"action":"click","index":-1}')).toBeNull();
  });
});

describe("needsApproval", () => {
  it("asks for everything that changes state in ask mode", () => {
    expect(needsApproval({ action: "click", index: 0 }, snap, "ask")).toBe(true);
    expect(needsApproval({ action: "scroll", direction: "down" }, snap, "ask")).toBe(false);
  });
  it("auto mode still confirms sensitive clicks", () => {
    expect(needsApproval({ action: "click", index: 0 }, snap, "auto")).toBe(false);
    expect(needsApproval({ action: "click", index: 1 }, snap, "auto")).toBe(true);
  });
});

describe("formatObservation", () => {
  it("fences untrusted page content", () => {
    const o = formatObservation([{ title: "Shop", url: "https://shop.test/", active: true }], snap);
    expect(o).toContain("<<<PAGE");
    expect(o).toContain('[1] button "Buy now"');
  });
});

function harness(replies: string[], approve = true) {
  const events: AgentEvent[] = [];
  const calls: string[] = [];
  let i = 0;
  const io: AgentIO = {
    tabs: () => [{ id: "t1", title: "Shop", url: "https://shop.test/", active: true }],
    activeTabId: () => "t1",
    snapshot: async () => snap,
    exec: async (_t, op, args) => (calls.push(`${op}:${JSON.stringify(args)}`), { ok: true }),
    chat: async () => replies[Math.min(i++, replies.length - 1)],
    navigate: async (_t, url) => void calls.push(`nav:${url}`),
    newTab: async (url) => (calls.push(`new:${url}`), "t2"),
    switchTab: () => {},
    approve: async () => approve,
    sleep: async () => {},
    onEvent: (e) => events.push(e),
  };
  return { io, events, calls };
}

describe("runAgent", () => {
  it("acts then finishes", async () => {
    const h = harness(['{"action":"click","index":0}', '{"action":"done","say":"All set"}']);
    await runAgent("open about", [], h.io, { mode: "auto", signal: { aborted: false } });
    expect(h.calls).toEqual(['click:{"i":0}']);
    expect(h.events.at(-1)).toEqual({ kind: "final", text: "All set" });
  });
  it("does nothing when the user declines", async () => {
    const h2 = harness(['{"action":"click","index":1}'], false);
    await runAgent("buy", [], h2.io, { mode: "auto", signal: { aborted: false } });
    expect(h2.calls).toEqual([]);
    expect(h2.events.some((e) => e.kind === "step" && !e.ok)).toBe(true);
  });
  it("stops on repeated actions and on invalid replies", async () => {
    const loop = harness(['{"action":"scroll","direction":"down"}']);
    await runAgent("x", [], loop.io, { mode: "auto", signal: { aborted: false } });
    expect(loop.events.at(-1)).toMatchObject({ kind: "error" });
    const junk = harness(["blah"]);
    await runAgent("x", [], junk.io, { mode: "auto", signal: { aborted: false } });
    expect(junk.events.at(-1)).toMatchObject({ kind: "error" });
  });
  it("respects the stop flag and the step cap", async () => {
    const stopped = harness(['{"action":"wait"}']);
    await runAgent("x", [], stopped.io, { mode: "auto", signal: { aborted: true } });
    expect(stopped.calls).toEqual([]);
    const capped = harness(['{"action":"click","index":0}', '{"action":"scroll","direction":"up"}', '{"action":"wait"}']);
    await runAgent("x", [], capped.io, { mode: "auto", signal: { aborted: false }, maxSteps: 2 });
    expect(capped.events.at(-1)).toMatchObject({ kind: "error" });
  });
});
