import { describe, expect, it } from "vitest";
import { runScreenAgent, type ScreenIO } from "./screenAgent";
import type { ScreenAction, ScreenResponse } from "./ipc";

const res = (action: ScreenAction, message = "m", thinking = "t"): ScreenResponse => ({ user: { thinking, message }, action });

function make(steps: ScreenResponse[], approve = true) {
  const events: string[] = [];
  const acted: ScreenAction[] = [];
  const io: ScreenIO = {
    propose: async () => steps.shift() ?? res({ type: "done" }, "end"),
    act: async (a) => void acted.push(a),
    approve: async () => approve,
    sleep: async () => {},
    onEvent: (e) => void events.push(`${e.kind}:${e.text}`),
  };
  return { io, events, acted };
}

describe("runScreenAgent", () => {
  it("shows the reasoning, runs the approved action, then reports the final answer", async () => {
    const { io, events, acted } = make([res({ type: "click", cell: "M7" }, "Opening it", "I see the button"), res({ type: "done" }, "All done")]);
    await runScreenAgent("g", io, { aborted: false });
    expect(acted).toEqual([{ type: "click", cell: "M7" }]);
    expect(events).toContain("say:I see the button");
    expect(events.at(-1)).toBe("final:All done");
  });

  it("does nothing when the user declines", async () => {
    const { io, acted, events } = make([res({ type: "type", text: "hi" })], false);
    await runScreenAgent("g", io, { aborted: false });
    expect(acted).toHaveLength(0);
    expect(events.at(-1)).toContain("final:");
  });

  it("stops on repeated identical actions", async () => {
    const same = res({ type: "click", cell: "A1" });
    const { io, events } = make([same, same, same, same]);
    await runScreenAgent("g", io, { aborted: false });
    expect(events.at(-1)).toContain("keep repeating");
  });

  it("honours abort", async () => {
    const { io, acted } = make([res({ type: "click", cell: "A1" })]);
    await runScreenAgent("g", io, { aborted: true });
    expect(acted).toHaveLength(0);
  });
});
