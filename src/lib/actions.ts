import { ipc } from "./ipc";
import { selectActive, useStore } from "../store/useStore";

/** Central dispatcher for keyboard shortcuts (UI + injected page script) and the command palette. */
export function runAction(action: string): void {
  const s = useStore.getState();
  const active = selectActive(s);
  switch (action) {
    case "new-tab":
      s.newTab();
      break;
    case "close-tab":
      s.closeTab(active.id);
      break;
    case "focus-address":
      s.focusAddress();
      break;
    case "reload":
      void ipc.tabNav(active.id, "reload");
      break;
    case "back":
      void ipc.tabNav(active.id, "back");
      break;
    case "forward":
      void ipc.tabNav(active.id, "forward");
      break;
    case "bookmark":
      void s.toggleBookmark(active.id);
      break;
    case "palette":
      s.setOverlay(s.overlay === "palette" ? null : "palette");
      break;
    case "tab-search":
      s.setOverlay(s.overlay === "tabsearch" ? null : "tabsearch");
      break;
    case "private":
      void ipc.windowNewPrivate();
      break;
  }
}

/** Shortcut table shared by the key handler and the UI hints. `shift` = requires Shift. */
export const SHORTCUTS: { key: string; shift: boolean; action: string }[] = [
  { key: "t", shift: false, action: "new-tab" },
  { key: "w", shift: false, action: "close-tab" },
  { key: "l", shift: false, action: "focus-address" },
  { key: "r", shift: false, action: "reload" },
  { key: "d", shift: false, action: "bookmark" },
  { key: "[", shift: false, action: "back" },
  { key: "]", shift: false, action: "forward" },
  { key: "p", shift: true, action: "palette" },
  { key: "a", shift: true, action: "tab-search" },
  { key: "n", shift: true, action: "private" },
];

export function matchShortcut(e: Pick<KeyboardEvent, "key" | "shiftKey" | "altKey" | "metaKey" | "ctrlKey">, mac: boolean): string | null {
  if (!(mac ? e.metaKey : e.ctrlKey) || e.altKey) return null;
  const k = e.key.toLowerCase();
  return SHORTCUTS.find((s) => s.key === k && s.shift === e.shiftKey)?.action ?? null;
}

export const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
export const modKey = isMac ? "⌘" : "Ctrl+";
