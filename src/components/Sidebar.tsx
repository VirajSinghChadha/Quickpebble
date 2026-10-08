import { Bookmark, Bot, Download, HeartPulse, KeyRound, PanelRightClose, SlidersHorizontal } from "lucide-react";
import { SIDEBAR_WIDTH, useStore, type Sidebar as SidebarId } from "../store/useStore";
import { BookmarksPanel } from "./BookmarksPanel";
import { ChatPanel } from "./ChatPanel";
import { DownloadsPanel } from "./DownloadsPanel";
import { PasswordsPanel } from "./PasswordsPanel";
import { SitePanel } from "./SitePanel";
import { TherapistPanel } from "./TherapistPanel";

const TABS: { id: Exclude<SidebarId, null>; label: string; Icon: typeof Bot }[] = [
  { id: "assistant", label: "Assistant", Icon: Bot },
  { id: "bookmarks", label: "Bookmarks", Icon: Bookmark },
  { id: "downloads", label: "Downloads", Icon: Download },
  { id: "passwords", label: "Passwords", Icon: KeyRound },
  { id: "site", label: "This site", Icon: SlidersHorizontal },
  { id: "therapist", label: "Tabs", Icon: HeartPulse },
];

export function Sidebar() {
  const sidebar = useStore((s) => s.sidebar);
  const setSidebar = useStore((s) => s.setSidebar);
  if (!sidebar) return null;
  return (
    <aside className="flex min-h-0 shrink-0 flex-col border-l border-border bg-surface" style={{ width: SIDEBAR_WIDTH }} aria-label="Side panel">
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5" role="tablist">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={sidebar === id}
            aria-label={label}
            title={label}
            onClick={() => setSidebar(id)}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium ${sidebar === id ? "bg-surface-secondary text-text-primary" : "text-text-secondary hover:bg-surface-secondary"}`}
          >
            <Icon size={14} /> {sidebar === id && label}
          </button>
        ))}
        <button type="button" aria-label="Close side panel" onClick={() => setSidebar(null)} className="ml-auto grid size-7 place-items-center rounded-lg text-text-secondary hover:bg-surface-secondary"><PanelRightClose size={15} /></button>
      </div>
      <div className="min-h-0 flex-1">
        {sidebar === "assistant" ? <ChatPanel /> : sidebar === "bookmarks" ? <BookmarksPanel /> : sidebar === "site" ? <SitePanel /> : sidebar === "passwords" ? <PasswordsPanel /> : sidebar === "downloads" ? <DownloadsPanel /> : <TherapistPanel />}
      </div>
    </aside>
  );
}
