import { create } from "zustand";
import { ipc, isPrivateWindow } from "../lib/ipc";
import { shouldShowTour, TOUR_VERSION } from "../lib/tour";

interface TourState {
  /** True once we know whether the tour is due, so other first-run dialogs can wait their turn. */
  checked: boolean;
  open: boolean;
  step: number;
  init: () => Promise<void>;
  show: () => void;
  close: () => void;
  go: (step: number) => void;
}

export const useTour = create<TourState>((set, get) => ({
  checked: false,
  open: false,
  step: 0,
  init: async () => {
    if (get().checked) return;
    if (isPrivateWindow()) return set({ checked: true });
    const seen = (await ipc.settingsGet().catch(() => ({}) as Record<string, string>)).tour_seen;
    set({ checked: true, open: shouldShowTour(seen), step: 0 });
  },
  show: () => set({ open: true, step: 0 }),
  close: () => {
    set({ open: false });
    void ipc.settingsSet("tour_seen", TOUR_VERSION).catch(() => {});
  },
  go: (step) => set({ step }),
}));
