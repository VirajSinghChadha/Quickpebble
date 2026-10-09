import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { useUpdater } from "../store/useUpdater";
import { Modal } from "./Modal";

/** Pops up when a new version is found; one click downloads it and restarts the app. */
export function UpdatePrompt() {
  const { state, info, percent, error } = useUpdater();
  const [dismissed, setDismissed] = useState<string | null>(null);
  useEffect(() => { if (state === "error") setDismissed(null); }, [state]);
  if (!info || (state !== "found" && state !== "installing" && state !== "error") || dismissed === info.version) return null;
  const busy = state === "installing";
  return (
    <Modal onClose={() => !busy && setDismissed(info.version)} label="Update available" width="max-w-md">
      <div className="space-y-4 p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Download size={20} /></span>
          <h2 className="text-[15px] font-semibold">Quick Pebble {info.version} is ready</h2>
        </div>
        <p className="text-text-secondary">You&apos;re on {info.current}. The update installs in the background and the browser restarts when it&apos;s done.</p>
        {busy && <div className="h-1.5 overflow-hidden rounded-full bg-surface-secondary"><div className="h-full bg-primary transition-all" style={{ width: `${percent ?? 15}%` }} /></div>}
        {error && <p className="text-red-500">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" disabled={busy} onClick={() => setDismissed(info.version)} className="rounded-lg border border-border px-4 py-2 hover:bg-surface-secondary disabled:opacity-50">Later</button>
          <button type="button" autoFocus disabled={busy} onClick={() => void useUpdater.getState().install()} className="rounded-lg bg-primary px-4 py-2 font-medium text-white disabled:opacity-60 dark:text-bg">
            {busy ? "Updating…" : "Update now"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
