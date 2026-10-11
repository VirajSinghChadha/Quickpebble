import { useCallback, useEffect, useState } from "react";
import { Circle, Download, Play, Square, Trash2, Upload } from "lucide-react";
import { ipc } from "../lib/ipc";
import { describeStep, needsConfirm, scheduleText, type Routine, type Step } from "../lib/routines";
import { useRoutines } from "../store/useRoutines";
import { useStore } from "../store/useStore";
import { Modal, ModalHeader } from "./Modal";

const btn = "rounded-lg border border-border px-3 py-1.5 hover:bg-surface-secondary disabled:opacity-40";
const primary = "rounded-lg bg-primary px-3 py-1.5 font-medium text-white disabled:opacity-40 dark:text-bg";
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** A routine being created or edited: its steps (read-only, can be removed), name, shortcut phrase and reminder schedule. */
interface Draft { id?: number; name: string; steps: Step[]; trigger: string; days: number[]; time: string; remind: boolean }
const toDraft = (r: Routine): Draft => ({ id: r.id, name: r.name, steps: r.steps, trigger: r.trigger ?? "", days: r.schedule?.days ?? [5], time: r.schedule?.time ?? "16:00", remind: !!r.schedule });

function Editor({ draft, onDone }: { draft: Draft; onDone: () => void }) {
  const [d, setD] = useState(draft);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    try {
      await ipc.routineSave({ name: d.name, steps: d.steps, trigger: d.trigger.trim() || null, schedule: d.remind ? { days: d.days, time: d.time } : null }, d.id);
      onDone();
    } catch (e) { setErr(String(e)); }
  };
  return (
    <div className="space-y-3 rounded-2xl border border-primary/50 p-4" aria-label="Edit routine">
      <label className="block text-[12.5px] font-medium">Name<input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} maxLength={60} placeholder="Friday timetable" className="mt-1 w-full rounded-lg border border-border bg-surface px-2 py-1.5 font-normal" aria-label="Routine name" /></label>
      <div>
        <p className="mb-1 text-[12.5px] font-medium">Steps ({d.steps.length}). Remove any you don't want; they run in this order.</p>
        <ol className="max-h-56 space-y-1 overflow-y-auto" aria-label="Taught steps">
          {d.steps.map((s, i) => (
            <li key={i} className="flex items-center gap-2 rounded-lg bg-surface-secondary px-2 py-1 text-[12.5px]">
              <span className="w-5 text-text-secondary">{i + 1}.</span><span className="flex-1">{describeStep(s)}{needsConfirm(s) && <span className="text-[11px] text-amber-600"> (will ask first)</span>}</span>
              <button type="button" aria-label={`Remove step ${i + 1}`} onClick={() => setD({ ...d, steps: d.steps.filter((_, j) => j !== i) })} className="grid size-6 place-items-center rounded-md hover:bg-border"><Trash2 size={12} /></button>
            </li>
          ))}
        </ol>
        <AddDo onAdd={(text) => setD({ ...d, steps: [...d.steps, { type: "do", text }] })} />
      </div>
      <label className="block text-[12.5px] font-medium">Shortcut phrase (optional)<input value={d.trigger} onChange={(e) => setD({ ...d, trigger: e.target.value })} maxLength={40} placeholder="tidy up" className="mt-1 w-full rounded-lg border border-border bg-surface px-2 py-1.5 font-normal" aria-label="Shortcut phrase" /><span className="font-normal text-text-secondary">Say this to the assistant to run the routine (you still see the steps first).</span></label>
      <div className="text-[12.5px]">
        <label className="flex items-center gap-2 font-medium"><input type="checkbox" className="accent-primary" checked={d.remind} onChange={(e) => setD({ ...d, remind: e.target.checked })} /> Remind me to run it</label>
        {d.remind && <div className="mt-1 flex flex-wrap items-center gap-1">{DAY_NAMES.map((n, i) => <button key={n} type="button" aria-pressed={d.days.includes(i)} onClick={() => setD({ ...d, days: d.days.includes(i) ? d.days.filter((x) => x !== i) : [...d.days, i] })} className={`rounded-md border px-2 py-0.5 ${d.days.includes(i) ? "border-primary bg-primary/10" : "border-border"}`}>{n}</button>)}<input type="time" value={d.time} onChange={(e) => setD({ ...d, time: e.target.value })} className="rounded-md border border-border bg-surface px-1" aria-label="Time" /><span className="w-full text-text-secondary">At that time you get a notification and the steps, ready to approve. It never runs by itself.</span></div>}
      </div>
      {err && <p role="alert" className="text-[12px] text-red-500">{err}</p>}
      <div className="flex gap-2"><button type="button" className={primary} disabled={!d.name.trim() || !d.steps.length} onClick={() => void save()}>Save routine</button><button type="button" className={btn} onClick={onDone}>Cancel</button></div>
    </div>
  );
}

