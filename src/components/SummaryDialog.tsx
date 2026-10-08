import { useStore } from "../store/useStore";
import { useOllama } from "../hooks/useOllama";
import { Modal, ModalHeader } from "./Modal";

export function SummaryDialog() {
  const summary = useStore((s) => s.summary);
  const tab = useStore((s) => s.tabs.find((t) => t.id === s.summary?.tabId));
  const { status } = useOllama(60000);
  const close = () => useStore.getState().setOverlay(null);
  const cloud = status && status.provider !== "ollama";
  return (
    <Modal onClose={close} label="Page summary" width="max-w-lg">
      <ModalHeader title="Page summary" onClose={close} />
      <div className="overflow-y-auto px-5 py-4 text-[13.5px] leading-relaxed">
        <p className="mb-3 truncate text-[12px] text-text-secondary">{tab?.title || tab?.url}</p>
        {summary?.loading && (
          <div className="flex items-center gap-3 text-text-secondary" role="status">
            <span className="size-4 animate-spin rounded-full border-2 border-border border-t-primary" />
            Summarizing with {status?.model ?? "AI"}…
          </div>
        )}
        {summary?.error && (
          <p className="rounded-xl bg-surface-secondary p-3 text-text-secondary" role="alert">
            {summary.error}
          </p>
        )}
        {summary?.text && <div className="whitespace-pre-wrap">{summary.text}</div>}
      </div>
      <p className="border-t border-border px-5 py-2.5 text-[11.5px] text-text-secondary">
        {cloud ? `Sent to ${status?.provider} (cloud) — you chose this provider in Settings.` : "Processed locally by Ollama. Nothing left this device."}
      </p>
    </Modal>
  );
}
