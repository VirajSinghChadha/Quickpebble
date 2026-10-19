import { describe, expect, it } from "vitest";
import { buildBrief, checkup, newsUrl, parseCalendar, parseCountries, shouldShow, todayKey } from "./morning.mjs";

const db = (o) => ({ getSetting: (k) => o[k] });

describe("morning brief", () => {
  it("shows once per day, only when on, and not in the small hours", () => {
    const at = (h) => new Date(2026, 9, 19, h, 0);
    expect(shouldShow({ enabled: true, last: "", now: at(8) })).toBe(true);
    expect(shouldShow({ enabled: true, last: todayKey(at(8)), now: at(9) })).toBe(false);
    expect(shouldShow({ enabled: true, last: "2026-10-18", now: at(8) })).toBe(true);
    expect(shouldShow({ enabled: false, last: "", now: at(8) })).toBe(false);
    expect(shouldShow({ enabled: true, last: "", now: at(2) })).toBe(false);
  });
  it("keeps only valid country codes, three at most", () => {
    expect(parseCountries('["AE","gb","AE","US","NZ","IN"]')).toEqual(["AE", "US", "NZ"]);
    expect(parseCountries("broken")).toEqual([]);
    expect(newsUrl("AE")).toBe("https://news.google.com/rss?hl=en&gl=AE&ceid=AE:en");
    expect(newsUrl("A&B")).toBeNull();
  });
  it("turns Mac numbers into plain advice", () => {
    expect(checkup({ freeGb: 8, totalGb: 250, uptimeDays: 12, freeMemPct: 5 }).map((c) => c.status)).toEqual(["tip", "tip", "tip"]);
    expect(checkup({ freeGb: 120, totalGb: 250, uptimeDays: 0.2, freeMemPct: 40 }).map((c) => c.status)).toEqual(["ok", "ok", "ok"]);
    expect(checkup({ freeGb: NaN, totalGb: NaN, uptimeDays: NaN, freeMemPct: NaN })).toEqual([]);
  });
  it("reads calendar lines safely and in time order", () => {
    expect(parseCalendar("14:30|Dentist\n09:00|Maths\nnonsense\n|x\n")).toEqual([{ time: "09:00", title: "Maths" }, { time: "14:30", title: "Dentist" }]);
  });
  it("builds a brief even when parts fail", async () => {
    const b = await buildBrief(db({ morning_countries: '["AE","GB"]', morning_calendar: "1", home_weather_place: JSON.stringify({ name: "Dubai", lat: 25, lon: 55 }) }), {
      weather: async () => { throw new Error("offline"); },
      news: async (url) => (url.includes("gl=AE") ? [{ title: "A", url: "https://a.example" }] : []),
      calendar: async () => null,
    });
    expect(b.weather).toBeNull();
    expect(b.news).toEqual([{ country: "AE", items: [{ title: "A", url: "https://a.example" }] }]);
    expect(b.calendar).toBeNull();
    expect(b.notes.join(" ")).toMatch(/Weather could not be loaded/);
    expect(b.notes.join(" ")).toMatch(/Calendar could not be read/);
  });
});
