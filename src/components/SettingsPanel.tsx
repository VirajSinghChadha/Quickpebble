import { useEffect, useState } from "react";
import { ipc, defaultMemory, type MemoryConfig, type MemoryStats } from "../lib/ipc";
import { useUpdater } from "../store/useUpdater";
import { useOllama } from "../hooks/useOllama";
import { useStore, type Layout, type Theme } from "../store/useStore";
import { Modal, ModalHeader } from "./Modal";
import { PRESETS } from "../hooks/useTheme";
import { HomeOptions } from "./home/HomeOptions";

const ENGINES = ["ghostsearch", "google", "brave", "duckduckgo", "bing", "startpage", "ecosia"];
const ENGINE_LABELS: Record<string, string> = { ghostsearch: "GhostSearch (private, no Google)" };
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
  const { theme, presetLight, presetDark, setPreset, layout, aiAutocomplete, setTheme, setLayout, setAiAutocomplete, bookmarksBar, toggleBookmarksBar } = useStore();
  const [httpsOnly, setHttpsOnly] = useState(true);
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [recallOn, setRecallOn] = useState(false);
  const [proxyMode, setProxyMode] = useState("direct");
  const [proxyServer, setProxyServer] = useState("");
  const upd = useUpdater();
  const [mem, setMem] = useState<MemoryConfig>(defaultMemory);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [engine, setEngine] = useState("ghostsearch");
  const [searxUrl, setSearxUrl] = useState("");
  const [blockLevel, setBlockLevel] = useState("standard");
  const [chromeUa, setChromeUa] = useState(true);
  const [cookies, setCookies] = useState(true);
  const [precision, setPrecision] = useState("high");
  const [provider, setProvider] = useState("ollama");
  const [model, setModel] = useState("");
  const [ollamaUrl, setOllamaUrl] = useState("http://localhost:11434");
  const [researchKey, setResearchKey] = useState("");
  const [researchReady, setResearchReady] = useState(false);
  const [researchMessage, setResearchMessage] = useState("");
  const [researchBusy, setResearchBusy] = useState(false);
  const [key, setKey] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const { status, refresh } = useOllama(5000);
  const close = () => useStore.getState().setOverlay(null);

  useEffect(() => void useStore.getState().loadHome(), []);
  useEffect(() => {
    void ipc.researchStatus().then(setResearchReady);
    void ipc.memorySaverGet().then(setMem);
    void ipc.memoryStats().then(setStats);
    void ipc.settingsGet().then((s) => {
      setEngine(s.search_engine ?? "ghostsearch");
      setSearxUrl(s.ghost_searx_url ?? "");
      setBlockLevel(s.block_trackers === "false" ? "off" : s.block_level === "strict" ? "strict" : "standard");
      setChromeUa(s.chrome_ua !== "false");
      setCookies(s.cookie_banners !== "false");
      setPrecision(s.screen_precision === "standard" ? "standard" : "high");
      setProvider(s.ai_provider ?? "ollama");
      setModel(s.ai_model ?? "");
      setOllamaUrl(s.ollama_url ?? "http://localhost:11434");
      setHttpsOnly(s.https_only !== "false");
      setAutoUpdate(s.auto_update_check !== "false");
      setRecallOn(s.recall_enabled === "true");
      setProxyMode(s.proxy_mode === "custom" ? "custom" : "direct");
      setProxyServer(s.proxy_server ?? "");
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
          <Row label="Light mode theme" hint="Each mode keeps its own colors. Switch Theme above to see them.">
            <div className="flex flex-wrap justify-end gap-2" role="group" aria-label="Light mode color theme">
              {PRESETS.map((p) => (
                <button key={p.id} type="button" className="swatch" style={{ background: p.color }} aria-pressed={presetLight === p.id} aria-label={p.label} title={p.label} onClick={() => setPreset("light", p.id)} />
              ))}
            </div>
          </Row>
          <Row label="Dark mode theme">
            <div className="flex flex-wrap justify-end gap-2" role="group" aria-label="Dark mode color theme">
              {PRESETS.map((p) => (
                <button key={p.id} type="button" className="swatch" style={{ background: p.color }} aria-pressed={presetDark === p.id} aria-label={p.label} title={p.label} onClick={() => setPreset("dark", p.id)} />
              ))}
            </div>
          </Row>
          <Row label="New tab layout">
            <select className={selectCls} value={layout} onChange={(e) => setLayout(e.target.value as Layout)} aria-label="New tab layout">
              <option value="classic">Classic</option><option value="minimal">Minimal</option><option value="productivity">Productivity</option>
            </select>
          </Row>
          <Row label="Search engine">
            <select className={selectCls} value={engine} onChange={(e) => { setEngine(e.target.value); void save("search_engine", e.target.value); }} aria-label="Search engine">
              {ENGINES.map((e) => <option key={e} value={e}>{ENGINE_LABELS[e] ?? e[0].toUpperCase() + e.slice(1)}</option>)}
            </select>
          </Row>
          {engine === "ghostsearch" && (
            <div className="space-y-1.5 pb-2">
              <p className="text-[12px] text-text-secondary">GhostSearch asks several independent sources at once (DuckDuckGo, Wikipedia, Marginalia, plus Brave Search if you add a key under Web research), strips tracking from the links and stores nothing. No Google. The sources see your query and IP address; use a proxy such as Tor (below) to hide the IP too.</p>
              <input value={searxUrl} onChange={(e) => setSearxUrl(e.target.value)} onBlur={() => void save("ghost_searx_url", searxUrl.trim())} placeholder="Optional: your own SearXNG address, https://search.example.org" aria-label="SearXNG address" className="h-9 w-full rounded-lg border border-border bg-surface px-3 outline-none focus:border-primary" />
            </div>
          )}
        </div>

        <div className="py-2">
          <h3 className="pt-2 text-[12px] font-semibold uppercase tracking-wide text-text-secondary">Home page</h3>
          <div className="py-2"><HomeOptions /></div>
          <p className="pb-1 text-[11.5px] text-text-secondary">You can also change these from the small wrench icon at the bottom left of the home page.</p>
        </div>

        <div className="py-2">
          <h3 className="pt-2 text-[12px] font-semibold uppercase tracking-wide text-text-secondary">Browsing</h3>
          <Row label="Ad &amp; tracker blocking" hint="Standard blocks known ad and tracking servers. Strict also blocks ad-looking requests and hides ad boxes, which can occasionally break a page. Per-site exceptions: This site panel.">
            <select className={selectCls} value={blockLevel} onChange={(e) => { setBlockLevel(e.target.value); void save("block_level", e.target.value); void save("block_trackers", String(e.target.value !== "off")); }} aria-label="Ad and tracker blocking">
              <option value="off">Off</option><option value="standard">Standard</option><option value="strict">Strict</option>
            </select>
          </Row>
          <Row label="Decline cookie banners" hint="Clicks “Reject all” or “Necessary only” on cookie pop-ups for you, and never clicks Accept. Works on the common banner types; a few sites use unusual ones. Applies to pages loaded after you change it.">
            <input type="checkbox" role="switch" className="size-4 accent-primary" checked={cookies} onChange={(e) => { setCookies(e.target.checked); void save("cookie_banners", String(e.target.checked)); }} aria-label="Decline cookie banners" />
          </Row>
          <Row label="Identify as Chrome" hint="Helps sites that refuse other browsers. Google, YouTube and Apple always see the real browser, because they treat a fake one as a bot and show &quot;are you a robot&quot; checks. Applies to new tabs.">
            <input type="checkbox" role="switch" className="size-4 accent-primary" checked={chromeUa} onChange={(e) => { setChromeUa(e.target.checked); void save("chrome_ua", String(e.target.checked)); }} aria-label="Identify as Chrome" />
          </Row>
          <Row label="Bookmarks bar" hint="Shortcut: ⌘⇧B">
            <input type="checkbox" role="switch" className="size-4 accent-primary" checked={bookmarksBar} onChange={toggleBookmarksBar} aria-label="Bookmarks bar" />
          </Row>
          <Row label="HTTPS-only mode" hint="Upgrades http:// links to https://. You're warned before any site is opened insecurely.">
            <input type="checkbox" role="switch" className="size-4 accent-primary" checked={httpsOnly} onChange={(e) => { setHttpsOnly(e.target.checked); void save("https_only", String(e.target.checked)); }} aria-label="HTTPS-only mode" />
          </Row>
        </div>

        <div className="py-2">
          <h3 className="pt-2 text-[12px] font-semibold uppercase tracking-wide text-text-secondary">Updates</h3>
          <Row label="Check for updates automatically" hint="Looks at this project's GitHub Releases shortly after launch and every 15 minutes (an anonymous request, nothing else is sent). New versions are checked for integrity and never installed without your click.">
            <input type="checkbox" role="switch" className="size-4 accent-primary" checked={autoUpdate} onChange={(e) => { setAutoUpdate(e.target.checked); void save("auto_update_check", String(e.target.checked)); }} aria-label="Automatic update checks" />
          </Row>
          <p className="pb-2 text-[12px] text-text-secondary">Install updates here without downloading a new installer. Your saved tabs and settings stay on this device.</p>
          <div className="flex flex-wrap items-center gap-3 pb-1">
            {!upd.info && <button type="button" disabled={upd.state === "checking"} className="rounded-lg border border-border px-3 py-1.5 hover:bg-surface-secondary disabled:opacity-40" onClick={() => void upd.check()}>{upd.state === "checking" ? "Checking…" : "Check now"}</button>}
            {upd.state === "none" && <span role="status" className="text-text-secondary">You&apos;re up to date.</span>}
            {upd.error && <span role="alert" className="text-[12px] text-red-500">{upd.error}</span>}
            {upd.info && <>
              <span role="status">Version {upd.info.version} is available (you have {upd.info.current}).</span>
              <button type="button" disabled={upd.state === "installing" || upd.state === "checking"} className="rounded-lg bg-primary px-3 py-1.5 font-medium text-white disabled:opacity-40 dark:text-bg" onClick={() => void upd.install()}>{upd.state === "installing" ? "Updating…" : "Install & restart"}</button>
            </>}
          </div>
          {upd.info?.notes && <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap py-2 font-sans text-[12px] text-text-secondary">{upd.info.notes}</pre>}
          {upd.state === "installing" && <div className="space-y-2 py-2" role="status" aria-live="polite">
            <p>{upd.progress?.phase === "installing" ? "Verifying and installing… Quick Pebble will restart." : `Downloading update${upd.percent === null ? "…" : `… ${upd.percent}%`}`}</p>
            {upd.progress?.phase !== "installing" && <progress className="h-2 w-full accent-primary" max={100} value={upd.percent ?? undefined} aria-label="Update download progress" />}
          </div>}
        </div>

        <div className="py-2">
          <h3 className="pt-2 text-[12px] font-semibold uppercase tracking-wide text-text-secondary">Profiles &amp; network</h3>
          <Row label="Profiles" hint="Separate logins and cookies, for example one Google account per profile.">
            <button type="button" className={selectCls} onClick={() => useStore.getState().setOverlay("profiles")}>Manage profiles</button>
          </Row>
          <Row label="Connect through a proxy" hint="Send all browsing through a SOCKS5 or HTTP proxy such as Tor (socks5://127.0.0.1:9050) or your own VPN's proxy port. Quick Pebble does not run a VPN itself.">
            <select className={selectCls} value={proxyMode} onChange={(e) => { setProxyMode(e.target.value); void save("proxy_mode", e.target.value); }} aria-label="Proxy mode">
              <option value="direct">Direct</option><option value="custom">Custom proxy</option>
            </select>
          </Row>
          {proxyMode === "custom" && (
            <div className="pb-2"><input value={proxyServer} onChange={(e) => setProxyServer(e.target.value)} onBlur={() => void save("proxy_server", proxyServer)} placeholder="socks5://127.0.0.1:9050" aria-label="Proxy address" className="h-9 w-full rounded-lg border border-border bg-surface px-3 outline-none focus:border-primary" /></div>
          )}
          <h3 className="pt-2 text-[12px] font-semibold uppercase tracking-wide text-text-secondary">Recall</h3>
          <Row label="Remember pages I read" hint="Keeps the text of pages you visit on this computer so you can search them and ask the assistant about them. Off by default. Never saved in private windows or for logins, payments and webmail. Cleared with history.">
            <input type="checkbox" role="switch" className="size-4 accent-primary" checked={recallOn} onChange={(e) => { setRecallOn(e.target.checked); void save("recall_enabled", String(e.target.checked)); }} aria-label="Remember pages I read" />
          </Row>
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
          <Row label="Screen control precision" hint="High adds a second, much tighter zoom with a crosshair before each click. It clicks the exact center far more reliably but takes one extra AI call (a second or two) per click.">
            <select className={selectCls} value={precision} onChange={(e) => { setPrecision(e.target.value); void save("screen_precision", e.target.value); }} aria-label="Screen control precision">
              <option value="high">High (most precise)</option><option value="standard">Standard (faster)</option>
            </select>
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
        <section className="py-4" aria-label="Web research settings">
          <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-text-secondary">Web research</h3>
          <p className="mb-3 text-xs leading-relaxed text-text-secondary">Add your Brave Search API key to let the assistant find sources beyond your open tabs. Searches run only when you enable “Search the web for sources” in chat. Your question goes to Brave; excerpts go to your chosen AI provider. Your key stays in the OS keychain.</p>
          <div className="flex gap-2"><input type="password" autoComplete="off" aria-label="Brave Search API key" value={researchKey} onChange={e => setResearchKey(e.target.value)} placeholder={researchReady ? 'Key stored · paste to replace' : 'Paste Brave Search API key'} className={`${selectCls} min-w-0 flex-1`}/><button type="button" disabled={researchBusy || !researchKey.trim()} className="rounded-lg bg-primary px-3 text-white disabled:opacity-40 dark:text-bg" onClick={async () => { setResearchBusy(true); try { await ipc.researchKeySet(researchKey); setResearchKey(''); setResearchReady(true); setResearchMessage('Search key saved'); } catch(e) { setResearchMessage(String(e)); } finally { setResearchBusy(false); } }}>Save</button>{researchReady && <button type="button" disabled={researchBusy} className="rounded-lg border border-border px-3" onClick={async () => { setResearchBusy(true); try { await ipc.researchKeySet(''); setResearchReady(false); setResearchMessage('Search key removed'); } catch(e) { setResearchMessage(String(e)); } finally { setResearchBusy(false); } }}>Remove</button>}</div>
          {researchMessage && <p role="status" className="mt-2 text-xs text-text-secondary">{researchMessage}</p>}
        </section>
      </div>
    </Modal>
  );
}
