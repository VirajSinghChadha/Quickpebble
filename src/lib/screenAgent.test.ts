import { describe, expect, it } from "vitest";
import { fallbackSite, parseGenerated } from "./permissions";
import { isRisky, needsDoubleCheck, runScreenAgent, type Choice, type ScreenIO, type ScreenMode } from "./screenAgent";
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
    permissions: () => fallbackSite(),
    verify: async () => ({ ok: true, problems: "" }),
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
    const { io, acted, asked, events } = make([res({ type: "click", cell: "B2", category: "messages" }, "Sending the email")], ["stop"]);
    await runScreenAgent("g", io, { aborted: false });
    expect(asked[0].risky).toBe(true);
    expect(acted).toHaveLength(0);
    expect(events.at(-1)).toContain("final:");
  });

  it("flags risky wording even if the model said low risk", () => {
    expect(isRisky(res({ type: "click", cell: "A1", risk: "low" }, "Click Delete account"), fallbackSite())).toBe(true);
    expect(isRisky(res({ type: "click", cell: "A1" }, "Open the search box"), fallbackSite())).toBe(false);
    expect(isRisky(res({ type: "wait", risk: "high" }), fallbackSite())).toBe(false);
  });

  it("respects the person's per-site permissions", () => {
    const site = parseGenerated('{"permissions":[{"id":"submit_quiz_answers","label":"Submit quiz answers","allowed":false},{"id":"skip_lessons","label":"Skip lessons","allowed":true},{"id":"buy_credits","label":"Buy credits"}]}')!;
    const submit = res({ type: "click", cell: "A1", category: "submit_quiz_answers" });
    expect(isRisky(submit, site)).toBe(true);
    expect(isRisky(submit, { ...site, allowed: { ...site.allowed, submit_quiz_answers: true } })).toBe(false);
    expect(isRisky(res({ type: "click", cell: "A1", category: "skip_lessons" }), site)).toBe(false);
    expect(isRisky(res({ type: "click", cell: "A1", category: "made_up" }), site)).toBe(true);
    expect(isRisky(res({ type: "click", cell: "A1", risk: "high", category: "none" }), site)).toBe(true);
  });

  it("skip tells the model to try another way and keeps going", async () => {
    const { io, acted, events } = make([res({ type: "click", cell: "A1", category: "deleting" }), res({ type: "done" }, "ok")], ["skip"]);
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
    expect(u.events.at(-1)).toContain("boom");
  });

  it("double-checks before submitting and fixes problems first", async () => {
    const submit = res({ type: "click", cell: "Q14", category: "submit" }, "Submit the answer");
    const t = make([submit, res({ type: "type", text: "7^4" }), submit, res({ type: "done" }, "ok")]);
    const calls: string[] = [];
    let n = 0;
    t.io.verify = async (_g, _h, pending) => (calls.push(pending), n++ === 0 ? { ok: false, problems: "answer should be 7^4" } : { ok: true, problems: "" });
    await runScreenAgent("g", t.io, { aborted: false });
    expect(calls).toHaveLength(2);
    expect(t.acted.map((a) => a.type)).toEqual(["type", "click"]); // first submit was held back
    expect(t.events.some((e) => e.includes("Double-check found a problem"))).toBe(true);
  });

  it("asks the person if the double-check keeps failing", async () => {
    const submit = res({ type: "click", cell: "Q14", category: "submit" }, "Submit");
    const t = make([submit, submit, submit, res({ type: "done" })], ["stop"]);
    t.io.verify = async () => ({ ok: false, problems: "still wrong" });
    await runScreenAgent("g", t.io, { aborted: false });
    expect(t.asked.at(-1)?.description).toContain("not confident");
    expect(t.acted).toHaveLength(0);
  });

  it("only double-checks submit-like steps", () => {
    expect(needsDoubleCheck(res({ type: "click", cell: "A1" }, "Open the menu"))).toBe(false);
    expect(needsDoubleCheck(res({ type: "type", text: "x" }, "Type the search term"))).toBe(false);
    expect(needsDoubleCheck(res({ type: "type", text: "7^4" }, "Enter the answer 7^4"))).toBe(true);
    expect(needsDoubleCheck(res({ type: "key", key: "enter" }, "Press enter to submit the answer"))).toBe(true);
    expect(needsDoubleCheck(res({ type: "click", cell: "A1", category: "submit_quiz_answers" }))).toBe(true);
  });

  it("honours abort", async () => {
    const { io, acted } = make([res({ type: "click", cell: "A1" })]);
    await runScreenAgent("g", io, { aborted: true });
    expect(acted).toHaveLength(0);
  });
});
