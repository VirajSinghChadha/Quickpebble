import { useEffect, useState } from "react";
import { ipc } from "../lib/ipc";
import { useHidePage } from "../hooks/useHidePage";
import { useAccount } from "../store/useAccount";
import { useReport } from "../store/useReport";
import { Modal, ModalHeader } from "./Modal";

/** "Report a problem": a message, and a diagnostic log that is only attached if the person ticks the box (and can read first). */
export function ReportDialog() {
  const open = useReport((s) => s.open);
  return open ? <Inner /> : null;
}

function Inner() {
  useHidePage();
  const close = useReport((s) => s.close);
  const [message, setMessage] = useState("");
  const [attach, setAttach] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [preview, setPreview] = useState<{ text: string; version: string; platform: string } | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [error, setError] = useState("");
  useEffect(() => { void ipc.reportPreview(attach).then(setPreview); }, [attach]);
  const body = preview ? `${message.trim()}\n\n--- details ---\n${preview.text}` : message;
  const send = async () => {
    setState("sending"); setError("");
    try {
      await useAccount.getState().sendReport({ message: message.trim(), log: attach ? preview?.text ?? null : null, version: preview?.version ?? "", platform: preview?.platform ?? "" });
      setState("sent");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("failed");
    }
  };
  return (
    <Modal onClose={close} label="Report a problem" width="max-w-lg">
      <ModalHeader title="Report a problem" onClose={close} />
      <div className="space-y-3 p-5 text-[13px]">
        {state === "sent" ? (
          <>
            <p className="text-[14px] font-medium">Thank you. Your report was sent.</p>
            <p className="text-text-secondary">We read every one. If it's urgent, tell the developers directly.</p>
            <div className="flex justify-end"><button type="button" autoFocus onClick={close} className="rounded-full bg-primary px-5 py-1.5 font-medium text-white dark:text-bg">Close</button></div>
          </>
        ) : (
          <>
            <p className="text-text-secondary">What went wrong? What were you doing, and what did you expect to happen?</p>
            <textarea autoFocus value={message} onChange={(e) => setMessage(e.target.value)} rows={5} maxLength={4000} aria-label="What went wrong" placeholder="For example: Screen mode clicked the wrong button when I asked it to…" className="w-full resize-none rounded-xl border border-border bg-surface px-3 py-2" />
            <label className="flex items-start gap-2.5">
              <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={attach} onChange={(e) => setAttach(e.target.checked)} />
              <span><b>Attach a diagnostic log</b> <span className="text-text-secondary">(recent app warnings and errors, plus your app version and system). No passwords, keys, emails or page contents; anything that looks like one is blanked out.</span></span>
            </label>
            {attach && (
              <div>
                <button type="button" onClick={() => setShowLog((v) => !v)} className="text-[12px] text-primary hover:underline">{showLog ? "Hide" : "Show"} exactly what will be attached</button>
                {showLog && <pre className="mt-1.5 max-h-44 overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-surface-secondary p-2.5 text-[11px]" aria-label="Attached details">{preview?.text}</pre>}
              </div>
            )}
            <p className="text-[12px] text-text-secondary">Sent to the Quick Pebble developers with your account email, so we can reply.</p>
            {state === "failed" && (
              <div className="space-y-1.5" role="alert">
                <p className="text-red-500">Couldn't send it: {error}</p>
                <button type="button" onClick={() => void navigator.clipboard.writeText(body)} className="rounded-full border border-border px-3 py-1 hover:bg-surface-secondary">Copy the report instead</button>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={close} className="rounded-full border border-border px-4 py-1.5 hover:bg-surface-secondary">Cancel</button>
              <button type="button" disabled={message.trim().length < 5 || state === "sending"} onClick={() => void send()} className="rounded-full bg-primary px-5 py-1.5 font-medium text-white disabled:opacity-50 dark:text-bg">{state === "sending" ? "Sending…" : "Send report"}</button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
