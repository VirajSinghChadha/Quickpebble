import { ArrowLeft, ArrowRight, BookOpen, Bookmark, Bot, Download, MoonStar, Puzzle, RotateCw, Settings, ShieldCheck, Sparkles, Sun, SunMoon, X, Minus, Square } from "lucide-react";
import { useUpdater } from "../store/useUpdater";
import { ipc } from "../lib/ipc";
import { isMac, modKey } from "../lib/actions";
import { selectActive, useStore, type Theme } from "../store/useStore";
import { AddressBar } from "./AddressBar";
import { IconButton } from "./IconButton";

const THEME_ORDER: Theme[] = ["system", "light", "dark"];
const THEME_ICON = { system: SunMoon, light: Sun, dark: MoonStar };

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
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const setOverlay = useStore((s) => s.setOverlay);
  const sidebar = useStore((s) => s.sidebar);
  const update = useUpdater((s) => s.info);
  const hasPage = !!tab.url;
  const ThemeIcon = THEME_ICON[theme];

  return (
    <div className="flex h-[52px] items-center gap-1 border-b border-border bg-surface px-3" role="toolbar" aria-label="Browser toolbar">
      <IconButton label={`Back (${modKey}[)`} disabled={!hasPage} onClick={() => ipc.tabNav(tab.id, "back")}><ArrowLeft size={17} /></IconButton>
      <IconButton label={`Forward (${modKey}])`} disabled={!hasPage} onClick={() => ipc.tabNav(tab.id, "forward")}><ArrowRight size={17} /></IconButton>
      <IconButton label={`Reload (${modKey}R)`} disabled={!hasPage} onClick={() => ipc.tabNav(tab.id, "reload")}><RotateCw size={16} /></IconButton>

      <div className="mx-auto flex w-full max-w-2xl items-center gap-1">
        <AddressBar />
      </div>

      <IconButton label={`Bookmark (${modKey}D)`} disabled={!hasPage} active={tab.bookmarked} onClick={() => void useStore.getState().toggleBookmark(tab.id)}>
        <Bookmark size={16} fill={tab.bookmarked ? "currentColor" : "none"} />
      </IconButton>
      <IconButton label={`Reader mode (${modKey}⇧R)`} disabled={!hasPage} onClick={() => void ipc.tabReader(tab.id)}><BookOpen size={16} /></IconButton>
      <IconButton label="Summarize page with AI" disabled={!hasPage} onClick={() => void useStore.getState().summarize(tab.id)}><Sparkles size={16} /></IconButton>
      <IconButton label={`Assistant (${modKey}J)`} active={sidebar !== null} onClick={() => useStore.getState().toggleSidebar("assistant")}><Bot size={17} /></IconButton>
      <IconButton label="Extensions" onClick={() => setOverlay("extensions")}><Puzzle size={16} /></IconButton>
      <IconButton label="Privacy Center" onClick={() => setOverlay("privacy")}><ShieldCheck size={17} /></IconButton>
      <IconButton label={`Theme: ${theme}`} onClick={() => setTheme(THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length])}><ThemeIcon size={16} /></IconButton>
      {update && (
        <button type="button" onClick={() => setOverlay("settings")} className="flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 text-[12px] font-medium text-white dark:text-bg" title={`Version ${update.version} is available`}>
          <Download size={13} /> Update
        </button>
      )}
      <IconButton label="Settings" onClick={() => setOverlay("settings")}><Settings size={16} /></IconButton>
    </div>
  );
}
