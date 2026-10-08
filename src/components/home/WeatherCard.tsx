import { useCallback, useEffect, useState } from "react";
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudSnow, CloudSun, Droplets, MapPin, Moon, RefreshCw, Sun, Wind } from "lucide-react";
import { ipc, type Weather } from "../../lib/ipc";
import { cacheGet, cacheSet, placeLabel, weatherInfo, type WeatherIcon } from "../../lib/home";
import { useStore } from "../../store/useStore";

const ICONS: Record<WeatherIcon, typeof Sun> = { sun: Sun, moon: Moon, "cloud-sun": CloudSun, "cloud-moon": CloudMoon, cloud: Cloud, fog: CloudFog, drizzle: CloudDrizzle, rain: CloudRain, snow: CloudSnow, storm: CloudLightning };
const TTL = 20 * 60 * 1000;

export function WeatherIconView({ icon, size = 44 }: { icon: WeatherIcon; size?: number }) {
  const I = ICONS[icon];
  return <I size={size} strokeWidth={1.5} className={icon === "sun" ? "text-group-school" : "text-primary"} aria-hidden />;
}

/** Today's weather for the city the person chose. Only that city's coordinates leave the computer. */
export function WeatherCard() {
  const { place, unit } = useStore((s) => s.home);
  const [w, setW] = useState<Weather | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (force = false) => {
      if (!place) return;
      const key = `weather.${place.lat.toFixed(2)}.${place.lon.toFixed(2)}.${unit}`;
      const hit = force ? null : cacheGet<Weather>(key, TTL);
      if (hit) return setW(hit), setErr(null);
      setLoading(true);
      try {
        const fresh = await ipc.weatherFetch(place.lat, place.lon, unit === "f");
        cacheSet(key, fresh);
        setW(fresh);
        setErr(null);
      } catch (e) {
        setErr(String(e));
      } finally {
        setLoading(false);
      }
    },
    [place, unit],
  );
  useEffect(() => void load(), [load]);

  const card = "home-widget rounded-2xl border border-border bg-surface p-4 text-left";
  if (!place) {
    return (
      <section className={card} aria-label="Weather">
        <p className="font-medium">Weather</p>
        <p className="mt-1 text-[12px] text-text-secondary">Choose your city with the wrench icon at the bottom left.</p>
      </section>
    );
  }
  const info = w ? weatherInfo(w.code, w.is_day) : null;
  const deg = unit === "f" ? "°F" : "°C";
  return (
    <section className={card} aria-label={`Weather in ${place.name}`}>
      <div className="flex items-center justify-between text-[12px] text-text-secondary">
        <span className="flex min-w-0 items-center gap-1.5"><MapPin size={12} /><span className="truncate">{placeLabel(place)}</span></span>
        <button type="button" aria-label="Refresh weather" title="Refresh" onClick={() => void load(true)} className="grid size-6 place-items-center rounded-md hover:bg-surface-secondary"><RefreshCw size={12} className={loading ? "animate-spin" : ""} /></button>
      </div>
      {w && info ? (
        <div className="mt-2 flex items-center gap-4">
          <WeatherIconView icon={info.icon} />
          <div className="min-w-0">
            <p className="text-[34px] font-semibold leading-none tracking-tight">{Math.round(w.temp)}{deg}</p>
            <p className="mt-1 text-[13px]">{info.label}</p>
          </div>
          <dl className="ml-auto grid gap-0.5 text-right text-[11.5px] text-text-secondary">
            <div>H {Math.round(w.high)}° · L {Math.round(w.low)}°</div>
            <div>Feels like {Math.round(w.feels)}°</div>
            {w.rain_chance !== null && <div className="flex items-center justify-end gap-1"><Droplets size={11} />{w.rain_chance}% rain</div>}
            <div className="flex items-center justify-end gap-1"><Wind size={11} />{Math.round(w.wind)} {unit === "f" ? "mph" : "km/h"}</div>
          </dl>
        </div>
      ) : err ? (
        <p role="alert" className="mt-3 text-[12px] text-red-500">{err} <button type="button" onClick={() => void load(true)} className="underline">Try again</button></p>
      ) : (
        <div className="mt-3 space-y-2" aria-busy="true"><div className="h-8 w-24 animate-pulse rounded-lg bg-surface-secondary" /><div className="h-3 w-40 animate-pulse rounded bg-surface-secondary" /></div>
      )}
    </section>
  );
}
