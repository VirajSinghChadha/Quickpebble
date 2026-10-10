import { useEffect, useState } from "react";
import { ipc, type ContextUsage, type StaleReport } from "../lib/ipc";
import { formatBytes, lastUsedLabel } from "../lib/context";
import { useHidePage } from "../hooks/useHidePage";
import { useChat } from "../store/useChat";
import { Modal, ModalHeader } from "./Modal";

const AGES = [14, 30, 60, 90, 180];

/** Settings → Storage: how much saved chats and project notes use, and a guided, confirmed clean-up of the ones you stopped using. */
export function StoragePanel() {
  const [usage, setUsage] = useState<ContextUsage | null>(null);
  const [days, setDays] = useState(30);
  const [review, setReview] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const load = () => void ipc.ctxUsage().then(setUsage);
  useEffect(() => {
    load();
    void ipc.settingsGet().then((s) => { const d = Number(s.ctx_stale_days); if (AGES.includes(d)) setDays(d); });
  }, []);
  return (
    <div className="space-y-2 py-2.5">
      <p className="font-medium">Saved chats and project notes</p>
      <p className="text-[12px] text-text-secondary">
        {usage ? `${usage.chats} chats (${usage.messages} messages) and ${usage.projects} projects, about ${formatBytes(usage.bytes)} on this computer.` : "Loading…"} Nothing here is sent anywhere except what you ask the assistant.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-[12px] text-text-secondary">
          Not used for
          <select value={days} onChange={(e) => { const d = Number(e.target.value); setDays(d); void ipc.settingsSet("ctx_stale_days", String(d)); }} className="rounded-full border border-border bg-surface px-2.5 py-1 text-[12px] text-text-primary" aria-label="Unused for how many days">
            {AGES.map((d) => <option key={d} value={d}>{d} days</option>)}
          </select>
        </label>
        <button type="button" onClick={() => { setDone(null); setReview(true); }} className="rounded-full border border-border px-3 py-1.5 hover:bg-surface-secondary">Review what can be cleared…</button>
      </div>
      {done && <p className="text-[12px] text-text-secondary" role="status">{done}</p>}
      {review && <CleanupDialog days={days} onClose={() => setReview(false)} onDone={(m) => { setDone(m); setReview(false); load(); void useChat.getState().refreshContext(); }} />}
    </div>
  );
}

