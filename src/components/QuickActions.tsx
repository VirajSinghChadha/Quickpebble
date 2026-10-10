import { useMemo, useState } from "react";
import { UserRound, BookOpen, Bot, Brain, Bookmark, Download, EyeOff, FileText, HeartPulse, History, Layers, Moon, Palette, Plus, Puzzle, RotateCcw, Search, Settings, ShieldCheck, Sparkles, Star } from "lucide-react";
import { ipc } from "../lib/ipc";
import { modKey } from "../lib/actions";
import { selectActive, useStore } from "../store/useStore";
import { Modal } from "./Modal";

interface Cmd {
  id: string;
  title: string;
  hint?: string;
  icon: typeof Plus;
  run: () => void | Promise<void>;
}

/** ⌘⇧P command palette. */
export function QuickActions() {
  const s = useStore.getState();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const close = () => useStore.getState().setOverlay(null);

  const commands = useMemo<Cmd[]>(
    () => [
      { id: "new", title: "Open New Tab", hint: `${modKey}T`, icon: Plus, run: () => void s.newTab() },
      { id: "search-tabs", title: "Search Tabs", hint: `${modKey}⇧A`, icon: Layers, run: () => s.setOverlay("tabsearch") },
      {
        id: "memory",
        title: "Toggle Memory Saver",
        icon: Moon,
        run: async () => {
          const c = await ipc.memorySaverGet();
          await ipc.memorySaverSet({ ...c, enabled: !c.enabled });
        },
      },
      { id: "private", title: "Open Private Window", hint: `${modKey}⇧N`, icon: EyeOff, run: () => void ipc.windowNewPrivate() },
      {
        id: "theme",
        title: "Change Theme",
        hint: "cycle system → light → dark",
        icon: Palette,
        run: () => {
          const order = ["system", "light", "dark"] as const;
          const cur = useStore.getState().theme;
          s.setTheme(order[(order.indexOf(cur) + 1) % order.length]);
        },
      },
      { id: "layout", title: "Change New Tab Layout", icon: Layers, run: () => {
          const order = ["classic", "minimal", "productivity"] as const;
          const cur = useStore.getState().layout;
          s.setLayout(order[(order.indexOf(cur) + 1) % order.length]);
        } },
      { id: "summary", title: "Summarize This Page", icon: Sparkles, run: () => void s.summarize(selectActive(useStore.getState()).id) },
      { id: "bookmark", title: "Bookmark This Page", hint: `${modKey}D`, icon: Star, run: () => void s.toggleBookmark(selectActive(useStore.getState()).id) },
      { id: "pin", title: "Pin / Unpin Tab", icon: FileText, run: () => s.togglePin(selectActive(useStore.getState()).id) },
      { id: "assistant", title: "Open AI Assistant", hint: `${modKey}J`, icon: Bot, run: () => s.setSidebar("assistant") },
      { id: "therapist", title: "Open Tab Therapist", icon: HeartPulse, run: () => s.setSidebar("therapist") },
      { id: "extensions", title: "Manage Extensions", icon: Puzzle, run: () => s.setOverlay("extensions") },
      { id: "library", title: "Open History & Bookmarks", hint: `${modKey}Y`, icon: History, run: () => s.setOverlay("library") },
      { id: "recall", title: "Search Pages I've Read (Recall)", icon: Brain, run: () => s.setOverlay("library") },
      { id: "profiles", title: "Profiles (separate logins, e.g. Google accounts)", icon: UserRound, run: () => s.setOverlay("profiles") },
      { id: "reopen", title: "Reopen Closed Tab", hint: `${modKey}⇧T`, icon: RotateCcw, run: () => s.reopenTab() },
      { id: "find", title: "Find in Page", hint: `${modKey}F`, icon: Search, run: () => void ipc.tabFind(selectActive(useStore.getState()).id) },
      { id: "reader", title: "Toggle Reader Mode", hint: `${modKey}⇧R`, icon: BookOpen, run: () => void ipc.tabReader(selectActive(useStore.getState()).id) },
      { id: "bar", title: "Toggle Bookmarks Bar", hint: `${modKey}⇧B`, icon: Bookmark, run: () => s.toggleBookmarksBar() },
      { id: "update", title: "Check for Updates", icon: Download, run: () => s.setOverlay("settings") },
      { id: "privacy", title: "Open Privacy Center", icon: ShieldCheck, run: () => s.setOverlay("privacy") },
      { id: "settings", title: "Open Settings", icon: Settings, run: () => s.setOverlay("settings") },
      { id: "ai", title: "Toggle AI Address Suggestions", icon: Brain, run: () => s.setAiAutocomplete(!useStore.getState().aiAutocomplete) },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const shown = commands.filter((c) => c.title.toLowerCase().includes(q.trim().toLowerCase()));
  const run = (c: Cmd | undefined) => {
    if (!c) return;
    const keepOpen = ["search-tabs", "privacy", "settings", "extensions", "library", "recall", "profiles"].includes(c.id);
    if (!keepOpen) close();
    void c.run();
  };

  return (
    <Modal onClose={close} label="Quick Actions" align="top" width="max-w-lg" radius="rounded-2xl">
      <input
        autoFocus
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setSel(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") (e.preventDefault(), setSel((i) => (i + 1) % Math.max(shown.length, 1)));
          else if (e.key === "ArrowUp") (e.preventDefault(), setSel((i) => (i - 1 + shown.length) % Math.max(shown.length, 1)));
          else if (e.key === "Enter") run(shown[sel]);
        }}
        placeholder="Type a command…"
        aria-label="Command"
        className="border-b border-border bg-transparent px-5 py-4 text-[15px] outline-none placeholder:text-text-secondary"
      />
      <ul role="listbox" className="overflow-y-auto p-2">
        {shown.length === 0 && <li className="px-3 py-6 text-center text-text-secondary">No matching commands</li>}
        {shown.map((c, i) => (
          <li
            key={c.id}
            role="option"
            aria-selected={i === sel}
            onMouseEnter={() => setSel(i)}
            onClick={() => run(c)}
            className={`flex cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2.5 ${i === sel ? "bg-surface-secondary" : ""}`}
          >
            <c.icon size={16} className="text-text-secondary" />
            <span className="flex-1 text-[13.5px]">{c.title}</span>
            {c.hint && <kbd className="rounded-md bg-surface-secondary px-1.5 py-0.5 font-sans text-[11px] text-text-secondary">{c.hint}</kbd>}
          </li>
        ))}
      </ul>
    </Modal>
  );
}
