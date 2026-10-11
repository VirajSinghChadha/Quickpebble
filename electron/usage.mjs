// Counts today's cloud AI calls so people on a free Google key aren't surprised by a limit. A count, not a bill: it only
// knows about calls made through Quick Pebble. The limit is the person's own choice (their real quota is shown in Google AI Studio).
export const DEFAULT_LIMIT = 1000;

export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** "ok" until 80% of the limit, "near" until the limit, then "over". */
export function level(calls, limit) {
  if (limit > 0 && calls >= limit) return "over";
  if (limit > 0 && calls >= limit * 0.8) return "near";
  return "ok";
}

export class UsageCounter {
  constructor(db, clock = () => new Date()) { this.db = db; this.clock = clock; }

  read() {
    try {
      const v = JSON.parse(this.db.getSetting("usage_today") ?? "null");
      if (v && v.d === dayKey(this.clock()) && Number.isInteger(v.n) && v.n >= 0) return v.n;
    } catch { /* a bad value just means zero */ }
    return 0;
  }

  add(n = 1) {
    const add = Number.isInteger(n) && n > 0 && n < 1000 ? n : 0;
    if (!add) return;
    this.db.setSetting("usage_today", JSON.stringify({ d: dayKey(this.clock()), n: this.read() + add }));
  }

  limit() {
    const v = Number(this.db.getSetting("usage_limit"));
    return Number.isFinite(v) && v >= 10 && v <= 100000 ? Math.floor(v) : DEFAULT_LIMIT;
  }

  summary() {
    const calls = this.read(), limit = this.limit();
    return { date: dayKey(this.clock()), calls, limit, level: level(calls, limit) };
  }
}

let shared = null;
export const initUsage = (db) => { shared = new UsageCounter(db); return shared; };
export const bumpUsage = (n = 1) => { try { shared?.add(n); } catch { /* counting must never break an AI call */ } };
export const usageSummary = () => shared?.summary() ?? { date: dayKey(), calls: 0, limit: DEFAULT_LIMIT, level: "ok" };
