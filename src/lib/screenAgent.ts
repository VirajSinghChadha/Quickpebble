/**
 * Screen agent loop. Each turn the Python agent returns two parts:
 *   user   → shown in the chat (its reasoning and message, or the final answer when action.type is "done")
 *   action → the exact instruction for the backend, executed only after the person approves it
 * Every action needs approval; there is no autopilot because the whole screen is in scope.
 */
import type { ScreenAction, ScreenResponse } from "./ipc";

export const MAX_SCREEN_STEPS = 20;

export interface ScreenIO {
  propose(goal: string, history: string[]): Promise<ScreenResponse>;
  act(action: ScreenAction): Promise<void>;
  approve(description: string): Promise<boolean>;
  sleep(ms: number): Promise<void>;
  onEvent(e: { kind: "say" | "step" | "final" | "question" | "error"; text: string; ok?: boolean }): void;
}

export function describeScreenAction(a: ScreenAction): string {
  const at = a.cell ? ` in cell ${a.cell}` : "";
  switch (a.type) {
    case "click": return `Click${at}`;
    case "double_click": return `Double-click${at}`;
    case "right_click": return `Right-click${at}`;
    case "type": return `Type “${(a.text ?? "").slice(0, 80)}”`;
    case "key": return `Press ${a.key}`;
    case "scroll": return `Scroll ${a.direction ?? "down"}${at}`;
    case "wait": return "Wait for the screen to update";
    default: return a.type;
  }
}

export async function runScreenAgent(goal: string, io: ScreenIO, signal: { aborted: boolean }, maxSteps = MAX_SCREEN_STEPS): Promise<void> {
  const history: string[] = [];
  let lastKey = "";
  let repeats = 0;
  for (let n = 0; n < maxSteps; n++) {
    if (signal.aborted) return io.onEvent({ kind: "error", text: "Stopped." });
    let res: ScreenResponse;
    try {
      res = await io.propose(goal, history.slice(-12));
    } catch (e) {
      return io.onEvent({ kind: "error", text: String(e) });
    }
    if (signal.aborted) return io.onEvent({ kind: "error", text: "Stopped." });
    const { user, action } = res;
    if (user.thinking) io.onEvent({ kind: "say", text: user.thinking });
    if (action.type === "done") return io.onEvent({ kind: "final", text: user.message || "Done." });
    if (action.type === "ask") return io.onEvent({ kind: "question", text: user.message || "What would you like me to do?" });

    const key = JSON.stringify([action.type, action.cell, action.fx, action.fy, action.text, action.key]);
    repeats = key === lastKey ? repeats + 1 : 0;
    lastKey = key;
    if (repeats >= 2) return io.onEvent({ kind: "error", text: "I keep repeating the same action, so I stopped. Try rephrasing the task." });

    const desc = describeScreenAction(action);
    if (!(await io.approve(user.message ? `${desc} — ${user.message}` : desc))) {
      io.onEvent({ kind: "step", text: `${desc} — declined`, ok: false });
      return io.onEvent({ kind: "final", text: "Okay, I stopped. Tell me what to do differently." });
    }
    try {
      await io.act(action);
      io.onEvent({ kind: "step", text: desc, ok: true });
      history.push(`${n + 1}. ${desc}`);
      await io.sleep(1200);
    } catch (e) {
      io.onEvent({ kind: "step", text: `${desc} — ${String(e)}`, ok: false });
      return io.onEvent({ kind: "error", text: String(e) });
    }
  }
  io.onEvent({ kind: "error", text: `Stopped after ${maxSteps} steps. Say “continue” to keep going.` });
}
