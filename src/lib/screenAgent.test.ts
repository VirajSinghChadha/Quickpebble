import { describe, expect, it } from "vitest";
import { isRisky, runScreenAgent, type Choice, type ScreenIO, type ScreenMode } from "./screenAgent";
import type { ScreenAction, ScreenResponse } from "./ipc";

const res = (action: ScreenAction, message = "m", thinking = "t"): ScreenResponse => ({ user: { thinking, message }, action });

function make(steps: ScreenResponse[], answers: Choice[] = [], startMode: ScreenMode = "auto") {
  const events: string[] = [];
  const acted: ScreenAction[] = [];
  const asked: { description: string; risky: boolean }[] = [];
  let mode = startMode;
  const io: ScreenIO = {
    propose: async () => steps.shift() ?? res({ type: "done" }, "end"),
    act: async (a) => void acted.push(a),
    choose: async (description, risky) => (asked.push({ description, risky }), answers.shift() ?? "allow"),
    mode: () => mode,
    setMode: (m) => (mode = m),
    sleep: async () => {},
    onEvent: (e) => void events.push(`${e.kind}:${e.text}`),
  };
  return { io, events, acted, asked, getMode: () => mode };
}

describe("runScreenAgent", () => {
  it("auto-runs routine steps without asking and reports the final answer", async () => {
    const { io, events, acted, asked } = make([res({ type: "click", cell: "M7" }, "Opening it", "I see the button"), res({ type: "type", text: "weather" }), res({ type: "done" }, "All done")]);
    await runScreenAgent("g", io, { aborted: false });
    expect(asked).toHaveLength(0);
    expect(acted).toHaveLength(2);
    expect(events).toContain("say:I see the button");
    expect(events.at(-1)).toBe("final:All done");
  });

  it("asks before a high-risk action and respects Stop", async () => {
    const { io, acted, asked, events } = make([res({ type: "click", cell: "B2", risk: "high" }, "Sending the email")], ["stop"]);
    await runScreenAgent("g", io, { aborted: false });
    expect(asked[0].risky).toBe(true);
    expect(acted).toHaveLength(0);
    expect(events.at(-1)).toContain("final:");
  });

  it("flags risky wording even if the model said low risk", () => {
    expect(isRisky(res({ type: "click", cell: "A1", risk: "low" }, "Click Delete account"))).toBe(true);
    expect(isRisky(res({ type: "click", cell: "A1" }, "Open the search box"))).toBe(false);
    expect(isRisky(res({ type: "wait", risk: "high" }))).toBe(false);
  });

  it("skip tells the model to try another way and keeps going", async () => {
    const { io, acted, events } = make([res({ type: "click", cell: "A1", risk: "high" }), res({ type: "done" }, "ok")], ["skip"]);
    await runScreenAgent("g", io, { aborted: false });
    expect(acted).toHaveLength(0);
    expect(events.some((e) => e.includes("skipped"))).toBe(true);
    expect(events.at(-1)).toBe("final:ok");
  });

  it("confirm-every-step mode asks for routine steps, and option 2 switches to smart", async () => {
    const { io, asked, getMode } = make([res({ type: "key", key: "enter" }), res({ type: "key", key: "tab" }), res({ type: "done" })], ["auto"], "ask");
    await runScreenAgent("g", io, { aborted: false });
    expect(asked).toHaveLength(1);
    expect(getMode()).toBe("auto");
  });

  it("keeps going when an action repeats, nudging the model, and only stops after many repeats", async () => {
    const c = res({ type: "click", cell: "P14" });
    const history: string[][] = [];
    const t = make([c, c, c, c, c, c, c, c]);
    const orig = t.io.propose;
    t.io.propose = async (g, h) => (history.push([...h]), orig(g, h));
    await runScreenAgent("g", t.io, { aborted: false });
    expect(t.acted.length).toBeGreaterThanOrEqual(5);
    expect(history.some((h) => h.some((l) => l.includes("try a different")))).toBe(true);
    expect(t.events.at(-1)).toContain("without progress");
  });

  it("allows many waits in a row", async () => {
    const w = res({ type: "wait" });
    const t = make([w, w, w, w, w, w, res({ type: "done" }, "ok")]);
    await runScreenAgent("g", t.io, { aborted: false });
    expect(t.events.at(-1)).toBe("final:ok");
  });

  it("retries temporary Gemini errors", async () => {
    const t = make([res({ type: "done" }, "fine")]);
    let calls = 0;
    const real = t.io.propose;
    t.io.propose = async (g, h) => { if (++calls < 3) throw new Error("Gemini error (HTTP 503): overloaded"); return real(g, h); };
    await runScreenAgent("g", t.io, { aborted: false });
    expect(calls).toBe(3);
    expect(t.events.at(-1)).toBe("final:fine");
  });

  it("does not retry non-temporary errors like a bad key", async () => {
    const t = make([]);
    let calls = 0;
    t.io.propose = async () => { calls++; throw new Error("API key not valid (HTTP 400)"); };
    await runScreenAgent("g", t.io, { aborted: false });
    expect(calls).toBe(1);
  });

  it("recovers from one failed action but gives up after three", async () => {
    const t = make([res({ type: "click", cell: "A1" }), res({ type: "click", cell: "B2" }), res({ type: "done" }, "ok")]);
    let n = 0;
    t.io.act = async () => { if (n++ === 0) throw new Error("boom"); };
    await runScreenAgent("g", t.io, { aborted: false });
    expect(t.events.at(-1)).toBe("final:ok");
    const u = make([res({ type: "click", cell: "A1" }), res({ type: "click", cell: "B1" }), res({ type: "click", cell: "C1" }), res({ type: "done" })]);
    u.io.act = async () => { throw new Error("boom"); };
    await runScreenAgent("g", u.io, { aborted: false });
    expect(u.events.at(-1)).toContain("error:boom");
  });

  it("honours abort", async () => {
    const { io, acted } = make([res({ type: "click", cell: "A1" })]);
    await runScreenAgent("g", io, { aborted: true });
    expect(acted).toHaveLength(0);
  });
});
