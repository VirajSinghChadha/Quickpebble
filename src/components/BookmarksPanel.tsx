import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Folder, FolderInput, Search, Trash2 } from "lucide-react";
import { ipc, type Bookmark } from "../lib/ipc";
import { hostOf } from "../lib/url";
import { selectActive, useStore } from "../store/useStore";
import { Favicon } from "./Favicon";

const bump = () => useStore.setState((s) => ({ bookmarksVersion: s.bookmarksVersion + 1 }));

/** Bookmarks manager in the side panel, so the page stays visible while you organise. */
export function BookmarksPanel() {
  const version = useStore((s) => s.bookmarksVersion);
  const [marks, setMarks] = useState<Bookmark[]>([]);
  const [query, setQuery] = useState("");
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [moving, setMoving] = useState<string | null>(null);
  const [folderInput, setFolderInput] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => void ipc.bookmarkList(query).then(setMarks), [version, query]);

  const groups = useMemo(() => {
    const m = new Map<string, Bookmark[]>();
    for (const b of marks) m.set(b.folder, [...(m.get(b.folder) ?? []), b]);
    // Named folders alphabetically, unfiled pages last.
    return [...m.entries()].sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)));
  }, [marks]);
  const folders = groups.map(([f]) => f).filter(Boolean);

  const open = (url: string) => {
    const s = useStore.getState();
    const cur = selectActive(s);
    if (cur.url) s.newTab(url);
    else void s.navigate(cur.id, url);
  };
  const run = async (job: () => Promise<number | null>, what: string) => {
    try {
      const n = await job();
      setMsg(n === null ? null : n === 0 ? `Nothing new to import from ${what}.` : `Imported ${n} bookmark${n === 1 ? "" : "s"} from ${what}.`);
      bump();
    } catch (e) {
      setMsg(String(e));
    }
  };
  const move = async (url: string) => {
    await ipc.bookmarkSetFolder(url, folderInput.trim()).catch((e) => setMsg(String(e)));
    setMoving(null);
    bump();
  };
  const remove = async (b: Bookmark) => {
    await ipc.bookmarkToggle(b.url, b.title);
    bump();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b border-border p-3">
        <label className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 focus-within:border-primary">
          <Search size={14} className="text-text-secondary" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search bookmarks" aria-label="Search bookmarks" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-text-secondary" />
        </label>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => void run(() => ipc.bookmarksImportChrome(), "Chrome")} className="rounded-lg border border-border px-2.5 py-1 text-[12px] hover:bg-surface-secondary">Import from Chrome</button>
          <button type="button" onClick={() => void run(() => ipc.bookmarksImportFile(), "that file")} className="rounded-lg border border-border px-2.5 py-1 text-[12px] hover:bg-surface-secondary">Import from file…</button>
        </div>
        {msg && <p role="status" className="text-[11.5px] text-text-secondary">{msg}</p>}
        <p className="text-[11px] text-text-secondary">For Safari, Firefox, Edge or Brave: export bookmarks as an HTML file from that browser, then choose “Import from file”.</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {marks.length === 0 && <p className="px-3 py-6 text-center text-text-secondary">{query ? "No bookmarks match." : "No bookmarks yet. Press ⌘D on a page, or import them above."}</p>}
        {groups.map(([folder, items]) => {
          const shut = closed.has(folder);
          return (
            <section key={folder || "_"} className="mb-1">
              {folder !== "" || groups.length > 1 ? (
                <button type="button" onClick={() => setClosed((c) => { const n = new Set(c); n.has(folder) ? n.delete(folder) : n.add(folder); return n; })} aria-expanded={!shut} className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[12px] font-semibold text-text-secondary hover:bg-surface-secondary">
                  {shut ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                  <Folder size={13} /> <span className="truncate">{folder || "Unfiled"}</span>
                  <span className="ml-auto font-normal">{items.length}</span>
                </button>
              ) : null}
              {!shut && items.map((b) => (
                <div key={b.url} className="group rounded-lg hover:bg-surface-secondary">
                  <div className="flex items-center gap-2 px-2 py-1.5">
                    <button type="button" onClick={() => open(b.url)} title={b.url} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                      <Favicon src="" url={b.url} size={14} />
                      <span className="min-w-0"><span className="block truncate">{b.title || hostOf(b.url)}</span><span className="block truncate text-[11px] text-text-secondary">{hostOf(b.url)}</span></span>
                    </button>
                    <button type="button" aria-label={`Move ${b.title || b.url} to a folder`} title="Move to folder" onClick={() => { setMoving(moving === b.url ? null : b.url); setFolderInput(b.folder); }} className="grid size-6 shrink-0 place-items-center rounded-md text-text-secondary opacity-0 hover:bg-surface group-hover:opacity-100 focus-visible:opacity-100"><FolderInput size={13} /></button>
                    <button type="button" aria-label={`Remove ${b.title || b.url}`} title="Remove bookmark" onClick={() => void remove(b)} className="grid size-6 shrink-0 place-items-center rounded-md text-text-secondary opacity-0 hover:bg-surface hover:text-red-500 group-hover:opacity-100 focus-visible:opacity-100"><Trash2 size={13} /></button>
                  </div>
                  {moving === b.url && (
                    <form className="flex gap-1.5 px-2 pb-2" onSubmit={(e) => { e.preventDefault(); void move(b.url); }}>
                      <input autoFocus list="qp-folders" value={folderInput} onChange={(e) => setFolderInput(e.target.value)} placeholder="Folder name (empty = unfiled)" aria-label="Folder name" maxLength={80} className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-1 outline-none focus:border-primary" />
                      <datalist id="qp-folders">{folders.map((f) => <option key={f} value={f} />)}</datalist>
                      <button type="submit" className="rounded-lg bg-primary px-2.5 py-1 font-medium text-white dark:text-bg">Move</button>
                    </form>
                  )}
                </div>
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
