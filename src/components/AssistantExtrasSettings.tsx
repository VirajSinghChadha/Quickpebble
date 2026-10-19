import { useEffect, useState, type ReactNode } from "react";
import { ipc } from "../lib/ipc";
import { COUNTRIES, countryName, parseCountries } from "../lib/morning";
import { parseSites, removeSite } from "../lib/siteAllow";
import { useMorning } from "../store/useMorning";

const Row = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
  <div className="flex items-center justify-between gap-4 py-2.5">
    <div><p className="font-medium">{label}</p>{hint && <p className="text-[12px] text-text-secondary">{hint}</p>}</div>
    {children}
  </div>
);
const selectCls = "rounded-lg border border-border bg-surface px-2 py-1.5";
const Switch = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) => (
  <input type="checkbox" role="switch" className="size-4 accent-primary" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
);

/** Settings: the daily morning brief, websites the assistant may work on without asking, and Education Perfect notes. */
export function AssistantExtrasSettings() {
  const [on, setOn] = useState(true);
  const [calendar, setCalendar] = useState(false);
  const [login, setLogin] = useState(false);
  const [countries, setCountries] = useState<string[]>([]);
  const [sites, setSites] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const save = (k: string, v: string) => ipc.settingsSet(k, v).catch((e) => setMsg(String(e)));

  useEffect(() => {
    void ipc.settingsGet().then((s) => {
      setOn(s.morning_brief !== "0");
      setCalendar(s.morning_calendar === "1");
      setLogin(s.open_at_login === "1");
      setCountries(parseCountries(s.morning_countries));
      setSites(parseSites(s.agent_allowed_sites));
      setNotes(s.ep_notes ?? "");
    });
  }, []);

  const setCountryList = (next: string[]) => { setCountries(next); void save("morning_countries", JSON.stringify(next)); };

  return (
    <div className="py-2">
      <h3 className="pt-2 text-[12px] font-semibold uppercase tracking-wide text-text-secondary">Morning brief</h3>
      <Row label="Show a morning brief once a day" hint="The first time you open Quick Pebble each day, or your Mac wakes: weather, headlines, your calendar and a quick Mac check-up.">
        <Switch checked={on} onChange={(v) => { setOn(v); void save("morning_brief", v ? "1" : "0"); }} label="Morning brief" />
      </Row>
      <Row label="News from" hint={countries.length ? countries.map(countryName).join(", ") : "Pick up to three countries."}>
        <div className="flex items-center gap-2">
          <select className={selectCls} value="" onChange={(e) => { if (e.target.value && countries.length < 3 && !countries.includes(e.target.value)) setCountryList([...countries, e.target.value]); }} aria-label="Add a country for news" disabled={countries.length >= 3}>
            <option value="">Add a country…</option>
            {COUNTRIES.filter(([c]) => !countries.includes(c)).map(([c, n]) => <option key={c} value={c}>{n}</option>)}
          </select>
          {countries.length > 0 && <button type="button" onClick={() => setCountryList([])} className="rounded-lg border border-border px-2.5 py-1.5 text-[12px] hover:bg-surface-secondary">Clear</button>}
        </div>
      </Row>
      <Row label="Include today's calendar" hint="Reads today's events from the Calendar app. macOS asks once. Off by default.">
        <Switch checked={calendar} onChange={(v) => { setCalendar(v); void save("morning_calendar", v ? "1" : "0"); }} label="Include calendar" />
      </Row>
      <Row label="Open Quick Pebble when I log in" hint="So the brief is waiting when you start your Mac. Works in the installed app.">
        <Switch checked={login} onChange={(v) => { setLogin(v); void ipc.loginItemSet(v).then(() => setMsg(null)).catch((e) => { setLogin(!v); setMsg(String(e)); }); }} label="Open at login" />
      </Row>
      <Row label="Show it now"><button type="button" onClick={() => void ipc.morningPreview().then((b) => useMorning.getState().show(b)).catch((e) => setMsg(String(e)))} className="rounded-full border border-border px-3 py-1.5 hover:bg-surface-secondary">Preview</button></Row>

      <h3 className="pt-3 text-[12px] font-semibold uppercase tracking-wide text-text-secondary">Assistant permissions</h3>
      <div className="py-2.5">
        <p className="font-medium">Websites allowed without asking</p>
        <p className="text-[12px] text-text-secondary">When the assistant asks to do a step, choose “Allow everything on this website”. Routine steps on that site then run without asking. It still asks before anything that pays, deletes or sends.</p>
        {sites.length === 0 ? <p className="mt-1.5 text-[12px] text-text-secondary">None yet.</p> : (
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {sites.map((h) => (
              <li key={h} className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[12px]">{h}
                <button type="button" aria-label={`Stop allowing ${h}`} className="text-text-secondary hover:text-red-500" onClick={() => { const next = removeSite(sites, h); setSites(next); void save("agent_allowed_sites", JSON.stringify(next)); }}>×</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <h3 className="pt-3 text-[12px] font-semibold uppercase tracking-wide text-text-secondary">Education Perfect mode</h3>
      <div className="py-2.5">
        <p className="text-[12px] text-text-secondary">When a tab is on educationperfect.com, the assistant is told how the site works: answers must be fully simplified, a green tick means correct, and a blue tick means on the right track but not finished yet. Write how you type answers (your shortcuts) here and it will follow them.</p>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 4000))} onBlur={() => void save("ep_notes", notes)} rows={4} placeholder={"For example:\nFractions: 3/4\nPowers: x^2\nSquare root: sqrt(x)"} aria-label="Education Perfect typing notes" className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2 text-[12.5px] outline-none focus:border-primary" />
      </div>
      {msg && <p className="text-[12px] text-red-500" role="alert">{msg}</p>}
    </div>
  );
}
