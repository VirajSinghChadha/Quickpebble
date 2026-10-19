import { useEffect } from "react";
import { CalendarDays, CheckCircle2, CloudSun, Lightbulb, Newspaper } from "lucide-react";
import { onMorning, type MorningBrief as Brief } from "../lib/ipc";
import { weatherInfo } from "../lib/home";
import { countryName, greeting } from "../lib/morning";
import { useHidePage } from "../hooks/useHidePage";
import { useMorning } from "../store/useMorning";
import { useStore } from "../store/useStore";
import { Modal, ModalHeader } from "./Modal";

const Section = ({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) => (
  <section className="space-y-1.5">
    <h3 className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-text-secondary">{icon}{title}</h3>
    {children}
  </section>
);

function Body({ b }: { b: Brief }) {
  const w = b.weather;
  const info = w ? weatherInfo(w.code, w.is_day) : null;
  return (
    <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5 text-[13px]">
      {w && info && (
        <Section icon={<CloudSun size={14} />} title={`Weather${w.place ? ` · ${w.place}` : ""}`}>
          <p>{info.label}, {Math.round(w.temp)}°{w.unit} now (feels like {Math.round(w.feels)}°). Today: high {Math.round(w.high)}°, low {Math.round(w.low)}°{w.rain_chance != null ? `, ${w.rain_chance}% chance of rain` : ""}.</p>
        </Section>
      )}
      {b.calendar && (
        <Section icon={<CalendarDays size={14} />} title="Today on your calendar">
          {b.calendar.length === 0 ? <p className="text-text-secondary">Nothing scheduled today.</p> : (
            <ul className="space-y-1">{b.calendar.map((e, i) => <li key={i} className="flex gap-3 rounded-lg bg-surface-secondary px-3 py-1.5"><span className="w-12 shrink-0 font-medium tabular-nums">{e.time}</span><span className="truncate">{e.title}</span></li>)}</ul>
          )}
        </Section>
      )}
      {b.news.map((n) => (
        <Section key={n.country} icon={<Newspaper size={14} />} title={`News · ${countryName(n.country)}`}>
          <ul className="space-y-1">
            {n.items.map((h) => (
              <li key={h.url}><button type="button" onClick={() => { useStore.getState().newTab(h.url); useMorning.getState().close(); }} className="w-full truncate rounded-lg px-3 py-1.5 text-left hover:bg-surface-secondary" title={h.title}>{h.title}</button></li>
            ))}
          </ul>
        </Section>
      ))}
      {b.checkup.length > 0 && (
        <Section icon={<Lightbulb size={14} />} title="Mac check-up">
          <ul className="space-y-1">
            {b.checkup.map((c) => (
              <li key={c.label} className="flex items-start gap-2"><CheckCircle2 size={14} className={`mt-0.5 shrink-0 ${c.status === "ok" ? "text-group-personal" : "text-group-school"}`} /><span><b>{c.label}:</b> {c.text}</span></li>
            ))}
          </ul>
        </Section>
      )}
      {b.notes.length > 0 && <p className="text-[12px] text-text-secondary">{b.notes.join(" ")}</p>}
      <p className="text-[11.5px] text-text-secondary">Turn this off or choose your countries in Settings → Morning brief.</p>
    </div>
  );
}

/** Shows the daily brief when the app sends one, or when Settings asks to preview it. */
export function MorningBrief() {
  const brief = useMorning((s) => s.brief);
  useEffect(() => {
    let off: (() => void) | undefined;
    void onMorning((b) => useMorning.getState().show(b)).then((u) => { off = u; });
    return () => off?.();
  }, []);
  return brief ? <Shown b={brief} /> : null;
}

function Shown({ b }: { b: Brief }) {
  useHidePage();
  const close = () => useMorning.getState().close();
  return (
    <Modal onClose={close} label="Morning brief" width="max-w-lg">
      <ModalHeader title={`${greeting(new Date().getHours())}. ${new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}`} onClose={close} />
      <Body b={b} />
    </Modal>
  );
}
