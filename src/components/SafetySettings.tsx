import { useEffect, useState } from "react";
import { FolderLock, X } from "lucide-react";
import { ipc } from "../lib/ipc";
import { parseAppPerms, withApp, type AppAnswer } from "../lib/safety";
import { useStore } from "../store/useStore";

/** Settings → Assistant safety: Watch mode, apps the assistant may use, protected folders and the undo list. */
export function SafetySettings({ save }: { save: (key: string, value: string) => Promise<void> }) {
  const [watch, setWatch] = useState(false);
  const [apps, setApps] = useState<Record<string, AppAnswer>>({});
  const [folders, setFolders] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    void ipc.settingsGet().then((s) => { setWatch(s.screen_watch === "1"); setApps(parseAppPerms(s.screen_app_permissions)); });
    void ipc.protectedList().then(setFolders);
  }, []);
  const forget = async (app: string) => {
    const s = await ipc.settingsGet();
    const next = withApp(s.screen_app_permissions, app, null);
    await save("screen_app_permissions", next);
    setApps(parseAppPerms(next));
  };
  const act = async (fn: () => Promise<string[]>) => { try { setFolders(await fn()); setMsg(null); } catch (e) { setMsg(String(e)); } };
  const names = Object.keys(apps).sort((a, b) => a.localeCompare(b));

  return (
    <div className="py-2" aria-label="Assistant safety">
      <h3 className="pt-2 text-[12px] font-semibold uppercase tracking-wide text-text-secondary">Assistant safety</h3>
      <div className="flex items-center justify-between gap-4 py-2.5">
        <div>
          <p className="font-medium">Watch mode</p>
          <p className="text-[12px] text-text-secondary">While Screen mode works, show the exact screenshot it looked at, what it thinks and what it will do next, so you can learn how it works. The picture stays in memory and is never saved. Off by default.</p>
        </div>
        <input type="checkbox" role="switch" className="size-4 accent-primary" checked={watch} onChange={(e) => { setWatch(e.target.checked); void save("screen_watch", e.target.checked ? "1" : "0"); }} aria-label="Watch mode" />
      </div>

      <div className="py-2.5">
        <p className="font-medium">Apps</p>
        <p className="mb-2 text-[12px] text-text-secondary">The first time Screen mode is about to work in an app, it asks you, for that app only. Your answers are kept here; forget one to be asked again.</p>
        {names.length === 0 ? <p className="text-[12px] text-text-secondary">No apps yet.</p> : (
          <ul className="divide-y divide-border rounded-lg border border-border" aria-label="App permissions">
            {names.map((a) => (
              <li key={a} className="flex items-center justify-between gap-2 px-3 py-1.5">
                <span>{a} <span className={`ml-1 text-[11.5px] ${apps[a] === "allow" ? "text-group-personal" : "text-red-500"}`}>{apps[a] === "allow" ? "Allowed" : "Not allowed"}</span></span>
                <button type="button" onClick={() => void forget(a)} className="rounded-lg border border-border px-2 py-0.5 text-[12px] hover:bg-surface-secondary">{apps[a] === "allow" ? "Revoke" : "Forget"}</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="py-2.5">
        <p className="font-medium">Protected folders</p>
        <p className="mb-2 text-[12px] text-text-secondary">Quick Pebble never moves, renames or deletes anything in these folders. Screen mode is told to keep out of them, and any step that mentions one needs your OK (it works by clicking, so this is a rule it follows, not a lock).</p>
        {folders.length > 0 && (
          <ul className="mb-2 divide-y divide-border rounded-lg border border-border" aria-label="Protected folders">
            {folders.map((f) => (
              <li key={f} className="flex items-center gap-2 px-3 py-1.5">
                <FolderLock size={14} className="shrink-0 text-primary" />
                <span className="min-w-0 flex-1 truncate text-[12.5px]" title={f}>{f}</span>
                <button type="button" aria-label={`Stop protecting ${f}`} onClick={() => void act(() => ipc.protectedRemove(f))} className="grid size-6 place-items-center rounded-md hover:bg-surface-secondary"><X size={13} /></button>
              </li>
            ))}
          </ul>
        )}
        <button type="button" onClick={() => void act(() => ipc.protectedAdd())} className="rounded-lg border border-border px-3 py-1.5 hover:bg-surface-secondary">Add a protected folder…</button>
        {msg && <p role="alert" className="pt-1 text-[12px] text-red-500">{msg}</p>}
      </div>

      <div className="flex items-center justify-between gap-4 py-2.5">
        <div>
          <p className="font-medium">Recent changes</p>
          <p className="text-[12px] text-text-secondary">Everything Quick Pebble moved, renamed or sent to the Trash for you, with Undo, plus a receipt for each clean-up.</p>
        </div>
        <button type="button" onClick={() => useStore.getState().setOverlay("changes")} className="shrink-0 rounded-lg border border-border px-3 py-1.5 hover:bg-surface-secondary">Open</button>
      </div>
      <div className="flex items-center justify-between gap-4 py-2.5">
        <div>
          <p className="font-medium">Clean up and speed up</p>
          <p className="text-[12px] text-text-secondary">Find what's eating your disk, old installers, forgotten apps, untidy folders, unclear file names, slow apps and login items. Always a list first.</p>
        </div>
        <button type="button" onClick={() => useStore.getState().setOverlay("cleanup")} className="shrink-0 rounded-lg border border-border px-3 py-1.5 hover:bg-surface-secondary">Open clean-up</button>
      </div>
    </div>
  );
}
