import { useEffect, useRef, useState } from "react";
import { Globe, Languages, Lock, LockOpen, RotateCcw } from "lucide-react";
import { ipc } from "../lib/ipc";
import { hostOf } from "../lib/url";
import { LANGUAGES, translatePage, type Item } from "../lib/translate";
import { parseProfiles, withProfile, type SiteProfile } from "../lib/siteProfiles";
import { selectActive, useStore } from "../store/useStore";

/** Per-site preferences in the side panel: zoom, tracker blocking, muting. Applied every time the site loads. */
function TranslateSection({ tabId }: { tabId: string }) {
  const [lang, setLang] = useState(() => { try { return localStorage.getItem("qp.translateTo") || "English"; } catch { return "English"; } });
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const signal = useRef({ aborted: false });
  useEffect(() => () => { signal.current.aborted = true; }, []);
  useEffect(() => { setDone(false); setMsg(null); setProgress(null); }, [tabId]);

  const go = async () => {
    try { localStorage.setItem("qp.translateTo", lang); } catch { /* storage unavailable */ }
    signal.current = { aborted: false };
    setRunning(true); setMsg(null); setDone(false);
    try {
      const r = await translatePage(lang, {
        collect: async () => {
          const c = await ipc.agentExec<{ items: Item[]; lang: string }>(tabId, "collect_text");
          return c;
        },
        apply: async (pairs) => void (await ipc.agentExec(tabId, "apply_text", { pairs })),
        chat: (system, messages) => ipc.aiChat(system, messages, true),
        progress: (d, t) => setProgress([d, t]),
      }, signal.current);
      if (signal.current.aborted) setMsg("Stopped. Anything already translated stays; use “Show original” to undo it.");
      else if (r.total === 0) setMsg("I couldn't find any text to translate on this page.");
      else {
        setDone(r.translated > 0);
        setMsg(r.failedBatches ? `Translated ${r.translated} of ${r.total} pieces of text. ${r.failedBatches} section${r.failedBatches === 1 ? "" : "s"} couldn't be translated and stay in the original language.` : `Translated the page to ${lang}.`);
      }
    } catch (e) {
      setMsg(String(e));
    } finally {
      setRunning(false);
    }
  };
  const restore = async () => {
    signal.current.aborted = true;
    try { await ipc.agentExec(tabId, "restore_text"); setDone(false); setProgress(null); setMsg("Back to the original text."); } catch (e) { setMsg(String(e)); }
  };

  return (
    <section className="space-y-2 rounded-2xl border border-border p-3">
      <p className="flex items-center gap-2 font-medium"><Languages size={14} className="text-primary" /> Translate this page</p>
      <div className="flex gap-2">
        <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Translate to" className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-1.5" disabled={running}>
          {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
        </select>
        {running
          ? <button type="button" onClick={() => { signal.current.aborted = true; }} className="rounded-lg border border-border px-3 py-1.5 hover:bg-surface-secondary">Stop</button>
          : <button type="button" onClick={() => void go()} className="rounded-lg bg-primary px-3 py-1.5 font-medium text-white dark:text-bg">Translate</button>}
      </div>
      {progress && running && (
        <div role="progressbar" aria-valuemin={0} aria-valuemax={progress[1]} aria-valuenow={progress[0]} className="h-1.5 overflow-hidden rounded-full bg-surface-secondary">
          <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${(progress[0] / Math.max(1, progress[1])) * 100}%` }} />
        </div>
      )}
      {done && !running && <button type="button" onClick={() => void restore()} className="text-[12px] text-primary underline-offset-2 hover:underline">Show original</button>}
      {msg && <p role="status" className="text-[12px] text-text-secondary">{msg}</p>}
      <p className="text-[11px] text-text-secondary">Uses your AI provider (shown in the Assistant). The page's text is sent to it. Long pages translate the first part; reload to start over.</p>
    </section>
  );
}

export function SitePanel() {
  const tab = useStore(selectActive);
  const host = hostOf(tab.url);
  const [raw, setRaw] = useState<string | undefined>();
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => void ipc.settingsGet().then((s) => setRaw(s.site_profiles)), [host]);

  if (!host) {
    return <p className="px-6 py-10 text-center text-text-secondary">Open a website to set its zoom, tracker blocking and sound.</p>;
  }
  const profile: SiteProfile = parseProfiles(raw)[host] ?? {};
  const secure = tab.url.startsWith("https://");

  const update = async (next: SiteProfile | null, apply?: () => void) => {
    const json = withProfile(raw, host, next);
    setRaw(json);
    try {
      await ipc.settingsSet("site_profiles", json);
      apply?.();
    } catch (e) {
      setMsg(String(e));
    }
  };
  const zoomPct = Math.round((profile.zoom ?? 1) * 100);
  const trackerValue = profile.trackers === undefined ? "default" : profile.trackers ? "on" : "off";

  return (
    <div className="h-full space-y-4 overflow-y-auto p-4">
      <header className="flex items-center gap-3 rounded-2xl border border-border bg-surface-secondary/50 p-3">
        <div className="grid size-9 place-items-center rounded-xl bg-surface text-primary"><Globe size={17} /></div>
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold">{host}</p>
          <p className={`flex items-center gap-1 text-[11.5px] ${secure ? "text-group-personal" : "text-red-500"}`}>{secure ? <Lock size={11} /> : <LockOpen size={11} />}{secure ? "Secure connection" : "Not secure (HTTP)"}</p>
        </div>
      </header>
      <TranslateSection tabId={tab.id} />
      <p className="text-[12px] text-text-secondary">These choices are saved for {host} and applied each time it loads.</p>

      <section className="space-y-1.5">
        <div className="flex items-center justify-between"><label htmlFor="qp-zoom" className="font-medium">Zoom</label><span className="tabular-nums text-text-secondary">{zoomPct}%</span></div>
        <input id="qp-zoom" type="range" min={50} max={250} step={5} value={zoomPct} className="w-full accent-primary" onChange={(e) => { const z = Number(e.target.value) / 100; void update({ ...profile, zoom: z }, () => void ipc.tabZoom(tab.id, `set:${z}`)); }} />
      </section>

      <section className="space-y-1.5">
        <label htmlFor="qp-trackers" className="font-medium">Tracker blocking</label>
        <select id="qp-trackers" value={trackerValue} className="w-full rounded-lg border border-border bg-surface px-2 py-1.5" onChange={(e) => { const v = e.target.value; void update({ ...profile, trackers: v === "default" ? undefined : v === "on" }); }}>
          <option value="default">Use my default</option>
          <option value="on">Always block on this site</option>
          <option value="off">Don't block on this site</option>
        </select>
        <p className="text-[11.5px] text-text-secondary">Takes effect the next time the page loads. Turn blocking off only for sites that break.</p>
      </section>

      <section className="flex items-center justify-between">
        <div><p className="font-medium">Mute this site</p><p className="text-[11.5px] text-text-secondary">Silences it whenever it loads.</p></div>
        <input type="checkbox" role="switch" className="size-4 accent-primary" checked={profile.muted === true} aria-label="Mute this site" onChange={(e) => { const m = e.target.checked; void update({ ...profile, muted: m || undefined }, () => ipc.tabSetMuted(tab.id, m)); }} />
      </section>

      <button type="button" onClick={() => void update(null, () => void ipc.tabZoom(tab.id, "reset"))} disabled={Object.keys(profile).length === 0} className="flex w-full items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 hover:bg-surface-secondary disabled:opacity-40"><RotateCcw size={14} /> Reset this site</button>
      {msg && <p role="alert" className="text-[12px] text-red-500">{msg}</p>}
    </div>
  );
}
