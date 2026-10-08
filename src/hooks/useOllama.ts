import { useCallback, useEffect, useState } from "react";
import { ipc, type AiStatus } from "../lib/ipc";

/** Polls the AI daemon (Ollama or a configured fallback) for availability. */
export function useOllama(pollMs = 15000) {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const refresh = useCallback(async () => setStatus(await ipc.aiStatus()), []);
  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, pollMs);
    return () => clearInterval(t);
  }, [refresh, pollMs]);
  return { status, refresh };
}
