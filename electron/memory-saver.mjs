// Suspension policy for idle background tabs (port of memory_saver.rs).
export const defaultMemoryConfig = { enabled: true, mode: "balanced", timeout_minutes: null };
export const PRESSURE = 0.85;

export function idleTimeoutMs(cfg, pressure) {
  const mins = cfg.timeout_minutes ?? (cfg.mode === "maximum" ? 5 : 20);
  let secs = Math.max(1, mins) * 60;
  if (pressure >= PRESSURE) secs /= 2;
  return secs * 1000;
}

/** Never suspend the active tab, pinned tabs, tabs playing audio, capturing camera/mic, or downloading. */
export function shouldSuspend(cfg, t, pressure) {
  return !!cfg.enabled && t.hasPage && !t.suspended && !t.isActive && !t.pinned && !t.audible && !t.recording && !t.downloading && t.idleMs >= idleTimeoutMs(cfg, pressure);
}
