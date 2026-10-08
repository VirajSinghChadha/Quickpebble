import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronRight, Copy, Pin, PinOff, Plus, Search, Volume2, VolumeX, X, Camera, Moon, Sparkles } from "lucide-react";
import { GROUPS, useStore, type GroupName, type Tab } from "../store/useStore";
import { tabLabel } from "../lib/url";
import { orderForStrip, toggled } from "../lib/tabGroups";
import { isMac, modKey } from "../lib/actions";
import { Favicon } from "./Favicon";
import { IconButton } from "./IconButton";
import { WindowControls } from "./Toolbar";

const GROUP_COLOR: Record<GroupName, string> = {
  School: "bg-group-school",
  Work: "bg-group-work",
  Personal: "bg-group-personal",
  Entertainment: "bg-group-entertainment",
  Shopping: "bg-group-shopping",
};

interface MenuState {
  tab: Tab;
  x: number;
  y: number;
}

export function TabStrip() {
  const tabs = useStore((s) => s.tabs);
  const activeId = useStore((s) => s.activeId);
  const { activate, closeTab, newTab, setOverlay, setMenuOpen } = useStore.getState();
  const [collapsed, setCollapsed] = useState<Set<GroupName>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("qp.collapsedGroups") ?? "[]") as string[];
      return new Set(GROUPS.filter((g) => saved.includes(g)));
    } catch {
      return new Set();
    }
  });
  useEffect(() => {
    try { localStorage.setItem("qp.collapsedGroups", JSON.stringify([...collapsed])); } catch { /* storage unavailable */ }
  }, [collapsed]);
  const items = orderForStrip(tabs, GROUPS, collapsed, activeId);
  const [menu, setMenu] = useState<MenuState | null>(null);

  useEffect(() => setMenuOpen(menu !== null), [menu, setMenuOpen]);

  return (
    <div
      className="flex h-10 select-none items-end gap-1 px-2 pb-1"
      data-tauri-drag-region
      style={{ paddingLeft: isMac ? 78 : 8 }}
      role="tablist"
      aria-label="Tabs"
    >
      <div className="flex min-w-0 flex-1 items-end gap-1 overflow-x-auto overflow-y-hidden" data-tauri-drag-region>
        <AnimatePresence initial={false}>
          {items.map((item) =>
            item.kind === "group" ? (
              <motion.button
                layout
                key={`group-${item.group}`}
                type="button"
                aria-expanded={!item.collapsed}
                title={`${item.collapsed ? "Expand" : "Collapse"} the ${item.group} group`}
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
                onClick={() => setCollapsed((prev) => toggled(prev, item.group))}
                className="mb-0.5 flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-[11.5px] font-semibold text-white shadow-pebble transition-[filter] duration-150 hover:brightness-110"
                style={{ backgroundColor: `var(--color-group-${item.group.toLowerCase()})`, opacity: item.collapsed ? 0.85 : 1 }}
              >
                {item.collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                {item.group}
                <span className="rounded-full bg-white/25 px-1.5 text-[10.5px] tabular-nums">{item.count}</span>
              </motion.button>
            ) : (
              <PebbleTab
                key={item.tab.id}
                tab={item.tab}
                active={item.tab.id === activeId}
                onSelect={() => activate(item.tab.id)}
                onClose={() => closeTab(item.tab.id)}
                onMenu={(x, y) => setMenu({ tab: item.tab, x, y })}
              />
            ),
          )}
        </AnimatePresence>
        <IconButton label={`New tab (${modKey}T)`} onClick={() => newTab()} className="mb-0 size-7">
          <Plus size={16} />
        </IconButton>
      </div>
      <IconButton label={`Search tabs (${modKey}⇧A)`} onClick={() => setOverlay("tabsearch")} className="size-7">
        <Search size={15} />
      </IconButton>
      <WindowControls />
      {menu && <TabMenu menu={menu} onClose={() => setMenu(null)} />}
    </div>
  );
}

