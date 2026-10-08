import { useState } from "react";
import { Search } from "lucide-react";
import { ipc, type Place } from "../../lib/ipc";
import { NEWS_SOURCES, placeLabel } from "../../lib/home";
import { useStore } from "../../store/useStore";

const sel = "rounded-lg border border-border bg-surface px-2 py-1 text-[12.5px]";

/** City picker: search by name, choose from the results. Used by the first-run card, the wrench popover and Settings. */
export function CityPicker({ onPick }: { onPick?: (p: Place) => void }) {
  const place = useStore((s) => s.home.place);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Place[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const search = async () => {
    setBusy(true);
    setErr(null);
    try { setResults(await ipc.weatherSearch(q)); } catch (e) { setErr(String(e)); setResults(null); } finally { setBusy(false); }
  };
  const pick = (p: Place) => { void useStore.getState().setHome({ place: p }); setResults(null); setQ(""); onPick?.(p); };
  return (
    <div className="space-y-1.5">
      <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); void search(); }}>
        <label className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-border bg-surface px-2 focus-within:border-primary">
          <Search size={12} className="text-text-secondary" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={place ? placeLabel(place) : "Search for your city"} aria-label="City" className="min-w-0 flex-1 bg-transparent py-1.5 text-[12.5px] outline-none placeholder:text-text-secondary" />
        </label>
        <button type="submit" disabled={busy || q.trim().length < 2} className="rounded-lg border border-border px-2.5 text-[12px] hover:bg-surface-secondary disabled:opacity-40">{busy ? "…" : "Find"}</button>
      </form>
      {err && <p role="alert" className="text-[11.5px] text-red-500">{err}</p>}
      {results && (results.length === 0 ? <p className="text-[11.5px] text-text-secondary">No matching city. Try another spelling.</p> : (
        <ul className="overflow-hidden rounded-lg border border-border" aria-label="Matching cities">
          {results.map((p) => <li key={`${p.lat},${p.lon}`}><button type="button" onClick={() => pick(p)} className="block w-full px-2.5 py-1.5 text-left text-[12.5px] hover:bg-surface-secondary">{placeLabel(p)}</button></li>)}
        </ul>
      ))}
    </div>
  );
}

function Switch({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-1.5">
      <span><span className="block text-[13px]">{label}</span>{hint && <span className="block text-[11.5px] text-text-secondary">{hint}</span>}</span>
      <input type="checkbox" role="switch" className="mt-0.5 size-4 shrink-0 accent-primary" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
    </label>
  );
}

/** Every home page option in one place. Shared by the wrench popover and the Settings panel. */
export function HomeOptions() {
  const home = useStore((s) => s.home);
  const set = useStore.getState().setHome;
  return (
    <div className="divide-y divide-border">
      <div className="pb-2">
        <Switch label="Today's weather" hint="Shows the weather for the city you pick. Only that city's location is sent, to Open-Meteo." checked={home.weather} onChange={(v) => void set({ weather: v })} />
        {home.weather && (
          <div className="space-y-2 pb-1 pl-1">
            <CityPicker />
            <label className="flex items-center justify-between text-[12.5px]">Temperature
              <select className={sel} value={home.unit} onChange={(e) => void set({ unit: e.target.value as "c" | "f" })} aria-label="Temperature unit"><option value="c">Celsius (°C)</option><option value="f">Fahrenheit (°F)</option></select>
            </label>
          </div>
        )}
      </div>
      <div className="py-2">
        <Switch label="Important news" hint="A few top headlines from one public news feed you choose. Your computer asks that feed directly; no account needed." checked={home.news} onChange={(v) => void set({ news: v })} />
        {home.news && (
          <label className="flex items-center justify-between gap-3 pl-1 text-[12.5px]">News from
            <select className={`${sel} min-w-0 flex-1`} value={home.newsSource} onChange={(e) => void set({ newsSource: e.target.value })} aria-label="News source">
              {NEWS_SOURCES.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="pt-2">
        <Switch label="Shortcut tiles" checked={home.tiles} onChange={(v) => void set({ tiles: v })} />
        <Switch label="Feature cards" hint="Ask Pebble, workspaces and Privacy center." checked={home.cards} onChange={(v) => void set({ cards: v })} />
      </div>
    </div>
  );
}
