import { CheckCircle2, CircleAlert, ListChecks, Undo2 } from "lucide-react";
import { useReview } from "../store/useReview";
import { useStore } from "../store/useStore";
import { formatBytes } from "../lib/format";
import { Modal, ModalHeader } from "./Modal";
import { useHidePage } from "../hooks/useHidePage";

/** Dry run → confirm → receipt. Used by every task that moves, renames, trashes, quits or uninstalls something. */
export function ReviewDialog() {
  const open = useReview((s) => !!s.view || !!s.receipt);
  return open ? <ReviewBody /> : null;
}

function ReviewBody() {
  useHidePage();
  const { view, picked, receipt, busy, error, toggle, setAll, confirm, cancel, undoAll, close } = useReview();

  if (receipt) {
    return (
      <Modal onClose={close} label="Receipt" width="max-w-lg">
        <ModalHeader title={`Done: ${receipt.title}`} onClose={close} />
        <div className="space-y-3 overflow-y-auto px-5 pb-5">
          <p className="flex items-center gap-2"><CheckCircle2 size={16} className="text-group-personal" /> {receipt.done.length} done{receipt.bytes ? ` · ${formatBytes(receipt.bytes)} freed or moved` : ""}{receipt.failed.length ? ` · ${receipt.failed.length} skipped` : ""}</p>
          {receipt.done.length > 0 && <ul className="max-h-48 space-y-0.5 overflow-y-auto text-[12px] text-text-secondary">{receipt.done.map((d, n) => <li key={n}>✓ {d.what}{!d.undoable && " (restore it from the Recycle Bin if needed)"}</li>)}</ul>}
          {receipt.failed.length > 0 && <ul className="max-h-32 space-y-0.5 overflow-y-auto text-[12px] text-red-500">{receipt.failed.map((f, n) => <li key={n}>✗ {f.what}: {f.error}</li>)}</ul>}
          <p className="text-[12px] text-text-secondary">Deleted items went to the Trash, not away for good. This receipt and every change are kept in Recent changes, where each one can be undone.</p>
          {error && <p role="alert" className="text-[12px] text-red-500">{error}</p>}
          <div className="flex flex-wrap gap-2">
            {receipt.done.length > 0 && <button type="button" disabled={busy} onClick={() => void undoAll()} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 hover:bg-surface-secondary disabled:opacity-40"><Undo2 size={14} /> Undo this whole task</button>}
            <button type="button" onClick={() => { close(); useStore.getState().setOverlay("changes"); }} className="rounded-lg border border-border px-3 py-1.5 hover:bg-surface-secondary">Recent changes</button>
            <button type="button" autoFocus onClick={close} className="rounded-lg bg-primary px-3 py-1.5 font-medium text-white dark:text-bg">OK</button>
          </div>
        </div>
      </Modal>
    );
  }

  const v = view!;
  const ready = v.items.filter((i) => !i.problem);
  const chosenBytes = ready.filter((i) => picked.has(i.i)).reduce((s, i) => s + (i.size ?? 0), 0);
  return (
    <Modal onClose={cancel} label="Review changes" width="max-w-2xl">
      <ModalHeader title={v.title} onClose={cancel} />
      <div className="flex min-h-0 flex-col gap-3 px-5 pb-5">
        <p className="flex items-center gap-2 text-text-secondary"><ListChecks size={16} className="text-primary" /> Nothing has changed yet. Untick anything you want to keep, then confirm.</p>
        {ready.length > 1 && (
          <div className="flex gap-3 text-[12px]">
            <button type="button" className="text-primary hover:underline" onClick={() => setAll(true)}>Tick all</button>
            <button type="button" className="text-primary hover:underline" onClick={() => setAll(false)}>Untick all</button>
          </div>
        )}
        <ul className="max-h-[50vh] divide-y divide-border overflow-y-auto rounded-xl border border-border" aria-label="Changes to review">
          {v.items.length === 0 && <li className="p-3 text-text-secondary">Nothing to do: everything already looks tidy.</li>}
          {v.items.map((it) => (
            <li key={it.i}>
              <label className={`flex items-start gap-3 px-3 py-2 ${it.problem ? "opacity-60" : "cursor-pointer hover:bg-surface-secondary"}`}>
                <input type="checkbox" className="mt-0.5 size-4 accent-primary" disabled={!!it.problem} checked={!it.problem && picked.has(it.i)} onChange={() => toggle(it.i)} aria-label={it.what} />
                <span className="min-w-0 flex-1">
                  <span className="block break-words">{it.what}</span>
                  {it.path && <span className="block truncate text-[11px] text-text-secondary" title={it.path}>{it.path}</span>}
                  {it.note && <span className="block text-[11.5px] text-text-secondary">{it.note}</span>}
                  {it.problem && <span className="flex items-center gap-1 text-[11.5px] text-red-500"><CircleAlert size={12} /> {it.problem}</span>}
                </span>
                {it.size != null && <span className="shrink-0 text-[12px] tabular-nums text-text-secondary">{formatBytes(it.size)}</span>}
              </label>
            </li>
          ))}
        </ul>
        {error && <p role="alert" className="text-[12px] text-red-500">{error}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={busy || picked.size === 0} onClick={() => void confirm()} className="rounded-lg bg-primary px-3 py-1.5 font-medium text-white disabled:opacity-40 dark:text-bg">{busy ? "Working…" : `Confirm ${picked.size} change${picked.size === 1 ? "" : "s"}`}</button>
          <button type="button" onClick={cancel} className="rounded-lg border border-border px-3 py-1.5 hover:bg-surface-secondary">Cancel</button>
          {chosenBytes > 0 && <span className="text-[12px] text-text-secondary">{formatBytes(chosenBytes)} selected</span>}
        </div>
        <p className="text-[11px] text-text-secondary">Deleting always means the Trash. Your protected folders are never touched. You&apos;ll get a receipt and can undo each change.</p>
      </div>
    </Modal>
  );
}
