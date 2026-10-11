import { RotateCw, X } from "lucide-react";
import { ipc } from "../lib/ipc";
import { useStore } from "../store/useStore";

/** Shown in place of a page whose process keeps dying, so the tab isn't just blank. */
export function CrashedTab({ id }: { id: string }) {
  return (
    <main className="grid h-full place-items-center bg-bg px-6 text-center" aria-label="This tab crashed">
      <div className="max-w-sm space-y-4">
        <h1 className="text-xl font-semibold">This tab crashed</h1>
        <p className="text-[13px] text-text-secondary">The page stopped working twice in a row, so Quick Pebble stopped reloading it. Your other tabs are fine. It may be too heavy for the memory available.</p>
        <div className="flex justify-center gap-2">
          <button type="button" autoFocus onClick={() => void ipc.tabNav(id, "reload")} className="flex items-center gap-1.5 rounded-full bg-primary px-5 py-2 font-medium text-white dark:text-bg"><RotateCw size={14} /> Reload</button>
          <button type="button" onClick={() => useStore.getState().closeTab(id)} className="flex items-center gap-1.5 rounded-full border border-border px-4 py-2 hover:bg-surface-secondary"><X size={14} /> Close tab</button>
        </div>
      </div>
    </main>
  );
}
