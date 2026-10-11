import { useEffect, useState } from "react";
import { ipc, type ImportScan } from "../lib/ipc";
import { useStore } from "../store/useStore";
import { useHidePage } from "../hooks/useHidePage";
import { Modal, ModalHeader } from "./Modal";

type Which = "chrome" | "safari";

/** Settings → Import: bring history, bookmarks, open tabs and (Chrome) extensions from another browser. Read-only on the other browser. */
export function ImportDialog({ onClose }: { onClose: () => void }) {
  useHidePage();
  const [which, setWhich] = useState<Which>("chrome");
  const [scan, setScan] = useState<ImportScan | null>(null);
  const [pick, setPick] = useState({ history: true, bookmarks: true, tabs: true });
  const [exts, setExts] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setScan(null); setResult(null); setError(null); setExts(new Set());
    void ipc.importScan(which).then((s) => { if (live) setScan(s); }).catch((e) => live && setError(String(e)));
    return () => { live = false; };
  }, [which]);

  const toggleExt = (id: string) => setExts((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const nothing = !(pick.history && scan?.history) && !(pick.bookmarks && scan?.bookmarks) && !(pick.tabs && scan?.tabs) && exts.size === 0;

  const run = async () => {
    setError(null);
    const lines: string[] = [];
    try {
      setBusy("Importing…");
      const r = await ipc.importRun(which, { history: pick.history && !!scan?.history, bookmarks: pick.bookmarks && !!scan?.bookmarks, tabs: pick.tabs && !!scan?.tabs });
      if (pick.history && scan?.history) lines.push(`${r.history} history entries added`);
      if (pick.bookmarks && scan?.bookmarks) lines.push(`${r.bookmarks} bookmarks added`);
      if (r.tabs.length) {
        await useStore.getState().restoreTabs(r.tabs.map((url) => ({ url, title: "", favicon: "", pinned: false, group: null })));
        lines.push(`${r.tabs.length} tabs opened (they load when you click them)`);
      }
      const failed: string[] = [];
      let n = 0;
      for (const id of exts) {
        setBusy(`Installing extension ${n + 1} of ${exts.size}…`);
        try { await ipc.extensionInstallStore(id); n++; } catch { failed.push(scan?.extensions.find((e) => e.id === id)?.name ?? id); }
      }
      if (exts.size) lines.push(`${n} extension${n === 1 ? "" : "s"} installed${failed.length ? `; could not install: ${failed.join(", ")}` : ""}`);
      useStore.setState((s) => ({ bookmarksVersion: s.bookmarksVersion + 1 }));
      setResult(lines.length ? lines : ["Nothing to import."]);
    } catch (e) { setError(String(e)); } finally { setBusy(null); }
  };

  const check = (k: keyof typeof pick, label: string, n: number | null) => (
    <label className="flex items-center gap-3 rounded-xl border border-border px-3 py-2">
      <input type="checkbox" className="size-4 accent-primary" disabled={!n} checked={pick[k] && !!n} onChange={(e) => setPick({ ...pick, [k]: e.target.checked })} />
      <span className="flex-1">{label}</span>
      <span className="text-[12px] text-text-secondary">{n == null ? "can't read" : n}</span>
    </label>
  );

  return (
    <Modal onClose={() => !busy && onClose()} label="Import from another browser" width="max-w-lg">
      <ModalHeader title="Import from another browser" onClose={() => !busy && onClose()} />
      <div className="space-y-3 p-5 text-[13px]">
        <div className="flex gap-2" role="radiogroup" aria-label="Browser to import from">
          {(["chrome", "safari"] as const).map((b) => <button key={b} type="button" role="radio" aria-checked={which === b} disabled={!!busy} onClick={() => setWhich(b)} className={`rounded-full border px-3 py-1 ${which === b ? "border-primary bg-primary/10 font-medium" : "border-border hover:bg-surface-secondary"}`}>{b === "chrome" ? "Chrome" : "Safari"}</button>)}
        </div>
        {!scan && !error ? <p className="text-text-secondary">Looking…</p> : result ? (
          <>
            <ul className="list-disc space-y-1 pl-5" role="status">{result.map((l) => <li key={l}>{l}</li>)}</ul>
            <div className="flex justify-end"><button type="button" autoFocus onClick={onClose} className="rounded-full bg-primary px-4 py-1.5 font-medium text-white dark:text-bg">Done</button></div>
          </>
        ) : scan && (
          <>
            <p className="text-text-secondary">This only reads {which === "chrome" ? "Chrome" : "Safari"}; nothing there is changed. Passwords are not imported here, use Passwords → Import for those.</p>
            {check("history", "History", scan.history)}
            {check("bookmarks", "Bookmarks", scan.bookmarks)}
            {check("tabs", `Open tabs${scan.tabs ? "" : which === "chrome" ? " (Chrome is not open)" : " (Safari is not open)"}`, scan.tabs || null)}
            {which === "chrome" && scan.extensions.length > 0 && (
              <div className="space-y-1">
                <p className="font-medium">Extensions to install from the Chrome Web Store</p>
                <ul className="max-h-36 space-y-1 overflow-y-auto">{scan.extensions.map((e) => <li key={e.id}><label className="flex items-center gap-3 rounded-lg bg-surface-secondary px-3 py-1.5"><input type="checkbox" className="size-4 accent-primary" checked={exts.has(e.id)} onChange={() => toggleExt(e.id)} /><span className="truncate">{e.name}</span></label></li>)}</ul>
              </div>
            )}
            {which === "safari" && <p className="text-[12px] text-text-secondary">Safari extensions are tied to Safari, so they can't be moved. Look for the same extension in the Chrome Web Store.</p>}
            {scan.problem && <p className="text-[12px] text-group-school" role="alert">{scan.problem}</p>}
          </>
        )}
        {error && <p className="text-red-500" role="alert">{error}</p>}
        {scan && !result && (
          <div className="flex items-center justify-end gap-2">
            {busy && <span className="mr-auto flex items-center gap-2 text-text-secondary" role="status"><span className="size-3.5 animate-spin rounded-full border-2 border-border border-t-primary" />{busy}</span>}
            <button type="button" disabled={!!busy} onClick={onClose} className="rounded-full border border-border px-4 py-1.5 hover:bg-surface-secondary">Cancel</button>
            <button type="button" disabled={!!busy || nothing} onClick={() => void run()} className="rounded-full bg-primary px-4 py-1.5 font-medium text-white disabled:opacity-50 dark:text-bg">Import</button>
          </div>
        )}
      </div>
    </Modal>
  );
}
