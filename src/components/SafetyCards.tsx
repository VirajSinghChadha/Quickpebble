import { useEffect } from "react";
import { AppWindow, Eye } from "lucide-react";
import { useChat } from "../store/useChat";

/** Safe mode for apps: asked the first time the screen agent is about to work in an app. */
export function AppPermissionCard() {
  const req = useChat((s) => s.appRequest);
  useEffect(() => {
    if (!req) return;
    const keys: Record<string, "once" | "always" | "no"> = { "1": "once", "2": "always", "3": "no" };
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (keys[e.key]) { e.preventDefault(); req.resolve(keys[e.key]); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [req]);
  if (!req) return null;
  const options = [
    { c: "once" as const, label: `Allow in ${req.app} for this task` },
    { c: "always" as const, label: `Always allow in ${req.app}` },
    { c: "no" as const, label: "Don't allow" },
  ];
  return (
    <div role="alertdialog" aria-label="Allow this app" className="rounded-2xl border border-primary/50 bg-surface p-3 shadow-pebble">
      <p className="mb-1 flex items-center gap-2 font-semibold"><AppWindow size={14} className="text-primary" /> May I work in {req.app}?</p>
      <p className="mb-3 text-[12px] text-text-secondary">This is the first time I&apos;d click and type in {req.app}. I only ask once per app. You can change your answer any time in Settings → Assistant safety.</p>
      <div className="flex flex-col gap-1.5">
        {options.map((o, i) => (
          <button key={o.c} type="button" autoFocus={i === 0} onClick={() => req.resolve(o.c)} className="flex items-center gap-2.5 rounded-lg border border-border px-2.5 py-1.5 text-left transition-colors duration-150 hover:bg-surface-secondary focus-visible:border-primary">
            <kbd className="grid size-5 shrink-0 place-items-center rounded-md bg-surface-secondary text-[11px] font-semibold">{i + 1}</kbd>
            <span>{o.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Watch mode (opt-in): what the agent just looked at, what it thinks, and what it will do next. */
export function WatchCard() {
  const watch = useChat((s) => s.watch);
  const plan = useChat((s) => s.watchPlan);
  const busy = useChat((s) => s.busy);
  if (!watch || !busy) return null;
  return (
    <figure aria-label="What the assistant sees" className="overflow-hidden rounded-2xl border border-border bg-surface">
      <figcaption className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-[11.5px] font-medium text-text-secondary">
        <Eye size={13} className="text-primary" /> Watch mode · step {watch.step}{watch.app ? ` · in ${watch.app}` : ""}
      </figcaption>
      {watch.shot && <img src={`data:image/jpeg;base64,${watch.shot}`} alt="The screenshot the assistant just looked at" className="block w-full" />}
      <div className="space-y-1.5 p-3 text-[12px]">
        <p><span className="font-medium">What I see: </span><span className="text-text-secondary">{watch.thinking || "…"}</span></p>
        <p><span className="font-medium">Next: </span><span className="text-text-secondary">{watch.next}</span></p>
        {plan && (
          <details>
            <summary className="cursor-pointer font-medium">The plan you approved</summary>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-text-secondary">{plan.map((s, i) => <li key={i}>{s}</li>)}</ol>
          </details>
        )}
        <p className="text-[10.5px] text-text-secondary">This picture is only kept in memory while the task runs. It is the same image that is sent to Gemini.</p>
      </div>
    </figure>
  );
}
