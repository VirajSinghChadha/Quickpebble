import { useEffect, useState } from "react";
import { Globe, Lock, LockOpen, RotateCcw } from "lucide-react";
import { ipc } from "../lib/ipc";
import { hostOf } from "../lib/url";
import { parseProfiles, withProfile, type SiteProfile } from "../lib/siteProfiles";
import { selectActive, useStore } from "../store/useStore";

/** Per-site preferences in the side panel: zoom, tracker blocking, muting. Applied every time the site loads. */
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
