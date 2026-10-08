import { useEffect, useState } from "react";
import { ipc, defaultMemory, type MemoryConfig, type MemoryStats } from "../lib/ipc";
import { useOllama } from "../hooks/useOllama";
import { useStore, type Layout, type Theme } from "../store/useStore";
import { Modal, ModalHeader } from "./Modal";

const ENGINES = ["duckduckgo", "google", "bing", "brave"];
const PROVIDERS = ["ollama", "openai", "anthropic", "gemini"];

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div>
        <p className="font-medium">{label}</p>
        {hint && <p className="text-[12px] text-text-secondary">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

const selectCls = "rounded-lg border border-border bg-surface px-2 py-1.5";

export function SettingsPanel() {
  const { theme, layout, aiAutocomplete, setTheme, setLayout, setAiAutocomplete } = useStore();
  const [mem, setMem] = useState<MemoryConfig>(defaultMemory);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [engine, setEngine] = useState("duckduckgo");
  const [provider, setProvider] = useState("ollama");
  const [model, setModel] = useState("");
  const [ollamaUrl, setOllamaUrl] = useState("http://localhost:11434");
  const [key, setKey] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const { status, refresh } = useOllama(5000);
  const close = () => useStore.getState().setOverlay(null);

  useEffect(() => {
    void ipc.memorySaverGet().then(setMem);
    void ipc.memoryStats().then(setStats);
    void ipc.settingsGet().then((s) => {
      setEngine(s.search_engine ?? "duckduckgo");
      setProvider(s.ai_provider ?? "ollama");
      setModel(s.ai_model ?? "");
      setOllamaUrl(s.ollama_url ?? "http://localhost:11434");
    });
  }, []);

  const saveMem = (next: MemoryConfig) => {
    setMem(next);
    void ipc.memorySaverSet(next);
  };
  const save = async (k: string, v: string) => {
    try {
      await ipc.settingsSet(k, v);
      setMsg(null);
      void refresh();
    } catch (e) {
      setMsg(String(e));
    }
  };

  return (
    <Modal onClose={close} label="Settings" width="max-w-xl">
      <ModalHeader title="Settings" onClose={close} />
      <div className="divide-y divide-border overflow-y-auto px-5 pb-3">
        <div className="py-2">
          <h3 className="pt-2 text-[12px] font-semibold uppercase tracking-wide text-text-secondary">Appearance</h3>
          <Row label="Theme">
            <select className={selectCls} value={theme} onChange={(e) => setTheme(e.target.value as Theme)} aria-label="Theme">
              <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
            </select>
          </Row>
          <Row label="New tab layout">
            <select className={selectCls} value={layout} onChange={(e) => setLayout(e.target.value as Layout)} aria-label="New tab layout">
              <option value="classic">Classic</option><option value="minimal">Minimal</option><option value="productivity">Productivity</option>
            </select>
          </Row>
          <Row label="Search engine">
            <select className={selectCls} value={engine} onChange={(e) => { setEngine(e.target.value); void save("search_engine", e.target.value); }} aria-label="Search engine">
              {ENGINES.map((e) => <option key={e} value={e}>{e[0].toUpperCase() + e.slice(1)}</option>)}
            </select>
          </Row>
        </div>

        <div className="py-2">
          <h3 className="pt-2 text-[12px] font-semibold uppercase tracking-wide text-text-secondary">Memory Saver</h3>
          <Row label="Suspend idle tabs" hint="Never suspends the active tab, pinned tabs, audio, camera/mic, or downloads.">
            <input type="checkbox" role="switch" className="size-4 accent-primary" checked={mem.enabled} onChange={(e) => saveMem({ ...mem, enabled: e.target.checked })} aria-label="Memory Saver" />
          </Row>
          <Row label="Mode" hint={mem.mode === "balanced" ? "Suspend after 20 minutes idle" : "Suspend after 5 minutes idle"}>
            <select className={selectCls} value={mem.mode} disabled={!mem.enabled} onChange={(e) => saveMem({ ...mem, mode: e.target.value as MemoryConfig["mode"], timeout_minutes: null })} aria-label="Memory Saver mode">
              <option value="balanced">Balanced</option><option value="maximum">Maximum savings</option>
            </select>
          </Row>
          {stats && <p className="pb-1 text-[12px] text-text-secondary">{stats.suspended_tabs} of {stats.total_tabs} tabs suspended · ~{stats.estimated_saved_mb} MB saved (estimate) · system memory {Math.round(stats.system_used_pct)}% used</p>}
        </div>

        <div className="py-2">
          <h3 className="pt-2 text-[12px] font-semibold uppercase tracking-wide text-text-secondary">AI</h3>
          <Row label="Provider" hint={provider === "ollama" ? "Runs on your device. Nothing is sent to the cloud." : "Page text will be sent to this cloud provider."}>
            <select className={selectCls} value={provider} onChange={(e) => { setProvider(e.target.value); setModel(""); void save("ai_provider", e.target.value); void save("ai_model", ""); }} aria-label="AI provider">
              {PROVIDERS.map((p) => <option key={p} value={p}>{p === "ollama" ? "Ollama (local)" : p[0].toUpperCase() + p.slice(1)}</option>)}
            </select>
          </Row>
          <Row label="Model" hint={status?.models.length ? `Installed: ${status.models.slice(0, 4).join(", ")}` : undefined}>
            <input className={`${selectCls} w-44`} value={model} placeholder={provider === "ollama" ? "llama3" : "default"} onChange={(e) => setModel(e.target.value)} onBlur={() => void save("ai_model", model)} aria-label="Model" />
          </Row>
          {provider === "ollama" ? (
            <Row label="Ollama address">
              <input className={`${selectCls} w-56`} value={ollamaUrl} onChange={(e) => setOllamaUrl(e.target.value)} onBlur={() => void save("ollama_url", ollamaUrl)} aria-label="Ollama address" />
            </Row>
          ) : (
            <Row label="API key" hint={status?.has_key ? "A key is stored in your OS keychain." : "Stored in your OS keychain, never on disk."}>
              <div className="flex gap-2">
                <input type="password" autoComplete="off" className={`${selectCls} w-44`} value={key} placeholder={status?.has_key ? "••••••••" : "paste key"} onChange={(e) => setKey(e.target.value)} aria-label="API key" />
                <button type="button" className="rounded-lg bg-primary px-3 py-1.5 text-white transition-opacity duration-150 hover:opacity-90 dark:text-bg" onClick={async () => { try { await ipc.aiSetKey(provider, key); setKey(""); void refresh(); setMsg("Key saved"); } catch (e) { setMsg(String(e)); } }}>Save</button>
              </div>
            </Row>
          )}
          <Row label="AI address suggestions" hint="Adds a model-completed suggestion while you type.">
            <input type="checkbox" role="switch" className="size-4 accent-primary" checked={aiAutocomplete} onChange={(e) => setAiAutocomplete(e.target.checked)} aria-label="AI address suggestions" />
          </Row>
          <p className="flex items-center gap-2 pt-1 text-[12px]" role="status">
            <span className={`size-2 rounded-full ${status?.online ? "bg-group-personal" : "bg-red-500"}`} />
            {status?.online ? `Ready · ${status.provider} · ${status.model}` : status?.error ?? "Checking…"}
          </p>
          {msg && <p role="alert" className="pt-1 text-[12px] text-red-500">{msg}</p>}
        </div>
      </div>
    </Modal>
  );
}
