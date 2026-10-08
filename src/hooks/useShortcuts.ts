import { useEffect } from "react";
import { isMac, matchShortcut, runAction } from "../lib/actions";
import { onShortcut } from "../lib/ipc";
import { useStore } from "../store/useStore";

/** Keys typed while the chrome has focus, plus shortcuts forwarded from page webviews. */
export function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const s = useStore.getState();
        if (s.overlay) s.setOverlay(null);
        return;
      }
      const action = matchShortcut(e, isMac);
      if (action) {
        e.preventDefault();
        runAction(action);
      }
    };
    window.addEventListener("keydown", onKey);
    let unlisten: (() => void) | undefined;
    void onShortcut(runAction).then((u) => (unlisten = u));
    return () => {
      window.removeEventListener("keydown", onKey);
      unlisten?.();
    };
  }, []);
}
