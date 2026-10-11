import { useEffect, useState } from "react";
import { Moon, Volume2, X } from "lucide-react";
import { ipc, type TaskReport } from "../lib/ipc";
import { barPercent, formatMb, weight } from "../lib/taskManager";
import { useHidePage } from "../hooks/useHidePage";
import { useStore } from "../store/useStore";
import { useTaskManager } from "../store/useTaskManager";
import { Favicon } from "./Favicon";
import { Modal, ModalHeader } from "./Modal";

/** How much memory each tab uses, with one-click Sleep or Close for the heavy ones. */
export function TaskManager() {
  const open = useTaskManager((s) => s.open);
  return open ? <Inner /> : null;
}

function Inner() {
  useHidePage();
  const close = useTaskManager((s) => s.close);
  const tabs = useStore((s) => s.tabs);
  const [r, setR] = useState<TaskReport | null>(null);
  useEffect(() => {
    let on = true;
    const load = () => void ipc.taskManager().then((v) => { if (on) setR(v); });
    load();
    const t = setInterval(load, 2000);
    return () => { on = false; clearInterval(t); };
  }, []);
  const max = Math.max(1, ...(r?.rows.map((x) => x.mb) ?? [1]));
  const fav = (id: string) => tabs.find((t) => t.id === id)?.favicon ?? "";
  return (
    <Modal onClose={close} label="Task Manager" width="max-w-2xl">
      <ModalHeader title="Task Manager" onClose={close} />
      <div className="space-y-3 p-5 text-[13px]">
        {!r ? <p className="text-text-secondary">Measuring…</p> : (
          <>
            <p className="text-text-secondary">
              Quick Pebble is using <b className="text-text-primary">{formatMb(r.total_mb)}</b> in total: <b className="text-text-primary">{formatMb(r.tabs_mb)}</b> for pages and {formatMb(r.other_mb)} for the browser itself.
              {r.suspended > 0 && ` ${r.suspended} sleeping tab${r.suspended === 1 ? " uses" : "s use"} nothing.`}
            </p>
            <ul className="max-h-80 space-y-1 overflow-y-auto">
              {r.rows.map((t) => (
                <li key={t.id} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2">
                  <Favicon src={fav(t.id)} url={t.url} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate font-medium">{t.title}{t.audible && <Volume2 size={12} className="shrink-0 text-text-secondary" aria-label="Playing sound" />}{t.active && <span className="shrink-0 rounded-full bg-primary/10 px-1.5 text-[10.5px] text-primary">current</span>}{t.pinned && <span className="shrink-0 rounded-full bg-surface-secondary px-1.5 text-[10.5px] text-text-secondary">pinned</span>}</p>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-secondary" aria-hidden><div className={`h-full rounded-full ${weight(t.mb) === "huge" ? "bg-red-500" : weight(t.mb) === "heavy" ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${barPercent(t.mb, max)}%` }} /></div>
                  </div>
                  <span className="w-20 shrink-0 text-right tabular-nums text-text-secondary">{t.suspended ? "asleep" : t.live ? `${formatMb(t.mb)}${t.shared ? " ~" : ""}` : "not loaded"}</span>
                  <button type="button" disabled={!t.live || t.active} onClick={() => void ipc.tabSuspend(t.id)} title={t.active ? "You're looking at this tab" : "Put this tab to sleep to free its memory"} aria-label={`Sleep ${t.title}`} className="grid size-7 shrink-0 place-items-center rounded-full text-text-secondary hover:bg-surface-secondary disabled:opacity-30"><Moon size={14} /></button>
                  <button type="button" onClick={() => void useStore.getState().closeTab(t.id)} title="Close this tab" aria-label={`Close ${t.title}`} className="grid size-7 shrink-0 place-items-center rounded-full text-text-secondary hover:bg-surface-secondary"><X size={14} /></button>
                </li>
              ))}
            </ul>
            <p className="text-[12px] text-text-secondary">Sleeping a tab frees its memory; it reloads when you click it. A "~" means tabs share a process, so the number is an even split.</p>
          </>
        )}
      </div>
    </Modal>
  );
}
