import { useEffect } from "react";
import { ipc, onTabEvent } from "../lib/ipc";
import { useStore } from "../store/useStore";

/** Boots the session and keeps the store in sync with Rust-side tab events. */
export function useTabs(): void {
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const st = useStore.getState();
    void st.init();
    void onTabEvent((e) => useStore.getState().applyEvent(e)).then((u) => (unlisten = u));
    return () => unlisten?.();
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
