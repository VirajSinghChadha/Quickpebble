// Routines in the interface: how each step reads, which steps need their own OK, finding the button or field a step means on
// the page as it is now, and spotting a shortcut phrase in the chat.
import type { PageSnapshot } from "./ipc";

export type Step =
  | { type: "open_url"; url: string }
  | { type: "click"; label: string }
  | { type: "type"; label: string; text: string; secret?: boolean }
  | { type: "select"; label: string; text: string }
  | { type: "open_app"; app: string }
  | { type: "wait"; seconds: number }
  | { type: "do"; text: string }
  | { type: "open_panel"; panel: "cleanup" | "school" | "changes" };
export interface Routine { id: number; name: string; steps: Step[]; trigger: string | null; schedule: { days: number[]; time: string } | null; imported?: boolean }

const PANEL = { cleanup: "Clean-up", school: "School", changes: "Recent changes" } as const;
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

export function describeStep(s: Step): string {
  switch (s.type) {
    case "open_url": return `Open ${host(s.url)}`;
    case "click": return `Click “${s.label}”`;
    case "type": return s.secret ? `You type your ${s.label} yourself` : `Type “${s.text.slice(0, 60)}” into ${s.label}`;
    case "select": return `Choose “${s.text}” in ${s.label}`;
    case "open_app": return `Open the ${s.app} app`;
    case "wait": return `Wait ${s.seconds} second${s.seconds === 1 ? "" : "s"}`;
    case "do": return `Ask the assistant: ${s.text}`;
    case "open_panel": return `Open ${PANEL[s.panel]}`;
  }
}

/** Steps that send, submit, buy, pay, delete or sign in always get their own OK while the routine runs. */
const RISKY = /\b(submit|send|post|publish|buy|purchase|pay|checkout|check out|order|place order|confirm|delete|remove|erase|sign in|log in|sign out|log out|transfer|donate|subscribe|unsubscribe|book now|reserve)\b/i;
export function needsConfirm(s: Step): boolean {
  if (s.type === "click") return RISKY.test(s.label);
  if (s.type === "do") return RISKY.test(s.text);
  return false;
}

const norm = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim();

/** The element a step means on the page right now: same text first, then text that contains it. Null if it isn't there. */
export function findElement(snap: Pick<PageSnapshot, "elements">, label: string, kind: "click" | "field" | "select"): number | null {
  const want = norm(label);
  const fits = (e: PageSnapshot["elements"][number]) => !e.disabled && (kind === "select" ? e.tag === "select" : kind === "field" ? (e.tag === "input" || e.tag === "textarea") && e.type !== "password" : !(e.tag === "input" && !/^(submit|button|checkbox|radio)$/.test(e.type ?? "")));
  const pool = snap.elements.filter(fits);
  const exact = pool.find((e) => norm(e.label) === want);
  if (exact) return exact.i;
  const part = pool.find((e) => norm(e.label).includes(want) || (want.length >= 4 && want.includes(norm(e.label)) && norm(e.label).length >= 4));
  return part ? part.i : null;
}

/** A routine whose shortcut phrase is the whole message ("tidy up", "tidy up!" or "please tidy up"). */
export function matchTrigger(text: string, routines: Routine[]): Routine | null {
  const t = norm(text).replace(/[.!?]+$/, "").replace(/^(please|pls|hey|ok)\s+/, "");
  return routines.find((r) => r.trigger && norm(r.trigger) === t) ?? null;
}

/** The days of a schedule in words: "Fridays at 16:00". */
export function scheduleText(s: Routine["schedule"]): string {
  if (!s) return "";
  const names = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
  const days = s.days.length === 7 ? "Every day" : s.days.length === 5 && [1, 2, 3, 4, 5].every((d) => s.days.includes(d)) ? "Weekdays" : s.days.map((d) => names[d]).join(", ");
  return `${days} at ${s.time}`;
}
