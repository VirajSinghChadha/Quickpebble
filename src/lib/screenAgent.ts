/**
 * Screen agent loop. Each turn the Python agent returns two parts:
 *   user   → shown in the chat (its reasoning and message, or the final answer when action.type is "done")
 *   action → the exact instruction for the backend
 * Routine actions run automatically ("smart" mode); only risky ones, or every step in "ask" mode, wait for the person.
 */
import type { ScreenAction, ScreenResponse } from "./ipc";
import { categoryLabel, isAllowed, type SitePerms } from "./permissions";

export const MAX_SCREEN_STEPS = 40;
const MAX_WAITS_IN_A_ROW = 8;
const HARD_STOP_REPEATS = 6;      // identical actions in a row before giving up
const NUDGE_AFTER_REPEATS = 2;    // after this many, tell the model its approach isn't working
const MAX_ACTION_FAILURES = 3;    // failed actions in a row before giving up
const PROPOSE_ATTEMPTS = 3;
const MAX_VERIFY_FAILS = 3;       // double-checks that find problems in a row before asking the person
const SUBMITTY = /submit|answer|send|confirm|check|finish|publish|post|order|done/i;
const TRANSIENT = /HTTP (408|429|5\d\d)|not responding|invalid response|Could not reach|timed out|overloaded/i;
/** Backstop when the model says "none" but its own message describes a sensitive step. */
const WORD_CATEGORY: [RegExp, string][] = [
  [/\b(buy|purchase|pay|checkout|check out|place order|donate|transfer)\b/i, "purchases"],
  [/\b(delete|erase|overwrite)\b/i, "deleting"],
  [/\b(sign out|log out|unsubscribe)\b/i, "accounts"],
];

export type Choice = "allow" | "auto" | "skip" | "stop";
export type ScreenMode = "ask" | "auto"; // ask = confirm every step, auto = confirm only risky steps

export interface ScreenIO {
  propose(goal: string, history: string[]): Promise<ScreenResponse>;
  act(action: ScreenAction): Promise<void>;
  /** Independent second look before a submit-type step. */
  verify(goal: string, history: string[], pending: string): Promise<{ ok: boolean; problems: string }>;
  /** Numbered choice dialog. `risky` steps never offer "auto". */
  choose(description: string, risky: boolean): Promise<Choice>;
  mode(): ScreenMode;
  /** Which sensitive categories the person has allowed without asking (per website, per session or saved). */
  permissions(): SitePerms;
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

/** Is this a click/Enter that sends something off? Those get a double-check first. */
export function needsDoubleCheck(res: ScreenResponse): boolean {
  const { action, user } = res;
  // Typing an answer is checked BEFORE it is entered, so a wrong or empty answer never reaches the page.
  if (action.type === "type") return /\b(answer|response|solution|result|working|reply)\b/i.test(`${user.message ?? ""} ${action.category ?? ""}`);
  if (action.type !== "click" && !(action.type === "key" && /^(enter|return)$/i.test(action.key ?? ""))) return false;
  return SUBMITTY.test(action.category ?? "") || /\b(submit|confirm|send|finish|check (my )?answer|publish|post|place order)\b/i.test(user.message ?? "");
}

/** Which of the site's permissions (if any) does this step fall under? "unknown" = risky but unlabeled. */
export function categoryOf(res: ScreenResponse, site: SitePerms): string | "unknown" | null {
  const { action, user } = res;
  if (action.type === "wait" || action.type === "scroll") return null;
  if (action.category && action.category !== "none") return site.items.some((i) => i.id === action.category) ? action.category : "unknown";
  const hit = WORD_CATEGORY.find(([re, id]) => re.test(user.message ?? "") && site.items.some((i) => i.id === id));
  if (hit) return hit[1];
  return action.risk === "high" ? "unknown" : null;
}

/** Does this step need the person's OK, given what they have allowed on this site? */
export function isRisky(res: ScreenResponse, site: SitePerms): boolean {
  const c = categoryOf(res, site);
  if (c === null) return false;
  return c === "unknown" ? true : !isAllowed(site, c);
}

export async function runScreenAgent(goal: string, io: ScreenIO, signal: { aborted: boolean }, maxSteps = MAX_SCREEN_STEPS, history: string[] = []): Promise<void> {
  let lastKey = "";
  let repeats = 0;
  let failures = 0;
  let verifyFails = 0;
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

    // Double-check before anything is submitted: an independent look at the work against the task.
    let doubtful = "";
    if (needsDoubleCheck(res)) {
      io.onEvent({ kind: "say", text: action.type === "type" ? "Double-checking the answer before I enter it…" : "Double-checking before I submit…" });
      try {
        const v = await io.verify(goal, history.slice(-12), desc);
        if (signal.aborted) return io.onEvent({ kind: "error", text: "Stopped." });
        if (v.ok) {
          verifyFails = 0;
          io.onEvent({ kind: "step", text: "Double-check passed", ok: true });
        } else if (++verifyFails < MAX_VERIFY_FAILS) {
          io.onEvent({ kind: "step", text: `Double-check found a problem: ${v.problems}`, ok: false });
          history.push(`${history.length + 1}. (double-check found a problem before submitting: ${v.problems}) — fix it first, then submit`);
          lastKey = "";
          repeats = 0;
          continue;
        } else {
          doubtful = v.problems;
          verifyFails = 0;
        }
      } catch (e) {
        io.onEvent({ kind: "step", text: `Could not double-check (${String(e).slice(0, 120)}), asking you instead`, ok: false });
        doubtful = "the double-check could not run";
      }
    }
    const site = io.permissions();
    const risky = isRisky(res, site);
    const cat = categoryOf(res, site);
    if (risky || doubtful || io.mode() === "ask") {
      const tag = risky && cat && cat !== "unknown" ? `[${categoryLabel(site, cat)}] ` : "";
      const warn = doubtful ? `⚠ Double-check is not confident: ${doubtful}. ` : "";
      const choice = await io.choose(`${warn}${tag}${user.message ? `${desc} — ${user.message}` : desc}`, risky || !!doubtful);
      if (signal.aborted || choice === "stop") {
        io.onEvent({ kind: "step", text: `${desc} — stopped`, ok: false });
        return io.onEvent({ kind: "final", text: "Okay, I stopped. Tell me what to do differently." });
      }
      if (choice === "skip") {
        io.onEvent({ kind: "step", text: `${desc} — skipped`, ok: false });
        history.push(`${history.length + 1}. (the person refused: ${desc}) — try a different approach`);
        continue;
      }
      if (choice === "auto") io.setMode("auto");
    }
    try {
      await io.act(action);
      failures = 0;
      io.onEvent({ kind: "step", text: desc, ok: true });
      history.push(`${history.length + 1}. ${desc}`);
      if (action.type !== "wait") await io.sleep(500);
    } catch (e) {
      io.onEvent({ kind: "step", text: `${desc} — ${String(e)}`, ok: false });
      if (++failures >= MAX_ACTION_FAILURES) return io.onEvent({ kind: "error", text: String(e) });
      history.push(`${history.length + 1}. (failed: ${desc} — ${String(e).slice(0, 120)}) — try something else`);
      await io.sleep(800);
    }
  }
  io.onEvent({ kind: "error", text: `Stopped after ${maxSteps} steps. Say “continue” to keep going.` });
}
