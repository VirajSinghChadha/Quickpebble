import { Download, X } from "lucide-react";
import { useState } from "react";
import { useUpdater } from "../store/useUpdater";

/** Small card at the top right when a new version is found; one click installs it and restarts. */
export function UpdatePrompt() {
  const { state, info, percent, error } = useUpdater();
  const [dismissed, setDismissed] = useState<string | null>(null);
  if (!info || (state !== "found" && state !== "installing" && state !== "error") || dismissed === info.version) return null;
  const busy = state === "installing";
  return (
    <div role="alert" className="fixed right-3 top-2 z-50 flex w-80 items-center gap-3 rounded-xl border border-border bg-surface p-3 shadow-lg">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Download size={18} /></span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold">Update {info.version} is ready</p>
        {busy ? (
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-secondary"><div className="h-full bg-primary transition-all" style={{ width: `${percent ?? 15}%` }} /></div>
        ) : error ? (
          <p className="truncate text-[12px] text-red-500" title={error}>Failed. Try again.</p>
        ) : (
          <button type="button" onClick={() => void useUpdater.getState().install()} className="mt-0.5 text-[12px] font-medium text-primary hover:underline">
            {info.manual ? "Download update" : "Update & restart"}
          </button>
        )}
      </div>
      {!busy && <button type="button" aria-label="Dismiss" onClick={() => setDismissed(info.version)} className="shrink-0 text-text-secondary hover:text-text"><X size={14} /></button>}
    </div>
  );
}
