/** Home page options. Weather and news are OFF until the person turns them on. */

/** Bump this when the home page gains something new to ask about: everyone is asked once more after updating. */
export const WHATS_NEW = "home-v1";

export const NEWS_SOURCES = [
  { id: "bbc", label: "BBC News: top stories" },
  { id: "bbc-world", label: "BBC News: world" },
  { id: "npr", label: "NPR News" },
  { id: "guardian", label: "The Guardian: world" },
  { id: "aljazeera", label: "Al Jazeera" },
  { id: "hn", label: "Hacker News (tech)" },
] as const;

export interface Place {
  name: string;
  region: string;
  country: string;
  lat: number;
  lon: number;
}

export interface HomeSettings {
  weather: boolean;
  place: Place | null;
  unit: "c" | "f";
  news: boolean;
  newsSource: string;
  tiles: boolean;
  cards: boolean;
  /** The WHATS_NEW id the person last answered; "" = never asked. */
  onboarded: string;
  loaded: boolean;
}

export const defaultHome: HomeSettings = { weather: false, place: null, unit: "c", news: false, newsSource: "bbc", tiles: true, cards: true, onboarded: "", loaded: false };

const isPlace = (p: unknown): p is Place => {
  const o = p as Place;
  return !!o && typeof o.name === "string" && Number.isFinite(o.lat) && Number.isFinite(o.lon) && Math.abs(o.lat) <= 90 && Math.abs(o.lon) <= 180;
};

export function parseHome(s: Record<string, string>): HomeSettings {
  let place: Place | null = null;
  try {
    const p = JSON.parse(s.home_weather_place || "null");
    if (isPlace(p)) place = { name: p.name, region: p.region ?? "", country: p.country ?? "", lat: p.lat, lon: p.lon };
  } catch {
    /* no saved place */
  }
  return {
    weather: s.home_weather === "on",
    place,
    unit: s.home_weather_unit === "f" ? "f" : "c",
    news: s.home_news === "on",
    newsSource: NEWS_SOURCES.some((n) => n.id === s.home_news_source) ? s.home_news_source : "bbc",
    tiles: s.home_tiles !== "off",
    cards: s.home_cards !== "off",
    onboarded: s.home_onboarded ?? "",
    loaded: true,
  };
}

/** The settings entries to save for a change. */
export function homeToSettings(patch: Partial<HomeSettings>): Record<string, string> {
  const out: Record<string, string> = {};
  if (patch.weather !== undefined) out.home_weather = patch.weather ? "on" : "off";
  if ("place" in patch) out.home_weather_place = patch.place ? JSON.stringify(patch.place) : "";
  if (patch.unit !== undefined) out.home_weather_unit = patch.unit;
  if (patch.news !== undefined) out.home_news = patch.news ? "on" : "off";
  if (patch.newsSource !== undefined) out.home_news_source = patch.newsSource;
  if (patch.tiles !== undefined) out.home_tiles = patch.tiles ? "on" : "off";
  if (patch.cards !== undefined) out.home_cards = patch.cards ? "on" : "off";
  if (patch.onboarded !== undefined) out.home_onboarded = patch.onboarded;
  return out;
}

export const placeLabel = (p: Place): string => [p.name, p.region && p.region !== p.name ? p.region : "", p.country].filter(Boolean).join(", ");

export type WeatherIcon = "sun" | "moon" | "cloud-sun" | "cloud-moon" | "cloud" | "fog" | "drizzle" | "rain" | "snow" | "storm";

/** WMO weather codes as used by Open-Meteo. */
export function weatherInfo(code: number, isDay: boolean): { label: string; icon: WeatherIcon } {
  if (code === 0) return { label: "Clear", icon: isDay ? "sun" : "moon" };
  if (code === 1) return { label: "Mostly clear", icon: isDay ? "sun" : "moon" };
  if (code === 2) return { label: "Partly cloudy", icon: isDay ? "cloud-sun" : "cloud-moon" };
  if (code === 3) return { label: "Overcast", icon: "cloud" };
  if (code === 45 || code === 48) return { label: "Foggy", icon: "fog" };
  if (code >= 51 && code <= 57) return { label: "Drizzle", icon: "drizzle" };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { label: code >= 80 ? "Rain showers" : "Rain", icon: "rain" };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { label: "Snow", icon: "snow" };
  if (code >= 95) return { label: "Thunderstorm", icon: "storm" };
  return { label: "Cloudy", icon: "cloud" };
}

// ---- tiny cache so reopening a tab doesn't hit the network every time ---------------------------------

export function cacheGet<T>(key: string, ttlMs: number, now = Date.now()): T | null {
  try {
    const raw = JSON.parse(localStorage.getItem(`qp.cache.${key}`) ?? "null") as { at: number; v: T } | null;
    return raw && now - raw.at < ttlMs ? raw.v : null;
  } catch {
    return null;
  }
}

export function cacheSet<T>(key: string, v: T, now = Date.now()): void {
  try {
    localStorage.setItem(`qp.cache.${key}`, JSON.stringify({ at: now, v }));
  } catch {
    /* storage unavailable */
  }
}
