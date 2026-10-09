import { useEffect } from "react";
import { ipc, onHttpsFallback, onOpenUrl, onTabEvent, onUpdate } from "../lib/ipc";
import { useUpdater } from "../store/useUpdater";
import { useStore } from "../store/useStore";

/** Boots the session and keeps the store in sync with Rust-side tab events. */
export function useTabs(): void {
  useEffect(() => {
    const unlisten: (() => void)[] = [];
    let disposed = false;
    const keep = (u: () => void) => (disposed ? u() : unlisten.push(u));
    void useStore.getState().init();
    void onTabEvent((e) => useStore.getState().applyEvent(e)).then(keep);
    void onHttpsFallback((e) => useStore.getState().setHttpsPrompt(e)).then(keep);
    void onOpenUrl((e) => void useStore.getState().newTab(e.url)).then(keep);
    void onUpdate((u) => useUpdater.getState().available(u)).then(keep);
    return () => {
      disposed = true;
      unlisten.forEach((u) => u());
    };
  }, []);
}

/** Tells Rust to hide page webviews while a UI overlay needs to be visible above them. */
export function useContentVisibility(): void {
  const overlay = useStore((s) => s.overlay);
  const menuOpen = useStore((s) => s.menuOpen);
  const suggestOpen = useStore((s) => s.suggestOpen);
  const hidden = overlay !== null || menuOpen || suggestOpen;
  useEffect(() => {
    void ipc.contentVisible(!hidden);
  }, [hidden]);
}
