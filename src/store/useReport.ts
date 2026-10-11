import { create } from "zustand";

interface ReportState { open: boolean; show: () => void; close: () => void }
export const useReport = create<ReportState>((set) => ({ open: false, show: () => set({ open: true }), close: () => set({ open: false }) }));
