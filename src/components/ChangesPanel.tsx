import { useCallback, useEffect, useState } from "react";
import { History, Undo2 } from "lucide-react";
import { ipc, type ActionEntry, type Receipt } from "../lib/ipc";
import { formatBytes, timeAgo } from "../lib/format";
import { useStore } from "../store/useStore";
import { Modal, ModalHeader } from "./Modal";

/** Groups the flat change list by task, newest task first, keeping each task's changes newest first. */
export function groupByTask(rows: ActionEntry[]): { task: string; title: string; at: number; rows: ActionEntry[] }[] {
  const out = new Map<string, { task: string; title: string; at: number; rows: ActionEntry[] }>();
  for (const r of rows) {
    const g = out.get(r.task) ?? { task: r.task, title: r.task_title || "Change", at: r.at, rows: [] };
    g.rows.push(r);
    g.at = Math.max(g.at, r.at);
    out.set(r.task, g);
  }
  return [...out.values()].sort((a, b) => b.at - a.at);
}

/** "Last things I did": every change the app made for you, with Undo next to each one and for each whole task. */
export function ChangesPanel() {
  const close = () => useStore.getState().setOverlay(null);
  const [tab, setTab] = useState<"changes" | "receipts">("changes");
  const [rows, setRows] = useState<ActionEntry[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(async () => {
    setRows(await ipc.actionsList(300));
    setReceipts(await ipc.receiptsList(50));
  }, []);
  useEffect(() => void load(), [load]);
  const run = async (fn: () => Promise<unknown>) => {
    try { await fn(); setMsg(null); } catch (e) { setMsg(String(e)); }
    void load();
  };

  return (
    <Modal onClose={close} label="Recent changes" width="max-w-2xl">
      <ModalHeader title="Recent changes" onClose={close} />
      <div className="flex min-h-0 flex-col gap-3 px-5 pb-5">
        <p className="text-[12px] text-text-secondary">Everything Quick Pebble changed on your computer for you: files it moved, renamed or sent to the Trash, and settings a task changed. Undo puts things back, but never over something newer. Clicks the assistant made inside other apps can&apos;t be undone from here.</p>
        <div className="flex rounded-lg bg-surface-secondary p-0.5" role="tablist">
          {(["changes", "receipts"] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`flex-1 rounded-md px-2 py-1 text-[12px] font-medium ${tab === t ? "bg-surface text-text-primary shadow-pebble" : "text-text-secondary"}`}>{t === "changes" ? "Changes" : "Receipts"}</button>
          ))}
        </div>
        {msg && <p role="alert" className="text-[12px] text-red-500">{msg}</p>}
        <div className="max-h-[55vh] space-y-3 overflow-y-auto">
          {tab === "changes" && (rows.length === 0 ? <p className="py-6 text-center text-text-secondary">Nothing changed yet.</p> : groupByTask(rows).map((g) => (
            <section key={g.task} className="rounded-xl border border-border" aria-label={g.title}>
              <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                <span className="flex items-center gap-2 font-medium"><History size={14} className="text-primary" /> {g.title} <span className="text-[11.5px] font-normal text-text-secondary">{timeAgo(g.at)}</span></span>
                {g.rows.filter((r) => r.can_undo).length > 1 && <button type="button" onClick={() => void run(async () => { const r = await ipc.actionsUndoTask(g.task); if (r.failed.length) throw `Put back ${r.undone}; ${r.failed.length} couldn't be: ${r.failed[0].error}`; })} className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[12px] hover:bg-surface-secondary"><Undo2 size={12} /> Undo this whole task</button>}
              </header>
              <ul className="divide-y divide-border">
                {g.rows.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-3 py-1.5 text-[12.5px]">
                    <span className={`min-w-0 flex-1 break-words ${r.undone ? "text-text-secondary line-through" : ""}`} title={[r.src, r.dst].filter(Boolean).join(" → ")}>{r.what}</span>
                    {r.undone ? <span className="text-[11.5px] text-text-secondary">Undone</span> : r.can_undo ? <button type="button" onClick={() => void run(() => ipc.actionUndo(r.id))} className="rounded-lg border border-border px-2 py-0.5 text-[12px] hover:bg-surface-secondary">Undo</button> : <span className="text-[11.5px] text-text-secondary">{r.kind === "trash" ? "In the system Trash" : "Can't be undone"}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )))}
          {tab === "receipts" && (receipts.length === 0 ? <p className="py-6 text-center text-text-secondary">No receipts yet. Every clean-up or tidy-up you confirm leaves one here.</p> : receipts.map((r) => (
            <details key={r.id} className="rounded-xl border border-border px-3 py-2">
              <summary className="cursor-pointer"><span className="font-medium">{r.title}</span> <span className="text-[11.5px] text-text-secondary">· {timeAgo(r.at)} · {r.done.length} done{r.failed.length ? `, ${r.failed.length} skipped` : ""}{r.bytes ? ` · ${formatBytes(r.bytes)}` : ""}</span></summary>
              <ul className="mt-1 space-y-0.5 text-[12px] text-text-secondary">
                {r.done.map((d, n) => <li key={`d${n}`}>✓ {d.what}</li>)}
                {r.failed.map((f, n) => <li key={`f${n}`} className="text-red-500">✗ {f.what}: {f.error}</li>)}
              </ul>
            </details>
          )))}
        </div>
        {rows.length > 0 && tab === "changes" && <button type="button" onClick={() => void run(() => ipc.actionsClear())} className="self-start text-[12px] text-text-secondary hover:underline">Forget this list (your files stay as they are)</button>}
      </div>
    </Modal>
  );
}
