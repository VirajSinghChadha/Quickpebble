import { useEffect } from "react";
import { ipc } from "../lib/ipc";

/** Dialogs drawn by the interface sit under the native page view; hide the page while one is open. */
export function useHidePage(): void {
  useEffect(() => {
    void ipc.contentVisible(false);
    return () => { void ipc.contentVisible(true); };
  }, []);
}
