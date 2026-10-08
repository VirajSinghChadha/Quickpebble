import { beforeEach, describe, expect, it } from "vitest";
import { cacheGet, cacheSet, defaultHome, homeToSettings, parseHome, placeLabel, weatherInfo } from "./home";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  } as Storage;
});

describe("home settings", () => {
  it("everything optional is off until chosen, and nothing counts as asked", () => {
    const h = parseHome({});
    expect(h).toMatchObject({ weather: false, news: false, tiles: true, cards: true, onboarded: "", unit: "c", place: null });
    expect(defaultHome.weather).toBe(false);
  });

  it("round-trips what the person chose", () => {
    const place = { name: "Dubai", region: "Dubai", country: "UAE", lat: 25.07, lon: 55.3 };
    const saved = homeToSettings({ weather: true, place, unit: "f", news: true, newsSource: "npr", tiles: false, onboarded: "home-v1" });
    const h = parseHome(saved);
    expect(h).toMatchObject({ weather: true, unit: "f", news: true, newsSource: "npr", tiles: false, cards: true, onboarded: "home-v1" });
    expect(h.place?.name).toBe("Dubai");
    expect(placeLabel(place)).toBe("Dubai, UAE");
    expect(homeToSettings({ place: null }).home_weather_place).toBe("");
  });

  it("ignores junk: bad places, unknown sources", () => {
    expect(parseHome({ home_weather_place: '{"name":"X","lat":999,"lon":0}' }).place).toBeNull();
    expect(parseHome({ home_weather_place: "{nope" }).place).toBeNull();
    expect(parseHome({ home_news_source: "evil" }).newsSource).toBe("bbc");
  });
});

describe("weather codes", () => {
  it("maps conditions and day or night", () => {
    expect(weatherInfo(0, true)).toEqual({ label: "Clear", icon: "sun" });
    expect(weatherInfo(0, false).icon).toBe("moon");
    expect(weatherInfo(2, false).icon).toBe("cloud-moon");
    expect(weatherInfo(63, true).icon).toBe("rain");
    expect(weatherInfo(73, true).icon).toBe("snow");
    expect(weatherInfo(95, true).icon).toBe("storm");
    expect(weatherInfo(999, true).icon).toBe("storm");
  });
});

describe("cache", () => {
  it("expires entries", () => {
    cacheSet("k", { a: 1 }, 1000);
    expect(cacheGet("k", 5000, 2000)).toEqual({ a: 1 });
    expect(cacheGet("k", 5000, 9000)).toBeNull();
    expect(cacheGet("missing", 5000)).toBeNull();
  });
});
