/**
 * Screen agent loop. Each turn the Python agent returns two parts:
 *   user   → shown in the chat (its reasoning and message, or the final answer when action.type is "done")
 *   action → the exact instruction for the backend
 * Routine actions run automatically ("smart" mode); only risky ones, or every step in "ask" mode, wait for the person.
 */
import type { ScreenAction, ScreenResponse } from "./ipc";

export const MAX_SCREEN_STEPS = 40;
const MAX_WAITS_IN_A_ROW = 8;
const HARD_STOP_REPEATS = 6;      // identical actions in a row before giving up
const NUDGE_AFTER_REPEATS = 2;    // after this many, tell the model its approach isn't working
const MAX_ACTION_FAILURES = 3;    // failed actions in a row before giving up
const PROPOSE_ATTEMPTS = 3;
const TRANSIENT = /HTTP (408|429|5\d\d)|not responding|invalid response|Could not reach|timed out|overloaded/i;
const RISKY = /\b(buy|purchase|pay|checkout|check out|place order|order|delete|erase|remove|overwrite|send|submit|post|publish|confirm|accept|transfer|install|sign out|log out|quit|close without saving|unsubscribe|donate)\b/i;

export type Choice = "allow" | "auto" | "skip" | "stop";
export type ScreenMode = "ask" | "auto"; // ask = confirm every step, auto = confirm only risky steps

export interface ScreenIO {
  propose(goal: string, history: string[]): Promise<ScreenResponse>;
  act(action: ScreenAction): Promise<void>;
  /** Numbered choice dialog. `risky` steps never offer "auto". */
  choose(description: string, risky: boolean): Promise<Choice>;
  mode(): ScreenMode;
  setMode(m: ScreenMode): void;
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

/** Is this step risky enough to need the person's OK even in smart mode? */
export function isRisky(res: ScreenResponse): boolean {
  const { action, user } = res;
  if (action.type === "wait" || action.type === "scroll") return false;
  return action.risk === "high" || RISKY.test(user.message ?? "");
}

export async function runScreenAgent(goal: string, io: ScreenIO, signal: { aborted: boolean }, maxSteps = MAX_SCREEN_STEPS): Promise<void> {
  const history: string[] = [];
  let lastKey = "";
  let repeats = 0;
  let failures = 0;
  for (let n = 0; n < maxSteps; n++) {
    if (signal.aborted) return io.onEvent({ kind: "error", text: "Stopped." });
    let res: ScreenResponse | undefined;
    for (let attempt = 1; attempt <= PROPOSE_ATTEMPTS && !res; attempt++) {
      try {
        res = await io.propose(goal, history.slice(-12));
      } catch (e) {
        if (attempt === PROPOSE_ATTEMPTS || !TRANSIENT.test(String(e))) return io.onEvent({ kind: "error", text: String(e) });
        io.onEvent({ kind: "say", text: `Temporary problem, retrying (${attempt}/${PROPOSE_ATTEMPTS - 1})…` });
        await io.sleep(1500 * attempt);
        if (signal.aborted) return io.onEvent({ kind: "error", text: "Stopped." });
      }
    }
    if (!res) return;
    if (signal.aborted) return io.onEvent({ kind: "error", text: "Stopped." });
    const { user, action } = res;
    if (user.thinking) io.onEvent({ kind: "say", text: user.thinking });
    if (action.type === "done") return io.onEvent({ kind: "final", text: user.message || "Done." });
    if (action.type === "ask") return io.onEvent({ kind: "question", text: user.message || "What would you like me to do?" });

    // Same action again and again usually means it isn't working. Nudge the model to change approach instead
    // of quitting; only give up after many identical attempts. Waiting is allowed to repeat for longer.
    const key = JSON.stringify([action.type, action.cell, action.fx, action.fy, action.text, action.key]);
    repeats = key === lastKey ? repeats + 1 : 0;
    lastKey = key;
    const limit = action.type === "wait" ? MAX_WAITS_IN_A_ROW : HARD_STOP_REPEATS;
    if (repeats >= limit) return io.onEvent({ kind: "error", text: "I tried the same thing several times without progress, so I stopped. Try rephrasing the task." });
    if (repeats >= NUDGE_AFTER_REPEATS && action.type !== "wait") {
      history.push(`(note: "${describeScreenAction(action)}" was repeated ${repeats + 1} times and the screen did not change as expected — try a different cell, an offset inside the cell, a keyboard key, or scrolling)`);
    }

    const desc = describeScreenAction(action);
    const risky = isRisky(res);
    if (risky || io.mode() === "ask") {
      const choice = await io.choose(user.message ? `${desc} — ${user.message}` : desc, risky);
      if (signal.aborted || choice === "stop") {
        io.onEvent({ kind: "step", text: `${desc} — stopped`, ok: false });
        return io.onEvent({ kind: "final", text: "Okay, I stopped. Tell me what to do differently." });
      }
      if (choice === "skip") {
        io.onEvent({ kind: "step", text: `${desc} — skipped`, ok: false });
        history.push(`${n + 1}. (the person refused: ${desc}) — try a different approach`);
        continue;
      }
      if (choice === "auto") io.setMode("auto");
    }
    try {
      await io.act(action);
      failures = 0;
      io.onEvent({ kind: "step", text: desc, ok: true });
      history.push(`${n + 1}. ${desc}`);
      if (action.type !== "wait") await io.sleep(500);
    } catch (e) {
      io.onEvent({ kind: "step", text: `${desc} — ${String(e)}`, ok: false });
      if (++failures >= MAX_ACTION_FAILURES) return io.onEvent({ kind: "error", text: String(e) });
      history.push(`${n + 1}. (failed: ${desc} — ${String(e).slice(0, 120)}) — try something else`);
      await io.sleep(800);
    }
  }
  io.onEvent({ kind: "error", text: `Stopped after ${maxSteps} steps. Say “continue” to keep going.` });
}
