import { useEffect, useState } from "react";
import { ipc, type ContextUsage, type StaleReport, type StaleRow } from "../lib/ipc";
import { buildTranscript, cleanSummary, formatBytes, lastUsedLabel, plannedAction, SUMMARY_PROMPT, type CleanupMode as Mode } from "../lib/context";
import { useHidePage } from "../hooks/useHidePage";
import { useChat } from "../store/useChat";
import { Modal, ModalHeader } from "./Modal";

const AGES = [14, 30, 60, 90, 180];
const SUMMARY_BYTES = 700; // a rough size for one kept summary, for the "frees about" estimate

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

function Row({ title, last, size, checked, onToggle, extra, badge }: { title: string; last: number; size: number; checked: boolean; onToggle: () => void; extra?: string; badge?: string }) {
  return (
    <li>
      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border px-3 py-2 hover:bg-surface-secondary">
        <input type="checkbox" className="size-4 accent-primary" checked={checked} onChange={onToggle} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{title}</span>
          <span className="block text-[12px] text-text-secondary">{extra ? `${extra} · ` : ""}{formatBytes(size)}{badge ? ` · ${badge}` : ""}</span>
        </span>
        <span className="shrink-0 text-[12px] text-text-secondary" title={new Date(last * 1000).toLocaleString()}>last used {lastUsedLabel(last)}</span>
      </label>
    </li>
  );
}

