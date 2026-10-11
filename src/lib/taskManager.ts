// Small helpers for the Task Manager screen.

/** "340 MB" or "1.2 GB". */
export function formatMb(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.max(0, Math.round(mb))} MB`;
}

export type Weight = "light" | "heavy" | "huge";
/** A rough label so the heavy tabs stand out. */
export function weight(mb: number): Weight {
  return mb >= 600 ? "huge" : mb >= 300 ? "heavy" : "light";
}

/** Bar width as a percentage of the heaviest tab, never less than a sliver for a live tab. */
export function barPercent(mb: number, maxMb: number): number {
  if (mb <= 0 || maxMb <= 0) return 0;
  return Math.max(3, Math.min(100, Math.round((mb / maxMb) * 100)));
}
