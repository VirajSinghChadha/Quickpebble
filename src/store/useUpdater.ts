import { create } from "zustand";
import { ipc, type UpdateInfo, type UpdateProgress } from "../lib/ipc";

interface UpdaterState {
  state: "idle" | "checking" | "none" | "found" | "installing" | "error";
  info: UpdateInfo | null;
  progress: UpdateProgress | null;
  percent: number | null;
  error: string | null;
  available: (info: UpdateInfo) => void;
  check: () => Promise<void>;
  install: () => Promise<void>;
}

/** Lives outside Settings so closing the panel doesn't lose an ongoing update. */
export const useUpdater = create<UpdaterState>((set, get) => ({
  state: "idle", info: null, progress: null, percent: null, error: null,
  available: (info) => {
    if (get().state !== "installing" && get().state !== "checking") set({ state: "found", info, error: null });
  },
  check: async () => {
    if (get().state === "checking" || get().state === "installing") return;
    set({ state: "checking", error: null });
    try {
      const info = await ipc.updateCheck();
      set({ state: info ? "found" : "none", info });
    } catch (error) {
      set({ state: "error", error: String(error) });
    }
  },
  install: async () => {
    if (!get().info || get().state === "installing" || get().state === "checking") return;
    if (get().info?.manual) { await ipc.updateOpenPage(); return; }
    set({ state: "installing", progress: null, percent: null, error: null });
    try {
      await ipc.updateInstall((progress) => {
        const percent = progress.total && progress.total > 0
          ? Math.min(100, Math.max(0, Math.floor(progress.downloaded / progress.total * 100))) : null;
        set({ progress, percent });
      });
      // Native installs restart the app; retain busy state until then.
    } catch (error) {
      set({ state: "error", error: String(error), progress: null, percent: null });
    }
  },
}));
