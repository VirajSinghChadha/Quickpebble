import { useState } from "react";
import { Cloud, Droplets, Newspaper, Sparkles } from "lucide-react";
import { NEWS_SOURCES, WHATS_NEW, weatherInfo } from "../../lib/home";
import { useStore } from "../../store/useStore";
import { CityPicker } from "./HomeOptions";
import { WeatherIconView } from "./WeatherCard";

/** Pictures of the two widgets. They show example data only; nothing here touches the network. */
function WeatherPreview() {
  const info = weatherInfo(2, true);
  return (
    <div className="pointer-events-none select-none rounded-2xl border border-border bg-surface p-3 shadow-pebble" role="img" aria-label="Example of the weather card: 24 degrees, partly cloudy">
      <p className="text-[11px] text-text-secondary">Dubai, UAE</p>
      <div className="mt-1.5 flex items-center gap-3">
        <WeatherIconView icon={info.icon} size={38} />
        <div><p className="text-[28px] font-semibold leading-none">24°C</p><p className="mt-1 text-[12px]">{info.label}</p></div>
        <div className="ml-auto text-right text-[10.5px] text-text-secondary"><p>H 27° · L 19°</p><p className="flex items-center justify-end gap-1"><Droplets size={10} />10% rain</p></div>
      </div>
    </div>
  );
}

function NewsPreview() {
  const lines = ["Leaders meet to discuss new climate agreement", "Scientists report breakthrough in battery storage", "Markets steady as the week begins"];
  return (
    <div className="pointer-events-none select-none rounded-2xl border border-border bg-surface p-3 shadow-pebble" role="img" aria-label="Example of the news card with three headlines">
      <p className="flex items-center gap-1.5 text-[11px] text-text-secondary"><Newspaper size={11} />BBC News: top stories</p>
      <ul className="mt-1.5 space-y-1.5">{lines.map((l) => <li key={l} className="text-[12px] leading-snug"><span className="line-clamp-1">{l}</span><span className="block h-1.5 w-1/3 rounded bg-surface-secondary" /></li>)}</ul>
    </div>
  );
}

/**
 * Shown once per release that adds something to the home page (new installs and updates). Both widgets start OFF:
 * the person sees what they look like and what each one sends, then chooses.
 */
export function HomeOnboarding() {
  const home = useStore((s) => s.home);
  const [weather, setWeather] = useState(false);
  const [news, setNews] = useState(false);
  const [source, setSource] = useState(home.newsSource);
  if (!home.loaded || home.onboarded === WHATS_NEW) return null;

  const finish = (apply: boolean) =>
    void useStore.getState().setHome(apply ? { weather: weather && !!useStore.getState().home.place, news, newsSource: source, onboarded: WHATS_NEW } : { onboarded: WHATS_NEW });

  return (
    <div className="absolute inset-0 z-30 grid place-items-center overflow-y-auto bg-bg/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="New on your home page">
      <div className="my-auto w-full max-w-3xl rounded-3xl border border-border bg-surface p-6 shadow-float">
        <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-primary"><Sparkles size={14} /> New on your home page</p>
        <h2 className="mt-1 text-[22px] font-semibold tracking-tight">Want today's weather and top news?</h2>
        <p className="mt-1 text-[13px] text-text-secondary">Two optional cards for your home page. They are <b>off</b> unless you turn them on here, and you can change your mind any time in Settings or with the wrench icon at the bottom left of this page.</p>

        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <section aria-label="Weather">
            <WeatherPreview />
            <label className="mt-3 flex cursor-pointer items-start gap-2.5"><input type="checkbox" role="switch" className="mt-0.5 size-4 accent-primary" checked={weather} onChange={(e) => setWeather(e.target.checked)} /><span><span className="flex items-center gap-1.5 text-[13.5px] font-medium"><Cloud size={14} /> Show today's weather</span><span className="mt-0.5 block text-[12px] text-text-secondary">Temperature, conditions, high and low, chance of rain. <b>What is sent:</b> only the coordinates of the city you pick, to Open-Meteo, a free weather service. No account, and no access to your device's location.</span></span></label>
            {weather && <div className="mt-2 pl-6"><CityPicker /></div>}
          </section>
          <section aria-label="News">
            <NewsPreview />
            <label className="mt-3 flex cursor-pointer items-start gap-2.5"><input type="checkbox" role="switch" className="mt-0.5 size-4 accent-primary" checked={news} onChange={(e) => setNews(e.target.checked)} /><span><span className="flex items-center gap-1.5 text-[13.5px] font-medium"><Newspaper size={14} /> Show important news</span><span className="mt-0.5 block text-[12px] text-text-secondary">A few top headlines. <b>What is sent:</b> a normal request to the one public news feed you choose, nothing about you. Headlines open in your tab.</span></span></label>
            {news && (
              <label className="mt-2 flex items-center justify-between gap-3 pl-6 text-[12.5px]">News from
                <select className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-1" value={source} onChange={(e) => setSource(e.target.value)} aria-label="News source">
                  {NEWS_SOURCES.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
                </select>
              </label>
            )}
          </section>
        </div>

        {weather && !home.place && <p className="mt-4 text-[12px] text-group-school">Search for your city above to show the weather. Without one, the weather card stays off.</p>}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => finish(false)} className="rounded-xl border border-border px-4 py-2 text-[13px] hover:bg-surface-secondary">No thanks</button>
          <button type="button" autoFocus onClick={() => finish(true)} disabled={!weather && !news} className="rounded-xl bg-primary px-4 py-2 text-[13px] font-medium text-white disabled:opacity-40 dark:text-bg">Turn on what I chose</button>
        </div>
      </div>
    </div>
  );
}
