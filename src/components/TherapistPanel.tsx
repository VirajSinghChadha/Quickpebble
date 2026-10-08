import { useState } from "react";
import { Bookmark, ExternalLink, FolderTree, Save, Sparkles, Trash2, X } from "lucide-react";
import { analyze, addSaved, loadSaved, organize, persistSaved, type SavedTab } from "../lib/therapist";
import { tabLabel } from "../lib/url";
import { selectActive, useStore } from "../store/useStore";
import { Favicon } from "./Favicon";
import { Workspaces } from "./Workspaces";
import { isPrivateWindow } from "../lib/ipc";

/** Native version of the Tab Therapist extension. */
export function TherapistPanel() {
  const tabs = useStore((s) => s.tabs);
  const active = useStore(selectActive);
  const privateWindow = isPrivateWindow();
  const [saved, setSaved] = useState<SavedTab[]>(() => privateWindow ? [] : loadSaved());
  const [query, setQuery] = useState("");
  const [opening, setOpening] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const a = analyze(tabs, active.id);
  const { closeTab, activate, setGroup, newTab } = useStore.getState();

  const commit = (next: SavedTab[]) => {
    if (privateWindow) return;
    setSaved(next);
    persistSaved(next);
  };
  const saveTabs = (list: typeof tabs) => commit(list.reduce(addSaved, saved));
  const needle = query.trim().toLowerCase();
  const shownSaved = saved.filter((s) => `${s.title} ${s.url}`.toLowerCase().includes(needle));
  const bar = a.score >= 80 ? "bg-group-personal" : a.score >= 50 ? "bg-group-school" : "bg-red-500";
  const btn = "flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-2 py-2 text-[12px] transition-colors duration-150 hover:bg-surface-secondary disabled:opacity-40";

  return (
    <div className="h-full space-y-4 overflow-y-auto p-3">
      <section className="rounded-2xl bg-surface-secondary p-4">
        <div className="mb-2 flex items-baseline justify-between"><span className="font-semibold">Tab Health</span><span className="text-2xl font-semibold tabular-nums" aria-label={`Score ${a.score} out of 100`}>{a.score}</span></div>
        <div className="h-2 overflow-hidden rounded-full bg-border" role="progressbar" aria-valuenow={a.score} aria-valuemin={0} aria-valuemax={100}>
          <div className={`h-full rounded-full transition-all duration-300 ${bar}`} style={{ width: `${a.score}%` }} />
        </div>
        <p className="mt-2 text-text-secondary">{a.message}</p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[["Open", a.total], ["Duplicates", a.duplicates.length], ["Inactive", a.inactive]].map(([l, n]) => (
            <div key={l} className="rounded-xl bg-surface py-2"><strong className="block text-[16px] tabular-nums">{n}</strong><span className="text-[11px] text-text-secondary">{l}</span></div>
          ))}
        </div>
      </section>

      <div className="flex gap-2">
        <button type="button" className={btn} disabled={a.duplicates.length === 0} onClick={() => { a.duplicates.forEach((t) => closeTab(t.id)); setNote(`Closed ${a.duplicates.length} duplicate${a.duplicates.length === 1 ? "" : "s"}`); }}><Sparkles size={13} /> Clean</button>
        <button type="button" className={btn} onClick={() => { const m = organize(tabs); m.forEach((g, id) => setGroup(id, g)); setNote(m.size ? `Grouped ${m.size} tabs` : "Nothing to group yet — I need 2+ tabs in a category"); }}><FolderTree size={13} /> Organize</button>
        <button type="button" className={btn} disabled={privateWindow} onClick={() => { saveTabs(tabs); setNote("Saved your open tabs"); }}><Save size={13} /> Save all</button>
      </div>
      {note && <p role="status" className="text-center text-primary">{note}</p>}

      <section className="rounded-2xl border border-border p-3">
        <h3 className="mb-1 font-semibold">Therapist says</h3>
        <p className="text-text-secondary">{a.recommendation}</p>
      </section>

      <section>
        <h3 className="mb-1.5 font-semibold">Your tabs</h3>
        <ul className="space-y-0.5">
          {tabs.map((t) => (
            <li key={t.id} className="group flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-surface-secondary">
              <button type="button" onClick={() => activate(t.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <Favicon src={t.favicon} url={t.url} />
                <span className="min-w-0 flex-1 truncate">{tabLabel(t.title, t.url)}</span>
              </button>
              <button type="button" aria-label="Save tab for later" title="Save for later" disabled={!t.url || privateWindow} onClick={() => saveTabs([t])} className="grid size-6 place-items-center rounded-md text-text-secondary opacity-0 hover:bg-border group-hover:opacity-100 focus-visible:opacity-100 disabled:hidden"><Bookmark size={13} /></button>
              <button type="button" aria-label="Close tab" onClick={() => closeTab(t.id)} className="grid size-6 place-items-center rounded-md text-text-secondary opacity-0 hover:bg-border group-hover:opacity-100 focus-visible:opacity-100"><X size={13} /></button>
            </li>
          ))}
        </ul>
      </section>

      <Workspaces />
      <section>
        <h3 className="mb-1.5 font-semibold">Saved tabs</h3>
        {privateWindow && <p className="text-text-secondary">Saved tabs are unavailable in private windows.</p>}
        {saved.length > 0 && <div className="mb-2 flex gap-2">
          <input aria-label="Search saved tabs" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search saved tabs…" className="min-w-0 flex-1 rounded-lg border border-border bg-transparent px-2 py-1.5 outline-none focus:border-primary" />
          <button type="button" disabled={opening || !shownSaved.length} className={btn} onClick={async () => {
            setOpening(true);
            try {
              const count = await useStore.getState().restoreTabs(shownSaved.map((s) => ({ ...s, pinned: false, group: null })));
              setNote(`Opened ${count} saved tabs. Pages load when selected.`);
            } catch (e) { setNote(`Could not open saved tabs: ${String(e)}`); }
            finally { setOpening(false); }
          }}>Open all ({shownSaved.length})</button>
        </div>}
        {saved.length > 0 && shownSaved.length === 0 && <p className="text-text-secondary">No saved tabs match.</p>}
        {saved.length === 0 && <p className="rounded-xl border border-dashed border-border p-3 text-center text-text-secondary">No saved tabs.</p>}
        <ul className="space-y-0.5">
          {shownSaved.map((s) => (
            <li key={s.url} className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-surface-secondary">
              <Favicon src={s.favicon} url={s.url} />
              <span className="min-w-0 flex-1 truncate" title={s.url}>{s.title}</span>
              <button type="button" aria-label="Open saved tab" onClick={() => newTab(s.url)} className="grid size-6 place-items-center rounded-md text-text-secondary hover:bg-border"><ExternalLink size={13} /></button>
              <button type="button" aria-label="Delete saved tab" onClick={() => commit(saved.filter((t) => t.url !== s.url))} className="grid size-6 place-items-center rounded-md text-text-secondary hover:bg-border"><Trash2 size={13} /></button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
