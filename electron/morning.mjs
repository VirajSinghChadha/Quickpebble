// The morning brief: once a day, the first time Quick Pebble is opened (or the Mac wakes or unlocks), a card with today's
// weather, headlines for the countries you chose, what is on your calendar, and a quick check-up of the Mac.
// Everything is fetched here in the main process. Calendar is opt-in (macOS asks once). Nothing is sent anywhere except the
// news and weather requests the home page already makes.
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import * as home from "./home.mjs";

export const todayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Show once per local day, and not in the small hours (a late night is not "the morning"). */
export function shouldShow({ enabled, last, now = new Date() }) {
  return enabled === true && last !== todayKey(now) && now.getHours() >= 4;
}

const CC = /^[A-Z]{2}$/;
export function parseCountries(json) {
  try {
    const a = JSON.parse(json ?? "[]");
    return Array.isArray(a) ? [...new Set(a.filter((c) => typeof c === "string" && CC.test(c)))].slice(0, 3) : [];
  } catch { return []; }
}

/** Google News's edition for a country, in English. */
export const newsUrl = (cc) => (CC.test(cc) ? `https://news.google.com/rss?hl=en&gl=${cc}&ceid=${cc}:en` : null);

/** Mac check-up lines. Each is plain words with an ok/tip status. Pure: the numbers come in as arguments. */
export function checkup({ freeGb, totalGb, uptimeDays, freeMemPct }) {
  const out = [];
  if (Number.isFinite(freeGb) && Number.isFinite(totalGb) && totalGb > 0) {
    const pct = Math.round((freeGb / totalGb) * 100);
    out.push(freeGb < 15 || pct < 10
      ? { label: "Disk", status: "tip", text: `Only ${Math.round(freeGb)} GB free (${pct}%). Worth a clean-up soon.` }
      : { label: "Disk", status: "ok", text: `${Math.round(freeGb)} GB free (${pct}%).` });
  }
  if (Number.isFinite(uptimeDays)) {
    out.push(uptimeDays >= 7
      ? { label: "Restart", status: "tip", text: `Your Mac has been on for ${Math.floor(uptimeDays)} days. A restart can make it feel faster.` }
      : { label: "Restart", status: "ok", text: uptimeDays < 1 ? "Started recently." : `On for ${Math.floor(uptimeDays)} day${Math.floor(uptimeDays) === 1 ? "" : "s"}.` });
  }
  if (Number.isFinite(freeMemPct)) {
    out.push(freeMemPct < 8
      ? { label: "Memory", status: "tip", text: "Memory is tight. Closing a few apps or tabs would help." }
      : { label: "Memory", status: "ok", text: "Plenty of memory free." });
  }
  return out;
}

function machineNumbers() {
  let freeGb = NaN, totalGb = NaN;
  try { const s = fs.statfsSync("/"); freeGb = (s.bavail * s.bsize) / 1e9; totalGb = (s.blocks * s.bsize) / 1e9; } catch { /* unknown */ }
  return { freeGb, totalGb, uptimeDays: os.uptime() / 86400, freeMemPct: (os.freemem() / os.totalmem()) * 100 };
}

const osa = (script) => new Promise((resolve) => execFile("osascript", ["-e", script], { timeout: 20000 }, (err, out) => resolve(err ? null : String(out))));

/** Today's events from the Calendar app: "HH:MM|Title" lines, nothing else read. Null if macOS said no or it is not a Mac. */
export async function calendarToday() {
  if (process.platform !== "darwin") return null;
  const out = await osa(`set out to ""
set d0 to current date
set hours of d0 to 0
set minutes of d0 to 0
set seconds of d0 to 0
set d1 to d0 + (1 * days)
tell application "Calendar"
  repeat with c in calendars
    try
      repeat with e in (every event of c whose start date ≥ d0 and start date < d1)
        set s to start date of e
        set t to (text -5 thru -1 of ("0" & (hours of s) & ":" & text -2 thru -1 of ("0" & (minutes of s))))
        set out to out & t & "|" & (summary of e) & linefeed
      end repeat
    end try
  end repeat
end tell
return out`);
  if (out == null) return null;
  return parseCalendar(out);
}

export function parseCalendar(text) {
  return String(text).split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const i = l.indexOf("|");
    return i > 0 ? { time: l.slice(0, i).slice(0, 8), title: l.slice(i + 1).slice(0, 120) } : null;
  }).filter(Boolean).sort((a, b) => a.time.localeCompare(b.time)).slice(0, 12);
}

/** Builds the brief. Each part is independent: one failing (offline, no permission) never blocks the others. */
export async function buildBrief(db, deps = {}) {
  const get = (k) => db.getSetting(k);
  const brief = { date: new Date().toDateString(), weather: null, news: [], calendar: null, checkup: checkup(machineNumbers()), notes: [] };
  const jobs = [];
  try {
    const place = JSON.parse(get("home_weather_place") || "null");
    if (place && Number.isFinite(place.lat) && Number.isFinite(place.lon)) {
      jobs.push((deps.weather ?? home.weatherFetch)(place.lat, place.lon, get("home_weather_unit") === "f")
        .then((w) => { brief.weather = { place: String(place.name ?? ""), unit: get("home_weather_unit") === "f" ? "F" : "C", ...w }; }).catch(() => brief.notes.push("Weather could not be loaded.")));
    }
  } catch { /* no place saved */ }
  for (const cc of parseCountries(get("morning_countries"))) {
    jobs.push((deps.news ?? home.newsFromUrl)(newsUrl(cc), 4).then((items) => { if (items.length) brief.news.push({ country: cc, items }); }).catch(() => brief.notes.push(`Headlines for ${cc} could not be loaded.`)));
  }
  if (get("morning_calendar") === "1") {
    jobs.push((deps.calendar ?? calendarToday)().then((ev) => { brief.calendar = ev; if (ev == null) brief.notes.push("Calendar could not be read. Allow Quick Pebble under System Settings → Privacy & Security → Automation → Calendar."); }).catch(() => {}));
  }
  await Promise.all(jobs);
  brief.news.sort((a, b) => parseCountries(get("morning_countries")).indexOf(a.country) - parseCountries(get("morning_countries")).indexOf(b.country));
  return brief;
}
