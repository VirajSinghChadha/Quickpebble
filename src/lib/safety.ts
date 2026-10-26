// Safe mode for apps and protected folders, as seen by the screen agent.
// The first time the agent is about to work in an app it asks the person, for that app only; the answer is remembered
// in the "screen_app_permissions" setting and can be revoked in Settings. Protected folders are told to the agent as rules,
// and any step that mentions one needs the person's OK.
import type { ScreenResponse } from "./ipc";

export type AppAnswer = "allow" | "deny";
export type AppChoice = "once" | "always" | "no";

/** Our own window: the browser is covered by the per-website permissions instead. */
const SELF = new Set(["quick pebble", "electron"]);
const APP_NAME = /^[\p{L}\p{N}][\p{L}\p{N} .&+()'_-]{0,79}$/u;

export function parseAppPerms(json: string | undefined): Record<string, AppAnswer> {
  try {
    const o = JSON.parse(json ?? "{}") as Record<string, unknown>;
    if (!o || typeof o !== "object" || Array.isArray(o)) return {};
    return Object.fromEntries(Object.entries(o).filter(([k, v]) => APP_NAME.test(k) && (v === "allow" || v === "deny")) as [string, AppAnswer][]);
  } catch {
    return {};
  }
}

/** The app a step happens in: the one it opens, or the one in front. Null for our own window or when unknown. */
export function appFor(res: Pick<ScreenResponse, "action" | "app">): string | null {
  const name = (res.action.type === "open_app" ? res.action.app : res.app)?.trim();
  if (!name || !APP_NAME.test(name) || SELF.has(name.toLowerCase())) return null;
  return name;
}

/** Saved answers win; "once" answers last for the current task only. In auto mode an app with no answer yet is simply allowed for this task. */
export function appDecision(app: string, saved: Record<string, AppAnswer>, once: ReadonlySet<string>, auto = false): AppAnswer | "ask" {
  const key = Object.keys(saved).find((k) => k.toLowerCase() === app.toLowerCase());
  if (key) return saved[key];   // an app the person said no to stays blocked, even in auto mode
  return once.has(app.toLowerCase()) || auto ? "allow" : "ask";
}

export function withApp(json: string | undefined, app: string, answer: AppAnswer | null): string {
  const all = parseAppPerms(json);
  for (const k of Object.keys(all)) if (k.toLowerCase() === app.toLowerCase()) delete all[k];
  if (answer && APP_NAME.test(app)) all[app] = answer;
  return JSON.stringify(all);
}

const base = (p: string) => p.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? "";

/** Rules added to the agent's task so it keeps out of the person's protected folders. Empty when there are none. */
export function protectedNote(folders: string[]): string {
  if (!folders.length) return "";
  return `Protected folders: never open, change, move, rename or delete anything inside these folders, and do not upload files from them:\n${folders.slice(0, 50).map((f) => `- ${f}`).join("\n")}\nIf the task needs one, stop and ask the person.`;
}

/** Does this step mention a protected folder (by full path or by its folder name)? Then the person must OK it. */
export function mentionsProtected(res: Pick<ScreenResponse, "action" | "user">, folders: string[]): string | null {
  const text = `${res.user.message ?? ""} ${res.user.thinking ?? ""} ${res.action.text ?? ""}`.toLowerCase();
  for (const f of folders) {
    const name = base(f).toLowerCase();
    if (text.includes(f.toLowerCase()) || (name.length >= 3 && new RegExp(`(^|[^\\p{L}\\p{N}])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}\\p{N}]|$)`, "u").test(text))) return base(f) || f;
  }
  return null;
}
