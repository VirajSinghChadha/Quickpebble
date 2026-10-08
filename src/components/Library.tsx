import { useEffect, useState } from "react";
import { Bookmark, Clock, Search } from "lucide-react";
import { ipc, type Bookmark as Bm, type HistoryEntry } from "../lib/ipc";
import { displayUrl, hostOf } from "../lib/url";
import { selectActive, useStore } from "../store/useStore";
import { Favicon } from "./Favicon";
import { Modal, ModalHeader } from "./Modal";

/** ⌘Y: search history and bookmarks. */
export function Library() {
  const [tab, setTab] = useState<"history" | "bookmarks">("history");
  const [q, setQ] = useState("");
  const [hist, setHist] = useState<HistoryEntry[]>([]);
  const [marks, setMarks] = useState<Bm[]>([]);
  const close = () => useStore.getState().setOverlay(null);

  useEffect(() => {
    let stale = false;
    const t = setTimeout(async () => {
      const [h, b] = await Promise.all([ipc.historySearch(q, 100), ipc.bookmarkList(q)]);
      if (!stale) (setHist(h), setMarks(b));
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
  const rows = tab === "history" ? hist : marks;

  return (
    <Modal onClose={close} label="Library" width="max-w-2xl">
      <ModalHeader title="Library" onClose={close} />
      <div className="flex items-center gap-2 border-b border-border px-5 py-3">
        <div className="flex rounded-lg bg-surface-secondary p-0.5">
          {([["history", "History", Clock], ["bookmarks", "Bookmarks", Bookmark]] as const).map(([id, label, Icon]) => (
            <button key={id} type="button" onClick={() => setTab(id)} aria-pressed={tab === id} className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-[12px] font-medium ${tab === id ? "bg-surface shadow-pebble" : "text-text-secondary"}`}><Icon size={13} /> {label}</button>
          ))}
        </div>
        <div className="flex h-8 flex-1 items-center gap-2 rounded-lg border border-border px-2.5 focus-within:border-primary">
          <Search size={14} className="text-text-secondary" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${tab}`} aria-label={`Search ${tab}`} className="flex-1 bg-transparent outline-none" />
        </div>
      </div>
      <ul className="overflow-y-auto p-2">
        {rows.length === 0 && <li className="px-3 py-8 text-center text-text-secondary">Nothing found.</li>}
        {rows.map((r) => (
          <li key={r.url}>
            <button type="button" onClick={() => open(r.url)} className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left hover:bg-surface-secondary">
              <Favicon src="" url={r.url} />
              <span className="min-w-0 flex-1 truncate">{r.title || hostOf(r.url)}</span>
              <span className="max-w-[45%] truncate text-[11.5px] text-text-secondary">{displayUrl(r.url)}</span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
