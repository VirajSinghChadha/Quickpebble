import { useEffect, useState } from "react";
import { ipc, type UsageToday } from "../lib/ipc";
import { useChat } from "../store/useChat";

const COLOR = { ok: "text-text-secondary", near: "text-amber-600 dark:text-amber-400", over: "text-red-500" } as const;

/** Today's cloud AI calls against the person's own daily limit, so a free key doesn't hit Google's limit by surprise. */
export function UsageMeter({ compact }: { compact?: boolean }) {
  const [u, setU] = useState<UsageToday | null>(null);
  const busy = useChat((s) => s.busy);
  useEffect(() => {
    let on = true;
    const load = () => void ipc.usageToday().then((v) => { if (on) setU(v); }).catch(() => {});
    load();
    const t = setInterval(load, busy ? 4000 : 30000);
    return () => { on = false; clearInterval(t); };
  }, [busy]);
  if (!u) return null;
  const note = u.level === "over" ? " — over your daily limit; Google may refuse requests until tomorrow" : u.level === "near" ? " — getting close to your daily limit" : "";
  if (compact) return <p className={`mt-1 text-[11px] ${COLOR[u.level]}`} role={u.level === "ok" ? undefined : "status"}>AI calls today: {u.calls} of {u.limit}{note}</p>;
  return (
    <div className="space-y-1.5">
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-secondary" aria-hidden><div className={`h-full rounded-full ${u.level === "ok" ? "bg-primary" : u.level === "near" ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${Math.min(100, (u.calls / Math.max(1, u.limit)) * 100)}%` }} /></div>
      <p className={`text-[12px] ${COLOR[u.level]}`}>{u.calls} of {u.limit} calls today{note}</p>
    </div>
  );
}
