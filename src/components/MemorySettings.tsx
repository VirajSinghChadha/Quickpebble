import { useEffect, useState } from "react";
import { FolderSearch, X } from "lucide-react";
import { ipc, type FileFolder } from "../lib/ipc";
import { timeAgo } from "../lib/format";
import { useStore } from "../store/useStore";

/** Settings → Answer from my files, and the opt-in timeline. */
export function MemorySettings({ save }: { save: (key: string, value: string) => Promise<void> }) {
  const [folders, setFolders] = useState<FileFolder[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [timeline, setTimeline] = useState(false);
  useEffect(() => {
    void ipc.filesFolders().then(setFolders);
    void ipc.settingsGet().then((s) => setTimeline(s.timeline_enabled === "1"));
  }, []);
  const act = async (what: string, fn: () => Promise<unknown>) => {
    setBusy(what); setMsg(null);
    try { await fn(); } catch (e) { setMsg(String(e)); } finally { setBusy(null); setFolders(await ipc.filesFolders()); }
  };

  return (
    <div className="py-2" aria-label="Memory and knowledge">
      <h3 className="pt-2 text-[12px] font-semibold uppercase tracking-wide text-text-secondary">Answer from my files</h3>
      <p className="py-1.5 text-[12px] text-text-secondary">Choose folders of notes, PDFs and documents (txt, md, html, rtf, docx, pdf). Quick Pebble keeps a search index of them in its own database on this computer. When you tick “Search my files” in the assistant, it shows you which excerpts it would send and waits for your OK. Protected folders are never read.</p>
      {folders.length > 0 && (
        <ul className="mb-2 divide-y divide-border rounded-lg border border-border" aria-label="Indexed folders">
          {folders.map((f) => (
            <li key={f.path} className="flex items-center gap-2 px-3 py-1.5">
              <FolderSearch size={14} className="shrink-0 text-primary" />
              <span className="min-w-0 flex-1"><span className="block truncate text-[12.5px]" title={f.path}>{f.path}</span><span className="text-[11px] text-text-secondary">{f.files} files{f.skipped ? `, ${f.skipped} couldn't be read` : ""}{f.indexed_at ? ` · indexed ${timeAgo(f.indexed_at)}` : " · not indexed yet"}</span></span>
              <button type="button" aria-label={`Stop using ${f.path}`} disabled={!!busy} onClick={() => void act("Removing…", () => ipc.filesRemoveFolder(f.path))} className="grid size-6 place-items-center rounded-md hover:bg-surface-secondary"><X size={13} /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!!busy} onClick={() => void act("Reading the folder…", () => ipc.filesAddFolder())} className="rounded-lg border border-border px-3 py-1.5 hover:bg-surface-secondary disabled:opacity-40">Add a folder…</button>
        {folders.length > 0 && <button type="button" disabled={!!busy} onClick={() => void act("Updating the index…", () => ipc.filesReindex())} className="rounded-lg border border-border px-3 py-1.5 hover:bg-surface-secondary disabled:opacity-40">Update the index</button>}
      </div>
      {busy && <p role="status" className="pt-1 text-[12px] text-text-secondary">{busy}</p>}
      {msg && <p role="alert" className="pt-1 text-[12px] text-red-500">{msg}</p>}

      <h3 className="pt-4 text-[12px] font-semibold uppercase tracking-wide text-text-secondary">Timeline</h3>
      <div className="flex items-center justify-between gap-4 py-2.5">
        <div>
          <p className="font-medium">Keep a timeline of my day</p>
          <p className="text-[12px] text-text-secondary">Scroll back through pages you read, files you downloaded, chats and assistant tasks, by day. Kept only on this computer for 30 days, never from private windows. Off by default; “Clear all” in the timeline empties it.</p>
        </div>
        <input type="checkbox" role="switch" className="size-4 accent-primary" checked={timeline} onChange={(e) => { setTimeline(e.target.checked); void save("timeline_enabled", e.target.checked ? "1" : "0"); }} aria-label="Keep a timeline of my day" />
      </div>
      {timeline && <button type="button" onClick={() => useStore.getState().setOverlay("library")} className="rounded-lg border border-border px-3 py-1.5 hover:bg-surface-secondary">Open the timeline</button>}
    </div>
  );
}
