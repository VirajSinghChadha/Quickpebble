import { ShieldAlert } from "lucide-react";
import { hostOf } from "../lib/url";
import { useStore } from "../store/useStore";
import { Modal } from "./Modal";

/** Shown when HTTPS-only mode could not reach the secure version of a site. */
export function HttpsPrompt() {
  const prompt = useStore((s) => s.httpsPrompt);
  if (!prompt) return null;
  const close = () => useStore.getState().setHttpsPrompt(null);
  const host = hostOf(prompt.url);
  return (
    <Modal onClose={close} label="Connection is not secure" width="max-w-md">
      <div className="space-y-4 p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-red-500/10 text-red-500"><ShieldAlert size={20} /></span>
          <h2 className="text-[15px] font-semibold">{host} doesn&apos;t support a secure connection</h2>
        </div>
        <p className="text-text-secondary">
          Quick Pebble tried to open the HTTPS version and couldn&apos;t. If you continue, anything you send or receive on this site (including passwords) can be read by others on the network.
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" autoFocus onClick={close} className="rounded-lg bg-primary px-4 py-2 font-medium text-white dark:text-bg">Go back</button>
          <button
            type="button"
            onClick={() => {
              close();
              void useStore.getState().navigate(prompt.id, prompt.url, true);
            }}
            className="rounded-lg border border-border px-4 py-2 hover:bg-surface-secondary"
          >
            Continue to site (HTTP)
          </button>
        </div>
      </div>
    </Modal>
  );
}
