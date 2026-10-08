import { useState } from "react";
import { FolderOpen, Save, Trash2 } from "lucide-react";
import { createWorkspace, loadWorkspaces, persistWorkspaces, type Workspace } from "../lib/workspaces";
import { isPrivateWindow } from "../lib/ipc";
import { useStore } from "../store/useStore";

export function Workspaces() {
  const tabs = useStore((s) => s.tabs);
  const [list, setList] = useState(loadWorkspaces);
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  if (isPrivateWindow()) return <p className="text-text-secondary">Workspaces are unavailable in private windows.</p>;
  const commit = (next: Workspace[]) => { persistWorkspaces(next); setList(next); };
  const save = () => {
    try {
      const workspace = createWorkspace(name, tabs);
      commit([workspace, ...list]);
      setName("");
      setMessage(`Saved ${workspace.tabs.length} tabs in ${workspace.name}.`);
    } catch (e) { setMessage(e instanceof Error ? e.message : String(e)); }
  };
  const restore = async (w: Workspace) => {
    setBusy(true);
    try {
      const count = await useStore.getState().restoreTabs(w.tabs);
      setMessage(`Opened ${count} tabs from ${w.name}. Pages load when selected.`);
    } catch (e) { setMessage(`Could not open workspace: ${String(e)}`); }
    finally { setBusy(false); }
  };
  const needle = query.trim().toLowerCase();
  const shown = list.filter((w) => `${w.name} ${w.tabs.map((t) => `${t.title} ${t.url}`).join(" ")}`.toLowerCase().includes(needle));
  return <section className="space-y-2 rounded-xl border border-border p-3">
    <h3 className="font-semibold">Workspaces</h3>
    <p className="text-[12px] text-text-secondary">Save a set of tabs with its groups and pins. Restore alongside your current tabs.</p>
    <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <input aria-label="Workspace name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Research, work, weekend…" className="min-w-0 flex-1 rounded-lg border border-border bg-transparent px-2 py-1.5 outline-none focus:border-primary" />
      <button type="submit" disabled={!name.trim()} className="flex items-center gap-1 rounded-lg border border-border px-2 disabled:opacity-40"><Save size={13} /> Save</button>
    </form>
    {list.length > 0 && <input aria-label="Search workspaces" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search workspaces and their pages…" className="w-full rounded-lg border border-border bg-transparent px-2 py-1.5 outline-none focus:border-primary" />}
    <p role="status" className="text-[12px] text-primary">{message}</p>
    {shown.length === 0 && <p className="text-[12px] text-text-secondary">{list.length ? "No matching workspaces." : "No workspaces saved yet."}</p>}
    <ul className="space-y-2">{shown.map((w) => <li key={w.id} className="flex items-center gap-2 rounded-lg bg-surface-secondary p-2">
      <div className="min-w-0 flex-1"><p className="truncate font-medium" title={w.name}>{w.name}</p><p className="text-[11px] text-text-secondary">{w.tabs.length} tabs · {new Date(w.createdAt).toLocaleDateString()}</p></div>
      <button type="button" disabled={busy} onClick={() => void restore(w)} aria-label={`Open workspace ${w.name}`} title="Open workspace" className="rounded-md p-1.5 hover:bg-border disabled:opacity-40"><FolderOpen size={15} /></button>
      <button type="button" disabled={busy} onClick={() => {
        try { commit(list.filter((x) => x.id !== w.id)); setMessage(`Deleted ${w.name}.`); }
        catch (e) { setMessage(String(e)); }
      }} aria-label={`Delete workspace ${w.name}`} className="rounded-md p-1.5 hover:bg-border disabled:opacity-40"><Trash2 size={14} /></button>
    </li>)}</ul>
  </section>;
}