function CleanupDialog({ days, onClose, onDone }: { days: number; onClose: () => void; onDone: (message: string) => void }) {
  useHidePage();
  const [report, setReport] = useState<StaleReport | null>(null);
  const [chatIds, setChatIds] = useState<Set<number>>(new Set());
  const [projectIds, setProjectIds] = useState<Set<number>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void ipc.ctxStale(days).then((r) => { setReport(r); setChatIds(new Set(r.chats.map((c) => c.id))); setProjectIds(new Set(r.projects.map((p) => p.id))); });
  }, [days]);
  const toggle = (set: Set<number>, put: (s: Set<number>) => void, id: number) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); put(n); };
  const chosen = (report?.chats.filter((c) => chatIds.has(c.id)) ?? []);
  const chosenProjects = (report?.projects.filter((p) => projectIds.has(p.id)) ?? []);
  const bytes = [...chosen, ...chosenProjects].reduce((n, r) => n + r.bytes, 0);
  const total = chosen.length + chosenProjects.length;
  const erase = async () => {
    try {
      const r = await ipc.ctxClear([...chosen.map((c) => c.id)], [...chosenProjects.map((p) => p.id)]);
      const active = useChat.getState().chatId;
      if (active && chosen.some((c) => c.id === active)) useChat.getState().newChat();
      onDone(`Erased ${r.chats} chat${r.chats === 1 ? "" : "s"} and ${r.projects} project${r.projects === 1 ? "" : "s"}, freeing about ${formatBytes(bytes)}.`);
    } catch (e) { setError(String(e)); setConfirming(false); }
  };
  const Row = ({ title, last, size, checked, onToggle, extra }: { title: string; last: number; size: number; checked: boolean; onToggle: () => void; extra?: string }) => (
    <li>
      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border px-3 py-2 hover:bg-surface-secondary">
        <input type="checkbox" className="size-4 accent-primary" checked={checked} onChange={onToggle} />
        <span className="min-w-0 flex-1"><span className="block truncate font-medium">{title}</span><span className="block text-[12px] text-text-secondary">{extra ? `${extra} · ` : ""}{formatBytes(size)}</span></span>
        <span className="shrink-0 text-[12px] text-text-secondary" title={new Date(last * 1000).toLocaleString()}>last used {lastUsedLabel(last)}</span>
      </label>
    </li>
  );
  return (
    <Modal onClose={onClose} label="Clear unused chats and notes" width="max-w-xl">
      <ModalHeader title={confirming ? "Confirm: erase these?" : "Unused chats and project notes"} onClose={onClose} />
      <div className="space-y-3 p-5 text-[13px]">
        {!report ? <p className="text-text-secondary">Looking…</p> : report.chats.length + report.projects.length === 0 ? (
          <p className="text-text-secondary">Nothing has gone unused for {days} days, so there is nothing to clear.</p>
        ) : confirming ? (
          <>
            <p>These will be <strong>permanently erased</strong>. This cannot be undone:</p>
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {chosen.map((c) => <li key={`c${c.id}`} className="flex justify-between gap-3 rounded-lg bg-surface-secondary px-3 py-1.5"><span className="truncate">Chat: {c.title}</span><span className="shrink-0 text-text-secondary">last used {lastUsedLabel(c.last_used)}</span></li>)}
              {chosenProjects.map((p) => <li key={`p${p.id}`} className="flex justify-between gap-3 rounded-lg bg-surface-secondary px-3 py-1.5"><span className="truncate">Project: {p.title}</span><span className="shrink-0 text-text-secondary">last used {lastUsedLabel(p.last_used)}</span></li>)}
            </ul>
            <p className="text-text-secondary">{chosen.length} chat{chosen.length === 1 ? "" : "s"} and {chosenProjects.length} project{chosenProjects.length === 1 ? "" : "s"}, about {formatBytes(bytes)}. Chats inside an erased project are kept, just no longer linked to it.</p>
            {error && <p className="text-red-500" role="alert">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" autoFocus onClick={() => setConfirming(false)} className="rounded-full border border-border px-4 py-1.5 hover:bg-surface-secondary">Go back</button>
              <button type="button" onClick={() => void erase()} className="rounded-full bg-red-600 px-4 py-1.5 font-medium text-white">Erase {total} item{total === 1 ? "" : "s"}</button>
            </div>
          </>
        ) : (
          <>
            <p className="text-text-secondary">Not used for {days}+ days. Untick anything you want to keep. Nothing is erased until you confirm on the next screen.</p>
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {report.chats.map((c) => <Row key={`c${c.id}`} title={c.title} extra={`Chat · ${c.messages ?? 0} messages`} last={c.last_used} size={c.bytes} checked={chatIds.has(c.id)} onToggle={() => toggle(chatIds, setChatIds, c.id)} />)}
              {report.projects.map((p) => <Row key={`p${p.id}`} title={p.title} extra="Project notes" last={p.last_used} size={p.bytes} checked={projectIds.has(p.id)} onToggle={() => toggle(projectIds, setProjectIds, p.id)} />)}
            </ul>
            <div className="flex items-center justify-between gap-3">
              <span className="text-text-secondary">{total} selected · about {formatBytes(bytes)}</span>
              <div className="flex gap-2">
                <button type="button" onClick={onClose} className="rounded-full border border-border px-4 py-1.5 hover:bg-surface-secondary">Cancel</button>
                <button type="button" disabled={!total} onClick={() => setConfirming(true)} className="rounded-full bg-primary px-4 py-1.5 font-medium text-white disabled:opacity-50 dark:text-bg">Continue…</button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
