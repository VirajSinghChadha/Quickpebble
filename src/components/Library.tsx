import { useEffect, useState } from "react";
import { Bookmark, Brain, Clock, Search, Trash2 } from "lucide-react";
import { ipc, type Bookmark as Bm, type HistoryEntry, type RecallHit } from "../lib/ipc";
import { displayUrl, hostOf } from "../lib/url";
import { selectActive, useStore } from "../store/useStore";
import { Favicon } from "./Favicon";
import { Modal, ModalHeader } from "./Modal";

/** ⌘Y: search history and bookmarks. */
export function Library() {
  const [tab, setTab] = useState<"history" | "bookmarks" | "memory">("history");
  const [q, setQ] = useState("");
  const [hist, setHist] = useState<HistoryEntry[]>([]);
  const [marks, setMarks] = useState<Bm[]>([]);
  const [recalled, setRecalled] = useState<RecallHit[]>([]);
  const [recall, setRecall] = useState<{ pages: number; enabled: boolean } | null>(null);
  const close = () => useStore.getState().setOverlay(null);

  useEffect(() => {
    let stale = false;
    const t = setTimeout(async () => {
      const [h, b, r, st] = await Promise.all([ipc.historySearch(q, 100), ipc.bookmarkList(q), q.trim() ? ipc.recallSearch(q, 20) : Promise.resolve([]), ipc.recallStats()]);
      if (!stale) (setHist(h), setMarks(b), setRecalled(r), setRecall(st));
    }, 80);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [q]);

  const open = (url: string) => {
    close();
    const s = useStore.getState();
    const cur = selectActive(s);
    if (cur.url) s.newTab(url);
    else void s.navigate(cur.id, url);
  };
  const rows: { url: string; title: string; snippet?: string }[] = tab === "history" ? hist : tab === "bookmarks" ? marks : recalled;
  const forget = async (url: string) => { await ipc.recallForget(url); setRecalled((r) => r.filter((x) => x.url !== url)); setRecall(await ipc.recallStats()); };
  const toggleRecall = async () => { await ipc.settingsSet("recall_enabled", String(!recall?.enabled)); setRecall(await ipc.recallStats()); };
  const clearRecall = async () => { await ipc.recallClear(); setRecalled([]); setRecall(await ipc.recallStats()); };

  return (
    <Modal onClose={close} label="Library" width="max-w-2xl">
      <ModalHeader title="Library" onClose={close} />
      <div className="flex items-center gap-2 border-b border-border px-5 py-3">
        <div className="flex rounded-lg bg-surface-secondary p-0.5">
          {([["history", "History", Clock], ["bookmarks", "Bookmarks", Bookmark], ["memory", "Memory", Brain]] as const).map(([id, label, Icon]) => (
            <button key={id} type="button" onClick={() => setTab(id)} aria-pressed={tab === id} className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-[12px] font-medium ${tab === id ? "bg-surface shadow-pebble" : "text-text-secondary"}`}><Icon size={13} /> {label}</button>
          ))}
        </div>
        <div className="flex h-8 flex-1 items-center gap-2 rounded-lg border border-border px-2.5 focus-within:border-primary">
          <Search size={14} className="text-text-secondary" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={tab === "memory" ? "Search the text of pages you've read" : `Search ${tab}`} aria-label={`Search ${tab}`} className="flex-1 bg-transparent outline-none" />
        </div>
      </div>
      {tab === "memory" && recall && (
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-2 text-[12px] text-text-secondary">
          <span>{recall.enabled ? `Recall is on · ${recall.pages} pages remembered on this computer. Logins, payments, webmail and private windows are never saved.` : "Recall is off. Turn it on to search the text of pages you read, stored only on this computer."}</span>
          <span className="flex shrink-0 gap-2">
            <button type="button" onClick={() => void toggleRecall()} className="rounded-lg border border-border px-2 py-1 hover:bg-surface-secondary">{recall.enabled ? "Turn off" : "Turn on"}</button>
            {recall.pages > 0 && <button type="button" onClick={() => void clearRecall()} className="rounded-lg border border-border px-2 py-1 hover:bg-surface-secondary">Clear all</button>}
          </span>
        </div>
      )}
      <ul className="overflow-y-auto p-2">
        {rows.length === 0 && <li className="px-3 py-8 text-center text-text-secondary">{tab === "memory" && !q.trim() ? "Type to search the pages you've read." : "Nothing found."}</li>}
        {rows.map((r) => (
          <li key={r.url}>
            <button type="button" onClick={() => open(r.url)} className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left hover:bg-surface-secondary">
              <Favicon src="" url={r.url} />
              <span className="min-w-0 flex-1 truncate">{r.title || hostOf(r.url)}</span>
              <span className="max-w-[45%] truncate text-[11.5px] text-text-secondary">{displayUrl(r.url)}</span>
            </button>
            {tab === "memory" && <div className="flex items-start gap-2 px-3 pb-2 pl-10"><p className="min-w-0 flex-1 text-[12px] leading-relaxed text-text-secondary">{r.snippet}</p><button type="button" aria-label="Forget this page" title="Forget this page" onClick={() => void forget(r.url)} className="grid size-6 shrink-0 place-items-center rounded-md text-text-secondary hover:bg-surface-secondary"><Trash2 size={12} /></button></div>}
          </li>
        ))}
      </ul>
    </Modal>
  );
}
