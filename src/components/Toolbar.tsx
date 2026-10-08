import { ArrowLeft, ArrowRight, BookOpen, Bookmark, BookMarked, Bot, KeyRound, Languages, Download, RotateCw, Settings, SlidersHorizontal, Sparkles, MoreHorizontal, X, Minus, Square } from "lucide-react";
import { useUpdater } from "../store/useUpdater";
import { ipc } from "../lib/ipc";
import { isMac, modKey } from "../lib/actions";
import { selectActive, useStore } from "../store/useStore";
import { AddressBar } from "./AddressBar";
import { IconButton } from "./IconButton";

/** Custom min/max/close buttons for platforms without a native overlay title bar. */
export function WindowControls() {
  if (isMac) return null;
  const btn = "grid h-7 w-9 place-items-center text-text-secondary transition-colors duration-150 hover:bg-surface-secondary hover:text-text-primary";
  return (
    <div className="ml-1 flex items-center self-start">
      <button type="button" aria-label="Minimize" className={btn} onClick={() => ipc.windowControl("minimize")}><Minus size={14} /></button>
      <button type="button" aria-label="Maximize" className={btn} onClick={() => ipc.windowControl("maximize")}><Square size={11} /></button>
      <button type="button" aria-label="Close window" className={`${btn} hover:!bg-red-500 hover:!text-white`} onClick={() => ipc.windowControl("close")}><X size={14} /></button>
    </div>
  );
}

/** 52px toolbar: navigation, centered address bar, and tools. */
export function Toolbar() {
  const tab = useStore(selectActive);
  const setOverlay = useStore((s) => s.setOverlay);
  const sidebar = useStore((s) => s.sidebar);
  const update = useUpdater((s) => s.info);
  const hasPage = !!tab.url;

  return (
    <div className="flex h-[52px] items-center gap-1 border-b border-border bg-surface px-3" role="toolbar" aria-label="Browser toolbar">
      <IconButton label={`Back (${modKey}[)`} disabled={!hasPage} onClick={() => ipc.tabNav(tab.id, "back")}><ArrowLeft size={17} /></IconButton>
      <IconButton label={`Forward (${modKey}])`} disabled={!hasPage} onClick={() => ipc.tabNav(tab.id, "forward")}><ArrowRight size={17} /></IconButton>
      <IconButton label={`Reload (${modKey}R)`} disabled={!hasPage} onClick={() => ipc.tabNav(tab.id, "reload")}><RotateCw size={16} /></IconButton>

      <div className="mx-auto flex w-full max-w-2xl items-center gap-1">
        <AddressBar />
      </div>

      {/* Page actions */}
      <IconButton label={`Bookmark this page (${modKey}D)`} disabled={!hasPage} active={tab.bookmarked} onClick={() => void useStore.getState().toggleBookmark(tab.id)}>
        <Bookmark size={16} fill={tab.bookmarked ? "currentColor" : "none"} />
      </IconButton>
      <IconButton label={`Reader mode (${modKey}⇧R)`} disabled={!hasPage} onClick={() => void ipc.tabReader(tab.id)}><BookOpen size={16} /></IconButton>
      <IconButton label="Translate this page" disabled={!hasPage} active={sidebar === "site"} onClick={() => useStore.getState().toggleSidebar("site")}><Languages size={16} /></IconButton>
      <IconButton label="Summarize this page" disabled={!hasPage} onClick={() => void useStore.getState().summarize(tab.id)}><Sparkles size={16} /></IconButton>

      <span aria-hidden className="mx-1 h-5 w-px bg-border" />

      {/* Side panels: they sit next to the page instead of covering it */}
      <IconButton label={`Assistant (${modKey}J)`} active={sidebar === "assistant"} onClick={() => useStore.getState().toggleSidebar("assistant")}><Bot size={17} /></IconButton>
      <IconButton label="Bookmarks" active={sidebar === "bookmarks"} onClick={() => useStore.getState().toggleSidebar("bookmarks")}><BookMarked size={16} /></IconButton>
      <IconButton label="Passwords" active={sidebar === "passwords"} onClick={() => useStore.getState().toggleSidebar("passwords")}><KeyRound size={16} /></IconButton>
      <IconButton label="This site's settings" disabled={!hasPage} active={sidebar === "site"} onClick={() => useStore.getState().toggleSidebar("site")}><SlidersHorizontal size={16} /></IconButton>

      <span aria-hidden className="mx-1 h-5 w-px bg-border" />

      <IconButton label="Command palette and more" onClick={() => setOverlay("palette")}><MoreHorizontal size={18} /></IconButton>
      {update && (
        <button type="button" onClick={() => setOverlay("settings")} className="flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 text-[12px] font-medium text-white dark:text-bg" title={`Version ${update.version} is available`}>
          <Download size={13} /> Update
        </button>
      )}
      <IconButton label="Settings" onClick={() => setOverlay("settings")}><Settings size={16} /></IconButton>
    </div>
  );
}