function CleanupDialog({ days, onClose, onDone }: { days: number; onClose: () => void; onDone: (message: string) => void }) {
  useHidePage();
  const [report, setReport] = useState<StaleReport | null>(null);
  const [chatIds, setChatIds] = useState<Set<number>>(new Set());
  const [projectIds, setProjectIds] = useState<Set<number>>(new Set());
  const [mode, setMode] = useState<Mode>("squash");
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void ipc.ctxStale(days).then((r) => { setReport(r); setChatIds(new Set(r.chats.map((c) => c.id))); setProjectIds(new Set(r.projects.map((p) => p.id))); });
  }, [days]);
  const toggle = (set: Set<number>, put: (s: Set<number>) => void, id: number) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); put(n); };
  const chosen = report?.chats.filter((c) => chatIds.has(c.id)) ?? [];
  const chosenProjects = report?.projects.filter((p) => projectIds.has(p.id)) ?? [];
  const toSquash = chosen.filter((c) => plannedAction(c, mode) === "squash");
  const toErase = chosen.filter((c) => plannedAction(c, mode) === "erase");
  const freed = toSquash.reduce((n, c) => n + Math.max(0, c.bytes - SUMMARY_BYTES), 0) + toErase.reduce((n, c) => n + c.bytes, 0) + chosenProjects.reduce((n, p) => n + p.bytes, 0);
  const total = chosen.length + chosenProjects.length;

  const run = async () => {
    setError(null);
    let squashed = 0, saved = 0;
    const failed: string[] = [];
    let aiProblem = "";
    try {
      for (const [i, c] of toSquash.entries()) {
        setWorking(`Summarizing ${i + 1} of ${toSquash.length}: ${c.title}`);
        if (aiProblem) { failed.push(c.title); continue; }
        try {
          const chat = await ipc.ctxChatPeek(c.id);
          const reply = await ipc.aiChat(SUMMARY_PROMPT, [{ role: "user", content: buildTranscript(chat.items) }], false);
          const summary = cleanSummary(reply);
          if (!summary) { failed.push(c.title); continue; }
          const r = await ipc.ctxChatSquash(c.id, summary);
          squashed++; saved += r.saved;
        } catch (e) {
          failed.push(c.title);
          aiProblem = String(e);   // most likely no key / offline / over the limit: don't hammer the rest
        }
      }
      setWorking("Erasing…");
      const r = await ipc.ctxClear(toErase.map((c) => c.id), chosenProjects.map((p) => p.id));
      const active = useChat.getState().chatId;
      if (active && toErase.some((c) => c.id === active)) useChat.getState().newChat();
      else if (active && toSquash.some((c) => c.id === active)) void useChat.getState().openChat(active, true);
      const parts = [
        squashed ? `Summarized ${squashed} chat${squashed === 1 ? "" : "s"} (kept as short summaries, freeing about ${formatBytes(saved)})` : "",
        r.chats || r.projects ? `Erased ${r.chats} chat${r.chats === 1 ? "" : "s"} and ${r.projects} project${r.projects === 1 ? "" : "s"}` : "",
        failed.length ? `${failed.length} could not be summarized and ${failed.length === 1 ? "was" : "were"} left alone${aiProblem ? ` (${aiProblem.slice(0, 120)})` : ""}` : "",
      ].filter(Boolean);
      onDone(`${parts.join(". ")}.`);
    } catch (e) {
      setError(String(e));
      setConfirming(false);
    } finally {
      setWorking(null);
    }
  };

  const list = (rows: StaleRow[], verb: string) => rows.length > 0 && (
    <>
      <p className="font-medium">{verb}</p>
      <ul className="space-y-1">{rows.map((c) => <li key={c.id} className="flex justify-between gap-3 rounded-lg bg-surface-secondary px-3 py-1.5"><span className="truncate">{c.title}</span><span className="shrink-0 text-text-secondary">last used {lastUsedLabel(c.last_used)}</span></li>)}</ul>
    </>
  );

  return (
    <Modal onClose={() => !working && onClose()} label="Clear unused chats and notes" width="max-w-xl">
      <ModalHeader title={confirming ? "Confirm these changes" : "Unused chats and project notes"} onClose={() => !working && onClose()} />
      <div className="space-y-3 p-5 text-[13px]">
        {!report ? <p className="text-text-secondary">Looking…</p> : report.chats.length + report.projects.length === 0 ? (
          <p className="text-text-secondary">Nothing has gone unused for {days} days, so there is nothing to clear.</p>
        ) : working ? (
          <p className="flex items-center gap-2 text-text-secondary" role="status"><span className="size-3.5 animate-spin rounded-full border-2 border-border border-t-primary" />{working}</p>
        ) : confirming ? (
          <>
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {list(toSquash, "Will be squashed into a short summary (you keep the context):")}
              {list(toErase, "Will be erased for good:")}
              {chosenProjects.length > 0 && <><p className="font-medium">Project notes that will be erased for good:</p><ul className="space-y-1">{chosenProjects.map((p) => <li key={p.id} className="flex justify-between gap-3 rounded-lg bg-surface-secondary px-3 py-1.5"><span className="truncate">{p.title}</span><span className="shrink-0 text-text-secondary">last used {lastUsedLabel(p.last_used)}</span></li>)}</ul></>}
            </div>
            <p className="text-text-secondary">This frees about {formatBytes(freed)}. Erasing cannot be undone. {toSquash.length > 0 ? "Summaries are written by your AI provider from the old messages, which are sent to it once for that." : ""} Chats inside an erased project are kept, just no longer linked to it.</p>
            {error && <p className="text-red-500" role="alert">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" autoFocus onClick={() => setConfirming(false)} className="rounded-full border border-border px-4 py-1.5 hover:bg-surface-secondary">Go back</button>
              <button type="button" onClick={() => void run()} className={`rounded-full px-4 py-1.5 font-medium text-white ${toErase.length + chosenProjects.length ? "bg-red-600" : "bg-primary dark:text-bg"}`}>
                {[toSquash.length ? `Summarize ${toSquash.length}` : "", toErase.length + chosenProjects.length ? `erase ${toErase.length + chosenProjects.length}` : ""].filter(Boolean).join(" and ").replace(/^./, (m) => m.toUpperCase())}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-text-secondary">Not used for {days}+ days. Untick anything you want to keep. Nothing changes until you confirm on the next screen.</p>
            <div className="flex items-center gap-2" role="radiogroup" aria-label="What to do with the chats you pick">
              <span className="text-text-secondary">For chats:</span>
              {([["squash", "Squash into a summary"], ["erase", "Erase"]] as const).map(([m, label]) => (
                <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={`rounded-full border px-3 py-1 ${mode === m ? "border-primary bg-primary/10 font-medium" : "border-border hover:bg-surface-secondary"}`}>{label}</button>
              ))}
            </div>
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {report.chats.map((c) => <Row key={`c${c.id}`} title={c.title} extra={`Chat · ${c.messages ?? 0} messages`} last={c.last_used} size={c.bytes} badge={plannedAction(c, mode) === "squash" ? "becomes a summary" : c.summarized ? "already a summary: erase only" : "will be erased"} checked={chatIds.has(c.id)} onToggle={() => toggle(chatIds, setChatIds, c.id)} />)}
              {report.projects.map((p) => <Row key={`p${p.id}`} title={p.title} extra="Project notes" last={p.last_used} size={p.bytes} badge="will be erased" checked={projectIds.has(p.id)} onToggle={() => toggle(projectIds, setProjectIds, p.id)} />)}
            </ul>
            <div className="flex items-center justify-between gap-3">
              <span className="text-text-secondary">{total} selected · frees about {formatBytes(freed)}</span>
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
