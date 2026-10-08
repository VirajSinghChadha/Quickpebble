import { useCallback, useEffect, useState } from "react";
import { HeartPulse, Puzzle, ShieldAlert, Trash2, TriangleAlert } from "lucide-react";
import { ipc, type ExtensionInfo } from "../lib/ipc";
import { selectActive, useStore } from "../store/useStore";
import { Modal, ModalHeader } from "./Modal";

const STORE_RE = /^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore)\//;

export function ExtensionsPanel() {
  const activeUrl = useStore((s) => selectActive(s).url);
  const [list, setList] = useState<ExtensionInfo[]>([]);
  const [input, setInput] = useState(STORE_RE.test(activeUrl) ? activeUrl : "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const close = () => useStore.getState().setOverlay(null);

  const load = useCallback(async () => setList(await ipc.extensionList()), []);
  useEffect(() => void load(), [load]);

  const run = async (fn: () => Promise<ExtensionInfo | null>) => {
    setBusy(true);
    setMsg(null);
    try {
      const info = await fn();
      if (info) setMsg({ ok: true, text: `Installed “${info.name}”. It is off until you review it and switch it on.` });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={close} label="Extensions" width="max-w-2xl">
      <ModalHeader title="Extensions" onClose={close} />
      <div className="space-y-5 overflow-y-auto px-5 py-5">
        <section className="flex items-center gap-3 rounded-2xl border border-border p-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-secondary text-primary"><HeartPulse size={20} /></span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Tab Therapist <span className="ml-1 rounded-md bg-primary/15 px-1.5 py-0.5 text-[11px] font-medium text-primary">Built in</span></p>
            <p className="text-text-secondary">Tab health score, duplicate cleanup, auto-organize and saved tabs. Runs natively, no install needed.</p>
          </div>
          <button type="button" onClick={() => { useStore.getState().setOverlay(null); useStore.getState().setSidebar("therapist"); }} className="rounded-lg bg-primary px-3 py-1.5 font-medium text-white dark:text-bg">Open</button>
        </section>

        <section>
          <h3 className="mb-2 font-semibold">Add a Chrome extension</h3>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void run(() => ipc.extensionInstallStore(input)); }}>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Chrome Web Store link or extension ID" aria-label="Chrome Web Store link or extension ID" className="h-9 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 outline-none focus:border-primary" />
            <button type="submit" disabled={busy || !input.trim()} className="rounded-lg bg-primary px-3 font-medium text-white disabled:opacity-40 dark:text-bg">{busy ? "Working…" : "Add"}</button>
            <button type="button" disabled={busy} onClick={() => void run(() => ipc.extensionInstallFile())} className="rounded-lg border border-border px-3 hover:bg-surface-secondary disabled:opacity-40">From file…</button>
          </form>
          <p className="mt-2 flex gap-2 text-[12px] text-text-secondary">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" />
            Quick Pebble can run an extension&apos;s <strong>content scripts</strong> (page tweaks, dark modes, highlighters…). Extensions that need a background worker, toolbar popup or browser-tab APIs will install but can&apos;t do those parts.
          </p>
          {msg && <p role={msg.ok ? "status" : "alert"} className={`mt-2 ${msg.ok ? "text-primary" : "text-red-500"}`}>{msg.text}</p>}
        </section>

        <section>
          <h3 className="mb-2 font-semibold">Installed</h3>
          {list.length === 0 && <p className="rounded-xl border border-dashed border-border p-4 text-center text-text-secondary">No extensions installed.</p>}
          <ul className="space-y-2">
            {list.map((x) => (
              <li key={x.id} className="rounded-2xl border border-border p-3">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-surface-secondary text-text-secondary"><Puzzle size={16} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{x.name} <span className="font-normal text-text-secondary">v{x.version}</span></p>
                    {x.description && <p className="line-clamp-2 text-text-secondary">{x.description}</p>}
                    {x.hosts.length > 0 && (
                      <p className="mt-1 flex gap-1.5 text-[12px] text-text-secondary"><ShieldAlert size={13} className="mt-0.5 shrink-0" />
                        <span>Can read and change pages on: {x.hosts.slice(0, 4).join(", ")}{x.hosts.length > 4 ? ` and ${x.hosts.length - 4} more` : ""}{x.hosts.some((h) => h === "<all_urls>" || h.startsWith("*://*/")) ? " — every site" : ""}</span>
                      </p>
                    )}
                    {x.warnings.map((w) => <p key={w} className="mt-1 text-[12px] text-group-school">⚠ {w}</p>)}
                  </div>
                  <label className="flex shrink-0 items-center gap-2">
                    <input type="checkbox" role="switch" aria-label={`Enable ${x.name}`} checked={x.enabled} disabled={!x.has_content_scripts} onChange={async (e) => { await ipc.extensionSetEnabled(x.id, e.target.checked); await load(); }} className="size-4 accent-primary" />
                  </label>
                  <button type="button" aria-label={`Remove ${x.name}`} onClick={async () => { await ipc.extensionRemove(x.id); await load(); }} className="grid size-7 shrink-0 place-items-center rounded-lg text-text-secondary hover:bg-surface-secondary"><Trash2 size={14} /></button>
                </div>
              </li>
            ))}
          </ul>
          {list.some((x) => x.enabled) && <p className="mt-2 text-[12px] text-text-secondary">Changes apply to tabs you open afterwards (not private windows).</p>}
        </section>
      </div>
    </Modal>
  );
}
