import { useEffect, useState } from "react";
import { History, X } from "lucide-react";
import { ipc, isPrivateWindow } from "../lib/ipc";

/** After an unexpected quit (crash, power loss, force quit), say that the tabs are back. Shown once per such quit. */
export function RecoveryNotice() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (isPrivateWindow()) return;
    void ipc.sessionRecovered().then((was) => { if (was) setShow(true); });
  }, []);
  useEffect(() => {
    if (!show) return;
    const t = setTimeout(() => setShow(false), 12000);
    return () => clearTimeout(t);
  }, [show]);
  if (!show) return null;
  return (
    <div role="status" className="fixed right-3 top-12 z-50 flex w-80 items-start gap-3 rounded-xl border border-border bg-surface p-3 shadow-lg">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><History size={18} /></span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold">Quick Pebble closed unexpectedly</p>
        <p className="text-[12px] text-text-secondary">Your tabs are back, in the same order and where you were reading.</p>
      </div>
      <button type="button" aria-label="Dismiss" onClick={() => setShow(false)} className="shrink-0 text-text-secondary hover:text-text-primary"><X size={14} /></button>
    </div>
  );
}
