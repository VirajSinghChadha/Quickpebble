import { create } from "zustand";

/** Which saved study pack to open (set when a spaced reminder fires). */
export const useSchool = create<{ openPack: number | null; setOpenPack: (id: number | null) => void }>((set) => ({
  openPack: null,
  setOpenPack: (openPack) => set({ openPack }),
}));