function PebbleTab({
  tab,
  active,
  onSelect,
  onClose,
  onMenu,
}: {
  tab: Tab;
  active: boolean;
  onSelect: () => void;
  onClose: () => void;
  onMenu: (x: number, y: number) => void;
}) {
  const label = tabLabel(tab.title, tab.url);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
      role="tab"
      aria-selected={active}
      tabIndex={0}
      title={label}
      onClick={onSelect}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect()}
      onAuxClick={(e) => e.button === 1 && onClose()}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu(e.clientX, e.clientY);
      }}
      className={`group relative flex h-8 min-w-0 items-center gap-2 rounded-xl px-2.5 text-[12.5px] transition-colors duration-150
        ${tab.pinned ? "w-10 shrink-0 justify-center px-0" : "max-w-56 min-w-28 flex-1 basis-0"}
        ${active ? "bg-surface text-text-primary shadow-pebble" : "text-text-secondary hover:bg-surface-secondary"}`}
    >
      {tab.group && <span className={`absolute inset-x-3 -top-px h-0.5 rounded-full ${GROUP_COLOR[tab.group]}`} aria-hidden />}
      {tab.loading ? <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-border border-t-primary" aria-label="Loading" /> : <Favicon src={tab.favicon} url={tab.url} />}
      {!tab.pinned && (
        <>
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {tab.recording && <Camera size={12} className="shrink-0 text-red-500" aria-label="Using camera or microphone" />}
          {tab.suspended && <Moon size={12} className="shrink-0" aria-label="Suspended to save memory" />}
          {tab.audible && !tab.muted && <Volume2 size={12} className="shrink-0 text-primary" aria-label="Playing audio" />}
          {tab.muted && <VolumeX size={12} className="shrink-0" aria-label="Muted" />}
          <button
            type="button"
            aria-label="Close tab"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="grid size-5 shrink-0 place-items-center rounded-md opacity-0 transition-opacity duration-150 hover:bg-border group-hover:opacity-100 focus-visible:opacity-100"
          >
            <X size={12} />
          </button>
        </>
      )}
    </motion.div>
  );
}

function TabMenu({ menu, onClose }: { menu: MenuState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const { togglePin, toggleMute, duplicate, closeTab, setGroup, classify } = useStore.getState();
  const t = menu.tab;

  useEffect(() => {
    const away = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", away);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };
  const Item = ({ icon, children, onClick }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void }) => (
    <button type="button" role="menuitem" onClick={run(onClick)} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left hover:bg-surface-secondary">
      <span className="text-text-secondary">{icon}</span>
      {children}
    </button>
  );

  return (
    <motion.div
      ref={ref}
      role="menu"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed z-50 w-52 rounded-[14px] border border-border bg-surface p-1.5 text-[12.5px] shadow-float"
      style={{ left: Math.min(menu.x, window.innerWidth - 220), top: menu.y + 4 }}
    >
      <Item icon={t.pinned ? <PinOff size={14} /> : <Pin size={14} />} onClick={() => togglePin(t.id)}>{t.pinned ? "Unpin tab" : "Pin tab"}</Item>
      <Item icon={<Copy size={14} />} onClick={() => duplicate(t.id)}>Duplicate</Item>
      <Item icon={t.muted ? <Volume2 size={14} /> : <VolumeX size={14} />} onClick={() => toggleMute(t.id)}>{t.muted ? "Unmute tab" : "Mute tab"}</Item>
      <div className="my-1 h-px bg-border" />
      <p className="px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-text-secondary">Group</p>
      {GROUPS.map((g) => (
        <Item key={g} icon={<span className={`block size-2.5 rounded-full ${GROUP_COLOR[g]}`} />} onClick={() => setGroup(t.id, t.group === g ? null : g)}>
          {g}
          {t.group === g && <span className="ml-auto text-primary">✓</span>}
        </Item>
      ))}
      <Item icon={<Sparkles size={14} />} onClick={() => classify(t.id)}>Auto-group with AI</Item>
      <div className="my-1 h-px bg-border" />
      <Item icon={<X size={14} />} onClick={() => closeTab(t.id)}>Close tab</Item>
    </motion.div>
  );
}
