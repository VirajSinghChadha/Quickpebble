import { useEffect, useRef, useState } from "react";
import { Wrench, X } from "lucide-react";
import { useStore, type Layout } from "../../store/useStore";
import { HomeOptions } from "./HomeOptions";

/** A tiny wrench in the bottom-left corner of the home page that opens its customise panel. */
export function HomeCustomize() {
  const [open, setOpen] = useState(false);
  const layout = useStore((s) => s.layout);
  const setLayout = useStore((s) => s.setLayout);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("mousedown", onDown); };
  }, [open]);
  return (
    <div ref={box} className="absolute bottom-3 left-3 z-20">
      {open && (
        <div role="dialog" aria-label="Customize home page" className="mb-2 w-[min(330px,calc(100vw-24px))] rounded-2xl border border-border bg-surface p-4 shadow-float">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[13px] font-semibold">Customize this page</h2>
            <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="grid size-6 place-items-center rounded-md text-text-secondary hover:bg-surface-secondary"><X size={13} /></button>
          </div>
          <label className="mb-2 flex items-center justify-between text-[12.5px]">Layout
            <select className="rounded-lg border border-border bg-surface px-2 py-1" value={layout} onChange={(e) => setLayout(e.target.value as Layout)} aria-label="New tab layout">
              <option value="classic">Classic</option><option value="minimal">Minimal</option><option value="productivity">Productivity</option>
            </select>
          </label>
          <div className="max-h-[52vh] overflow-y-auto border-t border-border pt-2"><HomeOptions /></div>
        </div>
      )}
      <button
        type="button"
        aria-label="Customize this page"
        title="Customize this page"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="grid size-7 place-items-center rounded-full text-text-secondary opacity-40 transition-[opacity,background-color] duration-200 hover:bg-surface hover:opacity-100 focus-visible:opacity-100"
      >
        <Wrench size={13} />
      </button>
    </div>
  );
}
