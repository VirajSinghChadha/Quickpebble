import { useCallback, useEffect, useState } from "react";
import { Bot, ChevronLeft, ChevronRight, Download, FileCheck2, Globe, MessageSquare } from "lucide-react";
import { ipc, type TimelineEvent } from "../lib/ipc";

const ICONS = { page: Globe, download: Download, chat: MessageSquare, task: Bot, change: FileCheck2 } as const;
const WORDS = { page: "Read", download: "Downloaded", chat: "Chatted", task: "Asked the assistant", change: "Cleaned up" } as const;

/** Local date as YYYY-MM-DD, moved by `delta` days. */
export function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(y, m - 1, d + delta);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}
const today = () => shiftDay(new Date().toLocaleDateString("sv-SE"), 0);

/** Library → Timeline: one day at a time, newest first. Opt-in and local only. */
export function TimelineView({ open }: { open: (url: string) => void }) {
  const [day, setDay] = useState(today);
  const [data, setData] = useState<{ on: boolean; events: TimelineEvent[] } | null>(null);
  const [sure, setSure] = useState(false);
  const load = useCallback(async () => setData(await ipc.timelineDay(day)), [day]);
  useEffect(() => void load(), [load]);
  if (data && !data.on) {
    return (
      <div className="space-y-3 p-6 text-center text-text-secondary">
        <p>The timeline is off. Turn it on to scroll back through the pages you read, files you downloaded, chats and assistant tasks, day by day. It stays on this computer and never includes private windows.</p>
        <button type="button" onClick={() => void ipc.settingsSet("timeline_enabled", "1").then(load)} className="rounded-lg bg-primary px-3 py-1.5 font-medium text-white dark:text-bg">Turn on the timeline</button>
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-5 py-2">
        <button type="button" aria-label="Previous day" onClick={() => setDay((d) => shiftDay(d, -1))} className="grid size-7 place-items-center rounded-lg hover:bg-surface-secondary"><ChevronLeft size={15} /></button>
        <input type="date" value={day} max={today()} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="Day" className="rounded-lg border border-border bg-surface px-2 py-1 text-[12.5px]" />
        <button type="button" aria-label="Next day" disabled={day >= today()} onClick={() => setDay((d) => shiftDay(d, 1))} className="grid size-7 place-items-center rounded-lg hover:bg-surface-secondary disabled:opacity-30"><ChevronRight size={15} /></button>
        <span className="flex-1" />
        <button type="button" onClick={() => { if (!sure) return setSure(true); setSure(false); void ipc.timelineClear().then(load); }} className={`rounded-lg border px-2 py-1 text-[12px] ${sure ? "border-red-500 text-red-500" : "border-border hover:bg-surface-secondary"}`}>{sure ? "Click again to clear everything" : "Clear all"}</button>
      </div>
      <ol className="overflow-y-auto p-2" aria-label="Timeline">
        {data?.events.length === 0 && <li className="px-3 py-8 text-center text-text-secondary">Nothing on this day.</li>}
        {data?.events.map((e, n) => {
          const Icon = ICONS[e.kind] ?? Globe;
          return (
            <li key={n} className="flex items-start gap-3 rounded-[10px] px-3 py-1.5 hover:bg-surface-secondary">
              <span className="w-11 shrink-0 pt-0.5 text-[11.5px] tabular-nums text-text-secondary">{new Date(e.at * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              <Icon size={14} className="mt-0.5 shrink-0 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="text-[11.5px] text-text-secondary">{WORDS[e.kind]} </span>
                {e.kind === "page" ? <button type="button" onClick={() => open(e.detail)} className="text-left hover:underline">{e.title}</button> : <span>{e.title}</span>}
                {(e.site || (e.kind !== "page" && e.detail)) && <span className="text-[11.5px] text-text-secondary"> · {e.site || e.detail}{e.count && e.count > 1 ? ` · ${e.count} pages` : ""}</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
