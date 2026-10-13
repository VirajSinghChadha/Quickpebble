import { create } from "zustand";
import { ipc, type Receipt, type TaskView } from "../lib/ipc";

/**
 * The shared "here's what I'll change" step. A feature asks the main process for a dry-run list (a TaskView), shows it here,
 * and nothing happens until the person ticks items and confirms. Then the receipt is shown, with Undo.
 */
interface ReviewState {
  view: TaskView | null;
  picked: Set<number>;
  receipt: Receipt | null;
  busy: boolean;
  error: string | null;
  open: (view: TaskView) => void;
  toggle: (i: number) => void;
  setAll: (on: boolean) => void;
  confirm: () => Promise<void>;
  cancel: () => void;
  undoAll: () => Promise<void>;
  close: () => void;
}

export const useReview = create<ReviewState>((set, get) => ({
  view: null,
  picked: new Set(),
  receipt: null,
  busy: false,
  error: null,
  // Everything that can be done starts ticked; the person unticks what they want to keep.
  open: (view) => set({ view, receipt: null, error: null, picked: new Set(view.items.filter((i) => !i.problem).map((i) => i.i)) }),
  toggle: (i) => set((s) => { const p = new Set(s.picked); if (p.has(i)) p.delete(i); else p.add(i); return { picked: p }; }),
  setAll: (on) => set((s) => ({ picked: on && s.view ? new Set(s.view.items.filter((i) => !i.problem).map((i) => i.i)) : new Set() })),
  confirm: async () => {
    const { view, picked } = get();
    if (!view || !picked.size) return;
    set({ busy: true, error: null });
    try {
      const receipt = await ipc.taskConfirm(view.id, [...picked]);
      set({ receipt, view: null });
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ busy: false });
    }
  },
  cancel: () => { const v = get().view; if (v) void ipc.taskCancel(v.id).catch(() => {}); set({ view: null, error: null }); },
  undoAll: async () => {
    const r = get().receipt;
    if (!r) return;
    set({ busy: true });
    try {
      const out = await ipc.actionsUndoTask(r.id);
      set({ error: out.failed.length ? `Put back ${out.undone}. Couldn't put back ${out.failed.length}: ${out.failed[0].error}` : null, receipt: out.failed.length ? r : null });
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ busy: false });
    }
  },
  close: () => set({ receipt: null, error: null }),
}));
