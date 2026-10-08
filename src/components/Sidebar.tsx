import { Bot, HeartPulse, PanelRightClose } from "lucide-react";
import { SIDEBAR_WIDTH, useStore } from "../store/useStore";
import { ChatPanel } from "./ChatPanel";
import { TherapistPanel } from "./TherapistPanel";

export function Sidebar() {
  const sidebar = useStore((s) => s.sidebar);
  const setSidebar = useStore((s) => s.setSidebar);
  if (!sidebar) return null;
  const tab = (id: "assistant" | "therapist", label: string, Icon: typeof Bot) => (
    <button
      type="button"
      role="tab"
      aria-selected={sidebar === id}
      onClick={() => setSidebar(id)}
      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition-colors duration-150 ${sidebar === id ? "bg-surface-secondary text-text-primary" : "text-text-secondary hover:bg-surface-secondary"}`}
    >
      <Icon size={14} /> {label}
    </button>
  );
  return (
    <aside className="flex min-h-0 shrink-0 flex-col border-l border-border bg-surface" style={{ width: SIDEBAR_WIDTH }} aria-label="Side panel">
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5" role="tablist">
        {tab("assistant", "Assistant", Bot)}
        {tab("therapist", "Tab Therapist", HeartPulse)}
        <button type="button" aria-label="Close side panel" onClick={() => setSidebar(null)} className="ml-auto grid size-7 place-items-center rounded-lg text-text-secondary hover:bg-surface-secondary"><PanelRightClose size={15} /></button>
      </div>
      <div className="min-h-0 flex-1">{sidebar === "assistant" ? <ChatPanel /> : <TherapistPanel />}</div>
    </aside>
  );
}
