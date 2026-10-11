import { useEffect } from "react";
import { Bot, Check, FolderKanban, KeyRound, Lock, ShieldCheck, Sparkles, type LucideIcon } from "lucide-react";
import { TOUR_STEPS } from "../lib/tour";
import { useHidePage } from "../hooks/useHidePage";
import { useStore } from "../store/useStore";
import { useTour } from "../store/useTour";
import { Modal } from "./Modal";

const ICONS: Record<(typeof TOUR_STEPS)[number]["icon"], LucideIcon> = { sparkles: Sparkles, key: KeyRound, bot: Bot, shield: ShieldCheck, folder: FolderKanban, lock: Lock, check: Check };

/** The first-run walkthrough: short, skippable, keyboard friendly, and replayable from Settings. */
export function Tour() {
  const { open, step, go, close } = useTour();
  if (!open) return null;
  return <TourDialog step={step} go={go} close={close} />;
}

function TourDialog({ step, go, close }: { step: number; go: (n: number) => void; close: () => void }) {
  useHidePage();
  const last = step === TOUR_STEPS.length - 1;
  const s = TOUR_STEPS[step];
  const Icon = ICONS[s.icon];
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" && !last) go(step + 1);
      if (e.key === "ArrowLeft" && step > 0) go(step - 1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [step, last, go]);
  const act = () => {
    if (!s.action) return;
    close();
    if (s.action.target === "settings") useStore.getState().setOverlay("settings");
    else { useStore.getState().setOverlay(null); useStore.getState().setSidebar("assistant"); }
  };
  return (
    <Modal onClose={close} label="Quick Pebble tour" width="max-w-md" radius="rounded-3xl">
      <div className="space-y-5 p-7 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-primary/10 text-primary"><Icon size={26} /></span>
        <div className="space-y-2">
          <h2 className="text-[19px] font-semibold tracking-tight">{s.title}</h2>
          <p className="text-[13.5px] leading-relaxed text-text-secondary">{s.body}</p>
        </div>
        {s.action && <button type="button" onClick={act} className="rounded-full border border-border px-4 py-1.5 text-[13px] hover:bg-surface-secondary">{s.action.label}</button>}
        <div className="flex items-center justify-center gap-1.5" aria-label={`Step ${step + 1} of ${TOUR_STEPS.length}`} role="img">
          {TOUR_STEPS.map((_, i) => <span key={i} className={`h-1.5 rounded-full transition-all duration-200 ${i === step ? "w-5 bg-primary" : "w-1.5 bg-border"}`} />)}
        </div>
        <div className="flex items-center justify-between">
          <button type="button" onClick={close} className="text-[12.5px] text-text-secondary hover:underline">{last ? "" : "Skip tour"}</button>
          <div className="flex gap-2">
            {step > 0 && <button type="button" onClick={() => go(step - 1)} className="rounded-full border border-border px-4 py-1.5 hover:bg-surface-secondary">Back</button>}
            <button type="button" autoFocus onClick={last ? close : () => go(step + 1)} className="rounded-full bg-primary px-5 py-1.5 font-medium text-white dark:text-bg">{last ? "Start using Quick Pebble" : "Next"}</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
