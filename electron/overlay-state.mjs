// What the on-screen status bar may show. Pure and dependency-free so it can be unit-tested.
export const PHASES = ["looking", "thinking", "acting", "waiting", "paused", "done", "error", "idle"];

const clip = (v, n) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");
const count = (v) => (Number.isInteger(v) && v >= 0 && v <= 999 ? v : undefined);

/** Validates and trims a status update from the UI. Anything unexpected is dropped, never rendered. */
export function sanitizeState(raw) {
  const s = raw && typeof raw === "object" ? raw : {};
  const phase = PHASES.includes(s.phase) ? s.phase : "idle";
  return { phase, thinking: clip(s.thinking, 420), next: clip(s.next, 200), step: count(s.step), max: count(s.max) };
}

/** Where the bar sits: bottom centre of the display's work area. */
export function barBounds(workArea, width = 780, height = 132, margin = 18) {
  const w = Math.min(width, Math.max(320, workArea.width - 24));
  return { width: w, height, x: Math.round(workArea.x + (workArea.width - w) / 2), y: Math.round(workArea.y + workArea.height - height - margin) };
}

/** Phases after which the bar fades away on its own, and how long it stays first. */
export function lingerMs(phase) {
  return phase === "done" ? 5000 : phase === "error" ? 8000 : phase === "idle" ? 0 : null;
}

/** A working state with no update for this long means the task died without saying so. */
export const STALE_MS = 90000;

/** A paused task is waiting for the person, who may take a while; give it a long leash before the bar is considered stale. */
export const STALE_PAUSED_MS = 30 * 60 * 1000;
export const staleMs = (phase) => (phase === "paused" ? STALE_PAUSED_MS : STALE_MS);
