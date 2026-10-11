import { CheckCircle2, CircleAlert, CircleDashed, Repeat } from "lucide-react";
import { describeStep, needsConfirm } from "../lib/routines";
import { useRoutines } from "../store/useRoutines";

/** In the assistant panel: a routine's plan to approve, then its progress, with its own OK for risky steps. */
export function RoutineRunCard() {
  const { run, start, stop, close } = useRoutines();
  if (!run) return null;
  const { routine, status, lines, waiting, at } = run;
  const btn = "rounded-lg border border-border px-3 py-1.5 hover:bg-surface-secondary";
  return (
    <div role="dialog" aria-label="Routine" className="rounded-2xl border border-primary/50 bg-surface p-3 shadow-pebble">
      <p className="mb-2 flex items-center gap-2 font-semibold"><Repeat size={14} className="text-primary" /> {status === "preview" ? `Here's the “${routine.name}” routine` : routine.name}</p>
      {status === "preview" && (<>
        {routine.imported && <p className="mb-2 text-[12px] text-amber-600">Imported from a file: read every step before running it.</p>}
        <ol className="mb-3 list-decimal space-y-0.5 pl-5 text-[12.5px]" aria-label="Routine steps">
          {routine.steps.map((s, i) => <li key={i}>{describeStep(s)}{needsConfirm(s) && <span className="text-[11px] text-amber-600"> (asks you first)</span>}</li>)}
        </ol>
        <div className="flex gap-2"><button type="button" autoFocus onClick={() => void start()} className="rounded-lg bg-primary px-3 py-1.5 font-medium text-white dark:text-bg">Run these {routine.steps.length} steps</button><button type="button" onClick={close} className={btn}>Cancel</button></div>
      </>)}
      {status !== "preview" && (<>
        <ol className="mb-2 space-y-0.5 text-[12.5px]" aria-label="Routine progress">
          {lines.map((l, i) => <li key={i} className="flex items-start gap-1.5">{l.ok === true ? <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-group-personal" /> : l.ok === false ? <CircleAlert size={13} className="mt-0.5 shrink-0 text-red-500" /> : <CircleDashed size={13} className="mt-0.5 shrink-0 text-text-secondary" />}<span>{l.text}</span></li>)}
          {(status === "running" || status === "waiting") && <li className="text-text-secondary">Step {at + 1} of {routine.steps.length}: {describeStep(routine.steps[at])}</li>}
        </ol>
        {waiting && (
          <div className="mb-2 rounded-lg border border-amber-500/60 p-2 text-[12.5px]">
            <p className="mb-2">{waiting.text}</p>
            <div className="flex flex-wrap gap-2"><button type="button" autoFocus onClick={() => waiting.resolve("go")} className="rounded-lg bg-primary px-3 py-1 font-medium text-white dark:text-bg">{waiting.secret ? "Continue" : "Do it"}</button>{!waiting.secret && <button type="button" onClick={() => waiting.resolve("skip")} className={btn}>Skip this step</button>}<button type="button" onClick={() => waiting.resolve("stop")} className={btn}>Stop</button></div>
          </div>
        )}
        {status === "running" && <button type="button" onClick={stop} className={btn}>Stop</button>}
        {(status === "done" || status === "stopped") && <div className="flex items-center gap-2"><span className="text-[12.5px]">{status === "done" ? "Finished." : "Stopped."}</span><button type="button" onClick={close} className={btn}>Close</button></div>}
      </>)}
    </div>
  );
}
