import { create } from "zustand";
import type { MorningBrief } from "../lib/ipc";

interface MorningState {
  brief: MorningBrief | null;
  show: (b: MorningBrief) => void;
  close: () => void;
}
export const useMorning = create<MorningState>((set) => ({ brief: null, show: (brief) => set({ brief }), close: () => set({ brief: null }) }));
