import { create } from "zustand";
import { ipc, type PageSnapshot } from "../lib/ipc";
import { describeStep, findElement, needsConfirm, type Routine, type Step } from "../lib/routines";
import { selectActive, useStore } from "./useStore";
import { useChat } from "./useChat";

/**
 * Running a routine. It always starts as a preview of every step (shown in the assistant panel, next to the page), and runs
 * only after the person approves. Steps that send, submit, buy or delete stop for their own OK; secret fields are left for
 * the person to fill in. Stop works at any point.
 */
export interface RunLine { text: string; ok: boolean | null }
interface RoutineRun {
  routine: Routine;
  status: "preview" | "running" | "waiting" | "done" | "stopped";
  at: number;
  lines: RunLine[];
  waiting: { text: string; resolve: (go: "go" | "skip" | "stop") => void; secret?: boolean } | null;
}
interface RoutinesState {
  run: RoutineRun | null;
  teaching: boolean;
  ask: (r: Routine) => void;
  start: () => Promise<void>;
  stop: () => void;
  close: () => void;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
let aborted = false;

async function snapshot(): Promise<{ id: string; snap: PageSnapshot }> {
  const tab = selectActive(useStore.getState());
  if (!tab.url) throw new Error("There's no page open for this step.");
  return { id: tab.id, snap: await ipc.agentExec<PageSnapshot>(tab.id, "snapshot") };
}
/** Looks for the element for a few seconds, since pages often finish loading after they appear. */
async function locate(label: string, kind: "click" | "field" | "select"): Promise<{ id: string; i: number }> {
  for (let n = 0; n < 8; n++) {
    const { id, snap } = await snapshot().catch(() => ({ id: "", snap: { elements: [] } as unknown as PageSnapshot }));
    const i = id ? findElement(snap, label, kind) : null;
    if (i != null) return { id, i };
    await sleep(700);
  }
  throw new Error(`Couldn't find “${label}” on the page. The site may have changed since you taught this routine.`);
}

async function perform(s: Step): Promise<void> {
  const st = useStore.getState();
  switch (s.type) {
    case "open_url": { const t = selectActive(st); await st.navigate(t.id, s.url); await sleep(1800); return; }
    case "click": { const { id, i } = await locate(s.label, "click"); const r = await ipc.agentExec<{ error?: string }>(id, "click", { i }); if (r?.error) throw new Error(r.error); await sleep(900); return; }
    case "type": { const { id, i } = await locate(s.label, "field"); const r = await ipc.agentExec<{ error?: string }>(id, "type", { i, text: s.text }); if (r?.error) throw new Error(r.error); return; }
    case "select": { const { id, i } = await locate(s.label, "select"); const r = await ipc.agentExec<{ error?: string }>(id, "select", { i, value: s.text }); if (r?.error) throw new Error(r.error); return; }
    case "open_app": await ipc.routineOpenApp(s.app); await sleep(1500); return;
    case "wait": await sleep(s.seconds * 1000); return;
    case "do": { const chat = useChat.getState(); chat.setMode("act"); await chat.send(s.text); return; }
    case "open_panel": st.setOverlay(s.panel); return;
  }
}

export const useRoutines = create<RoutinesState>((set, get) => {
  const line = (text: string, ok: boolean | null) => set((x) => (x.run ? { run: { ...x.run, lines: [...x.run.lines, { text, ok }] } } : x));
  const wait = (text: string, secret = false) => new Promise<"go" | "skip" | "stop">((resolve) => set((x) => (x.run ? { run: { ...x.run, status: "waiting", waiting: { text, secret, resolve: (g) => { set((y) => (y.run ? { run: { ...y.run, status: "running", waiting: null } } : y)); resolve(g); } } } } : x)));
  return {
    run: null,
    teaching: false,
    ask: (routine) => {
      if (get().run && ["running", "waiting"].includes(get().run!.status)) return;
      aborted = false;
      useStore.getState().setSidebar("assistant");
      set({ run: { routine, status: "preview", at: 0, lines: [], waiting: null } });
    },
    start: async () => {
      const r = get().run;
      if (!r || r.status !== "preview") return;
      aborted = false;
      set({ run: { ...r, status: "running" } });
      for (let n = 0; n < r.routine.steps.length; n++) {
        if (aborted) break;
        const s = r.routine.steps[n];
        set((x) => (x.run ? { run: { ...x.run, at: n } } : x));
        const text = describeStep(s);
        if (s.type === "type" && s.secret) {
          const g = await wait(`Type your ${s.label} yourself on the page, then press Continue.`, true);
          if (g === "stop") { aborted = true; break; }
          line(`${text}`, g === "go" ? true : null);
          continue;
        }
        if (needsConfirm(s)) {
          const g = await wait(`This step may send, submit, buy or delete something: ${text}. Do it?`);
          if (g === "stop") { aborted = true; break; }
          if (g === "skip") { line(`${text}: skipped`, null); continue; }
        }
        try { await perform(s); line(text, true); }
        catch (e) {
          line(`${text}: ${String(e).replace(/^Error: /, "")}`, false);
          const g = await wait("That step didn't work. Do it yourself and continue, or stop here.");
          if (g === "stop") { aborted = true; break; }
        }
      }
      set((x) => (x.run ? { run: { ...x.run, status: aborted ? "stopped" : "done", waiting: null } } : x));
    },
    stop: () => { aborted = true; get().run?.waiting?.resolve("stop"); set((x) => (x.run ? { run: { ...x.run, status: x.run.status === "preview" ? "stopped" : x.run.status } } : x)); },
    close: () => { aborted = true; get().run?.waiting?.resolve("stop"); set({ run: null }); },
  };
});
