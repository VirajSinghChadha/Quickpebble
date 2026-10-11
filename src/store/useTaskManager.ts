import { create } from "zustand";
interface S { open: boolean; show: () => void; close: () => void }
export const useTaskManager = create<S>((set) => ({ open: false, show: () => set({ open: true }), close: () => set({ open: false }) }));