function AddDo({ onAdd }: { onAdd: (text: string) => void }) {
  const [t, setT] = useState("");
  return (
    <form className="mt-1 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (t.trim().length >= 3) { onAdd(t.trim()); setT(""); } }}>
      <input value={t} onChange={(e) => setT(e.target.value)} maxLength={300} placeholder="Add a step in words, e.g. “put the timetable in Calendar”" className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-1 text-[12.5px]" aria-label="Add a step in words" />
      <button type="submit" className={btn}>Add</button>
    </form>
  );
}

export function RoutinesPanel() {
  const close = () => useStore.getState().setOverlay(null);
  const [list, setList] = useState<Routine[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [imp, setImp] = useState<Awaited<ReturnType<typeof ipc.routineImport>>>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const teaching = useRoutines((s) => s.teaching);
  const load = useCallback(async () => setList(await ipc.routinesList()), []);
  useEffect(() => void load(), [load]);
  const act = async (fn: () => Promise<unknown>) => { try { setMsg(null); await fn(); } catch (e) { setMsg(String(e)); } };

  const teach = () => act(async () => { await ipc.routineTeachStart(); useRoutines.setState({ teaching: true }); close(); });

  return (
    <Modal onClose={close} label="Routines" width="max-w-2xl">
      <ModalHeader title="Routines" onClose={close} />
      <div className="space-y-3 overflow-y-auto px-5 pb-5">
        <p className="text-[12px] text-text-secondary">Teach Quick Pebble a task by doing it once while it watches. It remembers the pages you open, what you click and type (never passwords or card numbers) and the apps you switch to. Running a routine always shows every step first, and anything that sends, submits, buys or deletes asks again.</p>
        {draft ? <Editor draft={draft} onDone={() => { setDraft(null); void load(); }} /> : (<>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={primary} disabled={teaching} onClick={() => void teach()}><Circle size={11} className="mr-1 inline fill-current" />Teach a routine by showing</button>
            <button type="button" className={btn} onClick={() => setDraft({ name: "", steps: [], trigger: "", days: [5], time: "16:00", remind: false })}>Write one in words</button>
            <button type="button" className={btn} onClick={() => void act(async () => setImp(await ipc.routineImport()))}><Upload size={13} className="mr-1 inline" />Import from a file…</button>
          </div>
          {imp && (imp.problems ? (
            <div role="alert" className="rounded-xl border border-red-500/60 p-3 text-[12.5px]"><p className="font-medium">“{imp.file}” was not imported:</p><ul className="list-disc pl-5">{imp.problems.map((p, i) => <li key={i}>{p}</li>)}</ul><button type="button" className={`${btn} mt-2`} onClick={() => setImp(null)}>OK</button></div>
          ) : imp.routine && (
            <div role="dialog" aria-label="Check imported routine" className="rounded-xl border border-amber-500/60 p-3 text-[12.5px]">
              <p className="font-medium">Check every step of “{imp.routine.name}” from {imp.file} before adding it:</p>
              <ol className="my-2 list-decimal pl-5">{imp.routine.steps.map((s, i) => <li key={i}>{describeStep(s)}{needsConfirm(s) && <span className="text-[11px] text-amber-600"> (asks first)</span>}</li>)}</ol>
              {imp.routine.trigger && <p>Shortcut phrase: “{imp.routine.trigger}”</p>}
              <div className="mt-2 flex gap-2"><button type="button" className={primary} onClick={() => void act(async () => { await ipc.routineImportConfirm(imp.token!); setImp(null); await load(); })}>Add this routine</button><button type="button" className={btn} onClick={() => setImp(null)}>Don't add it</button></div>
            </div>
          ))}
          <ul className="space-y-2" aria-label="Saved routines">
            {list.length === 0 && <li className="py-6 text-center text-text-secondary">No routines yet.</li>}
            {list.map((r) => (
              <li key={r.id} className="flex items-center gap-2 rounded-xl border border-border p-3">
                <div className="min-w-0 flex-1"><p className="font-medium">{r.name}{r.imported && <span className="ml-1 text-[11px] text-text-secondary">(imported)</span>}</p><p className="text-[11.5px] text-text-secondary">{r.steps.length} steps{r.trigger ? ` · say “${r.trigger}”` : ""}{r.schedule ? ` · ${scheduleText(r.schedule)}` : ""}</p></div>
                <button type="button" aria-label={`Run ${r.name}`} title="Run (you'll see the steps first)" onClick={() => { close(); useRoutines.getState().ask(r); }} className="grid size-8 place-items-center rounded-lg hover:bg-surface-secondary"><Play size={14} /></button>
                <button type="button" className={`${btn} text-[12px]`} onClick={() => setDraft(toDraft(r))}>Edit</button>
                <button type="button" aria-label={`Export ${r.name}`} title="Export to share" onClick={() => void act(async () => { const p = await ipc.routineExport(r.id); if (p) setMsg(`Saved to ${p}.`); })} className="grid size-8 place-items-center rounded-lg hover:bg-surface-secondary"><Download size={14} /></button>
                <button type="button" aria-label={`Delete ${r.name}`} onClick={() => void act(async () => { await ipc.routineDelete(r.id); await load(); })} className="grid size-8 place-items-center rounded-lg hover:bg-surface-secondary"><Trash2 size={14} /></button>
              </li>
            ))}
          </ul>
        </>)}
        {msg && <p role="status" className="text-[12px] text-text-secondary">{msg}</p>}
      </div>
    </Modal>
  );
}

/** While teaching: a bar across the top of the window with Stop. Stopping opens the steps for review. */
export function TeachingBar() {
  const teaching = useRoutines((s) => s.teaching);
  const [pending, setPending] = useState<Step[] | null>(null);
  if (!teaching && !pending) return null;
  if (pending) {
    return (
      <Modal onClose={() => setPending(null)} label="Review taught routine" width="max-w-2xl">
        <ModalHeader title="Here's what I saw" onClose={() => setPending(null)} />
        <div className="px-5 pb-5">{pending.length === 0 ? <p className="py-4 text-text-secondary">I didn't see any steps. Open pages, click and type while teaching, then press Stop.</p> : <Editor draft={{ name: "", steps: pending, trigger: "", days: [5], time: "16:00", remind: false }} onDone={() => setPending(null)} />}</div>
      </Modal>
    );
  }
  return (
    <div role="status" className="fixed left-1/2 top-2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-red-600 px-4 py-1.5 text-[12.5px] text-white shadow-pebble">
      <span className="size-2 animate-pulse rounded-full bg-white" /> Watching: do the task now, in the browser or other apps.
      <button type="button" onClick={() => void ipc.routineTeachStop().then((steps) => { useRoutines.setState({ teaching: false }); setPending(steps); })} className="flex items-center gap-1 rounded-full bg-white px-2.5 py-0.5 font-medium text-red-600"><Square size={10} className="fill-current" /> Stop</button>
    </div>
  );
}
