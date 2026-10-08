import { useState } from "react";
import { AlertTriangle, CheckCircle2, File, FolderOpen, Trash2, XCircle } from "lucide-react";
import { ipc, type DownloadItem } from "../lib/ipc";
import { formatBytes, timeAgo } from "../lib/format";
import { useStore } from "../store/useStore";

/** Downloads in the side panel: progress state, open, show in folder, remove. Removing never deletes the file. */
export function DownloadsPanel() {
  const items = useStore((s) => s.downloads);
  const [msg, setMsg] = useState<string | null>(null);
  const fail = (e: unknown) => setMsg(String(e));
  const finished = items.filter((d) => d.state !== "active").length;

  const row = (d: DownloadItem) => (
    <li key={d.id} className="rounded-xl border border-border bg-surface p-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0 text-text-secondary">
          {d.state === "active" ? <span className="block size-4 animate-spin rounded-full border-2 border-border border-t-primary" aria-label="Downloading" /> : d.state === "done" ? <CheckCircle2 size={16} className="text-group-personal" /> : <XCircle size={16} className="text-red-500" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium" title={d.name}>{d.name}</p>
          <p className="truncate text-[11.5px] text-text-secondary">
            {d.state === "active" ? `Downloading from ${d.host}…` : d.state === "failed" ? `Failed · ${d.host}` : `${[formatBytes(d.size), d.host, d.finished ? timeAgo(d.finished) : ""].filter(Boolean).join(" · ")}`}
          </p>
          {d.state === "active" && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-secondary"><div className="h-full w-1/3 animate-pulse rounded-full bg-primary" /></div>}
          {d.state === "done" && !d.can_open && (
            <p className="mt-1.5 flex items-start gap-1.5 text-[11.5px] text-text-secondary"><AlertTriangle size={12} className="mt-0.5 shrink-0 text-group-school" />This type of file can run code, so it can only be shown in its folder. Only run it if you trust where it came from.</p>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {d.state === "done" && <button type="button" disabled={!d.can_open} title={d.can_open ? "Open the file" : "Files that can run code are not opened from here"} onClick={() => void ipc.downloadOpen(d.id).catch(fail)} className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-[12px] hover:bg-surface-secondary disabled:opacity-40"><File size={12} />Open</button>}
        {d.state === "done" && <button type="button" onClick={() => void ipc.downloadReveal(d.id).catch(fail)} className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-[12px] hover:bg-surface-secondary"><FolderOpen size={12} />Show in folder</button>}
        {d.state !== "active" && <button type="button" aria-label={`Remove ${d.name} from the list`} title="Remove from list (the file stays on your computer)" onClick={() => void ipc.downloadRemove(d.id)} className="ml-auto grid size-7 place-items-center rounded-lg text-text-secondary hover:bg-surface-secondary hover:text-red-500"><Trash2 size={13} /></button>}
      </div>
    </li>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <p className="text-[12px] text-text-secondary">Saved to your Downloads folder</p>
        <button type="button" disabled={finished === 0} onClick={() => void ipc.downloadsClearFinished()} className="rounded-lg border border-border px-2.5 py-1 text-[12px] hover:bg-surface-secondary disabled:opacity-40">Clear finished</button>
      </div>
      {msg && <p role="alert" className="px-3 pt-2 text-[12px] text-red-500">{msg}</p>}
      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {items.map(row)}
        {items.length === 0 && <li className="px-3 py-10 text-center text-text-secondary">No downloads yet. Files you download from a website show up here.</li>}
      </ul>
    </div>
  );
}
