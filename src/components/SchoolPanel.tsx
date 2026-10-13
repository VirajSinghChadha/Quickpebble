import { useEffect, useState, type ReactNode } from "react";
import { BookOpenCheck, CalendarPlus, ClipboardList, FileCheck2, GraduationCap, Presentation, Volume2 } from "lucide-react";
import { ipc, type PageSnapshot } from "../lib/ipc";
import {
  ASSIGNMENTS_PROMPT, assignmentsNote, buildIcs, checkSubmission, dueThisWeek, EXPLAIN_PROMPT, NOTES_PROMPT, parseAssignments, parseQuestion, parseRules, parseStudyPack,
  parseTimetable, QUESTION_PROMPT, reminderTimes, RULES_PROMPT, speakable, STUDY_PROMPT, TIMETABLE_PROMPT, type ClassSlot, type StudyPack, type SubmitRules,
} from "../lib/study";
import { selectActive, useStore } from "../store/useStore";
import { useSchool } from "../store/useSchool";
import { Modal, ModalHeader } from "./Modal";

const btn = "rounded-lg border border-border px-3 py-1.5 hover:bg-surface-secondary disabled:opacity-40";
const primary = "rounded-lg bg-primary px-3 py-1.5 font-medium text-white disabled:opacity-40 dark:text-bg";

function Tool({ icon, title, hint, children, label }: { icon: ReactNode; title: string; hint: string; children: ReactNode; label: string }) {
  return (
    <section aria-label={label} className="rounded-2xl border border-border p-4">
      <h3 className="mb-1 flex items-center gap-2 font-semibold">{icon} {title}</h3>
      <p className="mb-3 text-[12px] text-text-secondary">{hint}</p>
      {children}
    </section>
  );
}

/** Where the AI runs, in words, for "what will be sent" notes. */
function useProvider() {
  const [p, setP] = useState("your AI provider");
  useEffect(() => { void ipc.aiStatus().then((s) => setP(s.provider === "ollama" ? "Ollama on this computer" : `${s.provider[0].toUpperCase()}${s.provider.slice(1)} (${s.model})`)).catch(() => {}); }, []);
  return p;
}

/** Shows exactly what is about to be sent and waits for "Send". */
function SendCheck({ what, provider, onSend, onCancel, busy }: { what: string; provider: string; onSend: () => void; onCancel: () => void; busy: boolean }) {
  return (
    <div role="dialog" aria-label="What will be sent" className="mt-2 space-y-2 rounded-xl border border-primary/50 p-3 text-[12px]">
      <p><b>What will be sent</b> to {provider}: {what}. Nothing else.</p>
      <div className="flex gap-2"><button type="button" disabled={busy} onClick={onSend} className={primary}>{busy ? "Working…" : "Send"}</button><button type="button" onClick={onCancel} className={btn}>Cancel</button></div>
    </div>
  );
}

function useStep() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>) => { setBusy(true); setErr(null); try { await fn(); } catch (e) { setErr(String(e)); } finally { setBusy(false); } };
  return { busy, err, run, setErr };
}
const Err = ({ err }: { err: string | null }) => (err ? <p role="alert" className="mt-2 text-[12px] text-red-500">{err}</p> : null);
const activeTab = () => selectActive(useStore.getState());
async function pageText(id: string): Promise<{ title: string; text: string; url: string }> {
  const s = await ipc.agentExec<PageSnapshot>(id, "snapshot");
  if (!s.text?.trim()) throw new Error("This page has no readable text yet. Let it finish loading.");
  return { title: s.title, text: s.text, url: s.url };
}
const wrap = (p: { title: string; url: string; text: string }) => `PAGE "${p.title}" (${p.url}):\n<<<PAGE\n${p.text}\n>>>PAGE`;

export function SchoolPanel() {
  const close = () => useStore.getState().setOverlay(null);
  return (
    <Modal onClose={close} label="School" width="max-w-3xl">
      <ModalHeader title="School and learning" onClose={close} />
      <div className="space-y-3 overflow-y-auto px-5 pb-5">
        <p className="text-[12px] text-text-secondary">Each tool works on pages you have open. Before any page text goes to the AI you see exactly what will be sent. Nothing here ever submits, sends or signs in for you.</p>
        <StudyTool />
        <TimetableTool />
        <AssignmentsTool />
        <SlidesTool />
        <SubmitTool />
        <PracticeTool />
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- study packs

function StudyTool() {
  const provider = useProvider();
  const tabs = useStore((s) => s.tabs).filter((t) => t.url && !t.suspended && !t.needsLoad);
  const { openPack, setOpenPack } = useSchool();
  const [pick, setPick] = useState<Set<string>>(() => new Set([activeTab().id].filter((id) => tabs.some((t) => t.id === id))));
  const [confirm, setConfirm] = useState(false);
  const [pack, setPack] = useState<StudyPack | null>(null);
  const [saved, setSaved] = useState<{ id: number; title: string; next: number | null }[]>([]);
  const [savedMsg, setSavedMsg] = useState("");
  const { busy, err, run } = useStep();
  useEffect(() => { void ipc.studyList().then(setSaved); }, []);
  useEffect(() => { if (openPack) void ipc.studyGet(openPack).then((r) => setPack(r.pack as StudyPack)).finally(() => setOpenPack(null)); }, [openPack, setOpenPack]);
  const chosen = tabs.filter((t) => pick.has(t.id));
  const make = () => run(async () => {
    const pages = await Promise.all(chosen.map((t) => pageText(t.id)));
    const p = parseStudyPack(await ipc.aiChat(STUDY_PROMPT, [{ role: "user", content: pages.map(wrap).join("\n\n") }], true));
    if (!p) throw new Error("The AI's answer couldn't be used. Try again, or pick fewer pages.");
    setPack(p); setConfirm(false); setSavedMsg("");
  });
  return (
    <Tool label="Study packs" icon={<BookOpenCheck size={16} className="text-primary" />} title="Study pack" hint="Pick a few tabs and get flashcards, a quiz and a one-page summary. Save it and short quizzes come back later today (about 1, 3 and 7 hours later, never at night).">
      {!pack && (<>
        <ul className="max-h-40 divide-y divide-border overflow-y-auto rounded-xl border border-border" aria-label="Tabs for the study pack">
          {tabs.length === 0 && <li className="px-3 py-2 text-[12px] text-text-secondary">Open the pages you want to study first.</li>}
          {tabs.map((t) => (
            <li key={t.id}><label className="flex cursor-pointer items-center gap-3 px-3 py-1.5 hover:bg-surface-secondary">
              <input type="checkbox" className="size-4 accent-primary" disabled={!pick.has(t.id) && pick.size >= 6} checked={pick.has(t.id)} onChange={() => setPick((p) => { const n = new Set(p); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; })} aria-label={t.title || t.url} />
              <span className="truncate">{t.title || t.url}</span>
            </label></li>
          ))}
        </ul>
        {!confirm ? <button type="button" className={`${primary} mt-2`} disabled={!pick.size || busy} onClick={() => setConfirm(true)}>Make a study pack from {pick.size} tab{pick.size === 1 ? "" : "s"}</button>
          : <SendCheck busy={busy} provider={provider} what={`the text of ${chosen.length === 1 ? `“${chosen[0].title}”` : `${chosen.length} pages (${chosen.map((t) => `“${t.title}”`).join(", ")})`}, up to 6,000 characters each`} onSend={() => void make()} onCancel={() => setConfirm(false)} />}
      </>)}
      {pack && <PackView pack={pack} onDone={() => setPack(null)} onSave={() => run(async () => { const id = await ipc.studySave(pack, reminderTimes(Date.now())); setSaved(await ipc.studyList()); setSavedMsg(id ? "Saved. Short quizzes will pop up later today." : "Saved."); })} savedMsg={savedMsg} />}
      {saved.length > 0 && !pack && (
        <details className="mt-2"><summary className="cursor-pointer text-[12.5px] font-medium">Saved packs ({saved.length})</summary>
          <ul className="mt-1 space-y-1 text-[12.5px]">{saved.map((s) => <li key={s.id} className="flex items-center gap-2"><button type="button" className="flex-1 truncate text-left hover:underline" onClick={() => void ipc.studyGet(s.id).then((r) => setPack(r.pack as StudyPack))}>{s.title}</button>{s.next && <span className="text-[11px] text-text-secondary">next quiz {new Date(s.next).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}<button type="button" className="text-[11px] text-text-secondary hover:underline" onClick={() => void ipc.studyDelete(s.id).then(() => ipc.studyList()).then(setSaved)}>Delete</button></li>)}</ul>
        </details>
      )}
      <Err err={err} />
    </Tool>
  );
}

function PackView({ pack, onDone, onSave, savedMsg }: { pack: StudyPack; onDone: () => void; onSave: () => void; savedMsg: string }) {
  const [tab, setTab] = useState<"summary" | "cards" | "quiz">("quiz");
  const [card, setCard] = useState(0);
  const [flip, setFlip] = useState(false);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const score = Object.entries(answers).filter(([q, a]) => pack.quiz[Number(q)]?.answer === a).length;
  return (
    <div className="space-y-2" aria-label="Study pack">
      <p className="font-semibold">{pack.title}</p>
      <div className="flex rounded-lg bg-surface-secondary p-0.5" role="tablist">
        {(["quiz", "cards", "summary"] as const).map((t) => <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`flex-1 rounded-md px-2 py-1 text-[12px] font-medium ${tab === t ? "bg-surface shadow-pebble" : "text-text-secondary"}`}>{t === "quiz" ? `Quiz (${pack.quiz.length})` : t === "cards" ? `Flashcards (${pack.flashcards.length})` : "Summary"}</button>)}
      </div>
      {tab === "summary" && <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap font-sans text-[12.5px]">{pack.summary}</pre>}
      {tab === "cards" && pack.flashcards.length > 0 && (
        <div className="space-y-2">
          <button type="button" onClick={() => setFlip(!flip)} aria-label="Flashcard" className="grid min-h-28 w-full place-items-center rounded-xl border border-border p-4 text-center hover:bg-surface-secondary">{flip ? pack.flashcards[card].a : pack.flashcards[card].q}<span className="mt-2 block text-[11px] text-text-secondary">{flip ? "Answer" : "Click to see the answer"}</span></button>
          <div className="flex items-center justify-between text-[12px]"><button type="button" className={btn} disabled={card === 0} onClick={() => { setCard(card - 1); setFlip(false); }}>Back</button><span>{card + 1} / {pack.flashcards.length}</span><button type="button" className={btn} disabled={card === pack.flashcards.length - 1} onClick={() => { setCard(card + 1); setFlip(false); }}>Next</button></div>
        </div>
      )}
      {tab === "quiz" && (
        <ol className="max-h-80 space-y-3 overflow-y-auto">
          {pack.quiz.map((q, i) => (
            <li key={i} className="text-[12.5px]"><p className="font-medium">{i + 1}. {q.q}</p>
              <div className="mt-1 grid gap-1">{q.choices.map((c, j) => {
                const chosen = answers[i] === j, done = answers[i] != null;
                return <button key={j} type="button" disabled={done} onClick={() => setAnswers({ ...answers, [i]: j })} className={`rounded-lg border px-2 py-1 text-left ${done && j === q.answer ? "border-group-personal bg-group-personal/10" : chosen ? "border-red-500 bg-red-500/10" : "border-border hover:bg-surface-secondary"}`}>{c}</button>;
              })}</div>
              {answers[i] != null && q.why && <p className="mt-1 text-[12px] text-text-secondary">{answers[i] === q.answer ? "Right. " : "Not quite. "}{q.why}</p>}
            </li>
          ))}
          {Object.keys(answers).length === pack.quiz.length && pack.quiz.length > 0 && <p className="font-medium">You got {score} of {pack.quiz.length}.</p>}
        </ol>
      )}
      <div className="flex flex-wrap items-center gap-2"><button type="button" className={primary} onClick={onSave}>Save and remind me later today</button><button type="button" className={btn} onClick={onDone}>Close pack</button>{savedMsg && <span role="status" className="text-[12px] text-text-secondary">{savedMsg}</span>}</div>
    </div>
  );
}

// ---------------------------------------------------------------- timetable

function TimetableTool() {
  const provider = useProvider();
  const [confirm, setConfirm] = useState(false);
  const [classes, setClasses] = useState<ClassSlot[] | null>(null);
  const [weeks, setWeeks] = useState(12);
  const [done, setDone] = useState("");
  const { busy, err, run } = useStep();
  const read = () => run(async () => {
    const p = await pageText(activeTab().id);
    const list = parseTimetable(await ipc.aiChat(TIMETABLE_PROMPT, [{ role: "user", content: wrap(p) }], true));
    if (!list.length) throw new Error("No timetable found on this page. Open the page that shows your weekly classes.");
    setClasses(list); setConfirm(false); setDone("");
  });
  return (
    <Tool label="Timetable" icon={<CalendarPlus size={16} className="text-primary" />} title="Fill in my timetable" hint="Open your school portal's timetable page. You'll see every class before anything is created; then a calendar file is made and your Calendar app asks you to confirm adding the events.">
      {!classes && (!confirm ? <button type="button" className={btn} disabled={busy || !activeTab().url} onClick={() => setConfirm(true)}>Read the timetable on this page</button>
        : <SendCheck busy={busy} provider={provider} what={`the text of “${activeTab().title}” (up to 6,000 characters)`} onSend={() => void read()} onCancel={() => setConfirm(false)} />)}
      {classes && (
        <div className="space-y-2">
          <table className="w-full text-[12px]" aria-label="Classes found">
            <thead><tr className="text-left text-text-secondary"><th>Day</th><th>Time</th><th>Class</th><th>Room</th><th /></tr></thead>
            <tbody>{classes.map((c, i) => <tr key={i} className="border-t border-border"><td>{c.day}</td><td>{c.start}–{c.end}</td><td>{c.subject}</td><td>{c.room}</td><td><button type="button" aria-label={`Leave out ${c.subject} on ${c.day}`} className="text-text-secondary hover:underline" onClick={() => setClasses(classes.filter((_, j) => j !== i))}>Leave out</button></td></tr>)}</tbody>
          </table>
          <label className="block text-[12px]">Repeat every week for <input type="number" min={1} max={52} value={weeks} onChange={(e) => setWeeks(Number(e.target.value) || 1)} className="w-16 rounded-lg border border-border bg-surface px-2 py-0.5" aria-label="Weeks" /> weeks, starting this week</label>
          <div className="flex gap-2"><button type="button" className={primary} disabled={busy || !classes.length} onClick={() => void run(async () => { const r = await ipc.timetableSaveIcs(buildIcs(classes, new Date(), weeks)); setDone(r.opened ? `Saved ${r.path.split("/").pop()} in Downloads and opened it: your Calendar app will ask before adding anything.` : `Saved ${r.path}. Open it to add the classes to your calendar.`); })}>Make the calendar file ({classes.length} classes)</button><button type="button" className={btn} onClick={() => setClasses(null)}>Start over</button></div>
          {done && <p role="status" className="text-[12px] text-text-secondary">{done}</p>}
        </div>
      )}
      <Err err={err} />
    </Tool>
  );
}

// ---------------------------------------------------------------- assignments

function AssignmentsTool() {
  const provider = useProvider();
  const [confirm, setConfirm] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [saveAsk, setSaveAsk] = useState(false);
  const [msg, setMsg] = useState("");
  const { busy, err, run } = useStep();
  const read = () => run(async () => {
    const p = await pageText(activeTab().id);
    const today = new Date();
    const list = parseAssignments(await ipc.aiChat(ASSIGNMENTS_PROMPT, [{ role: "user", content: `Today is ${today.toDateString()}.\n\n${wrap(p)}` }], true));
    if (!list.length) throw new Error("No assignments found on this page. Open Google Classroom's To-do page or your school's assignments list.");
    setNote(assignmentsNote(dueThisWeek(list, today), today)); setConfirm(false); setMsg("");
  });
  return (
    <Tool label="Assignments" icon={<ClipboardList size={16} className="text-primary" />} title="Collect my assignments" hint="Open Google Classroom's To-do page (or your school's assignment list) while signed in. Quick Pebble reads it and lists what's due this week in one note. It doesn't click or change anything there.">
      {!note && (!confirm ? <button type="button" className={btn} disabled={busy || !activeTab().url} onClick={() => setConfirm(true)}>Read assignments on this page</button>
        : <SendCheck busy={busy} provider={provider} what={`the text of “${activeTab().title}” (up to 6,000 characters) and today's date`} onSend={() => void read()} onCancel={() => setConfirm(false)} />)}
      {note && (
        <div className="space-y-2">
          <pre aria-label="Assignments note" className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-xl bg-surface-secondary p-3 font-sans text-[12.5px]">{note}</pre>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn} onClick={() => void navigator.clipboard.writeText(note).then(() => setMsg("Copied."))}>Copy</button>
            {!saveAsk ? <button type="button" className={btn} onClick={() => setSaveAsk(true)}>Save as a note…</button> : (<>
              {/Mac/.test(navigator.platform) && <button type="button" className={btn} onClick={() => void run(async () => { await ipc.noteSave("Due this week", note, "notes"); setMsg("Added to Apple Notes."); setSaveAsk(false); })}>Add to Apple Notes</button>}
              <button type="button" className={btn} onClick={() => void run(async () => { const r = await ipc.noteSave("Due this week", note, "file"); if (r) setMsg(`Saved to ${r.saved}.`); setSaveAsk(false); })}>Save as a file</button>
            </>)}
            <button type="button" className={btn} onClick={() => setNote(null)}>Done</button>
          </div>
          {msg && <p role="status" className="text-[12px] text-text-secondary">{msg}</p>}
        </div>
      )}
      <Err err={err} />
    </Tool>
  );
}

// ---------------------------------------------------------------- slides to notes

/** Reads the whole page by scrolling through it (slides often only show text for what's on screen). */
async function scrollText(id: string, max = 40): Promise<{ title: string; text: string; screens: number }> {
  const seen = new Set<string>();
  let title = "", lastY = -1, screens = 0;
  for (let i = 0; i < max; i++) {
    const s = await ipc.agentExec<PageSnapshot & { scroll: { y: number; max: number } }>(id, "snapshot");
    title = s.title; screens++;
    for (const line of s.text.split(/(?<=[.!?])\s+|\n/)) if (line.trim().length > 2) seen.add(line.trim());
    if (s.scroll.y >= s.scroll.max || s.scroll.y === lastY) break;
    lastY = s.scroll.y;
    await ipc.agentExec(id, "scroll", { direction: "down" });
    await new Promise((r) => setTimeout(r, 350));
  }
  return { title, text: [...seen].join("\n").slice(0, 60_000), screens };
}

function SlidesTool() {
  const provider = useProvider();
  const [ready, setReady] = useState<{ title: string; text: string; how: string } | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const { busy, err, run } = useStep();
  const collect = () => run(async () => {
    const tab = activeTab();
    const pdf = await ipc.slidesPdfText(tab.id).catch(() => null);
    if (pdf && pdf.trim().length > 50) return setReady({ title: tab.title, text: pdf, how: "the text of the PDF" });
    const r = await scrollText(tab.id);
    if (r.text.length < 50) throw new Error("Couldn't read text from these slides. If they're pictures only, export them as a PDF and open that.");
    setReady({ title: r.title, text: r.text, how: `the text I read while scrolling through ${r.screens} screen${r.screens === 1 ? "" : "s"}` });
  });
  return (
    <Tool label="Slides to notes" icon={<Presentation size={16} className="text-primary" />} title="Turn lecture slides into notes" hint="Open the slides (a PDF or a slides page). Quick Pebble scrolls through and reads them, shows you how much it will send, then writes a study summary.">
      {!ready && !notes && <button type="button" className={btn} disabled={busy || !activeTab().url} onClick={() => void collect()}>{busy ? "Reading the slides…" : "Read the slides in this tab"}</button>}
      {ready && !notes && <SendCheck busy={busy} provider={provider} what={`${ready.how} of “${ready.title}” (${ready.text.length.toLocaleString()} characters)`} onSend={() => void run(async () => { setNotes(await ipc.aiChat(NOTES_PROMPT, [{ role: "user", content: `SLIDES "${ready.title}":\n<<<SLIDES\n${ready.text.slice(0, 60_000)}\n>>>SLIDES` }])); setReady(null); })} onCancel={() => setReady(null)} />}
      {notes && (
        <div className="space-y-2">
          <pre aria-label="Study notes" className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl bg-surface-secondary p-3 font-sans text-[12.5px]">{notes}</pre>
          <div className="flex gap-2"><button type="button" className={btn} onClick={() => void navigator.clipboard.writeText(notes).then(() => setMsg("Copied."))}>Copy</button><button type="button" className={btn} onClick={() => void run(async () => { const r = await ipc.noteSave(notes.split("\n")[0] || "Lecture notes", notes, "file"); if (r) setMsg(`Saved to ${r.saved}.`); })}>Save as a file</button><button type="button" className={btn} onClick={() => setNotes(null)}>Done</button></div>
          {msg && <p role="status" className="text-[12px] text-text-secondary">{msg}</p>}
        </div>
      )}
      <Err err={err} />
    </Tool>
  );
}

// ---------------------------------------------------------------- submit-checker

function SubmitTool() {
  const provider = useProvider();
  const [confirm, setConfirm] = useState(false);
  const [rules, setRules] = useState<SubmitRules | null>(null);
  const [results, setResults] = useState<{ name: string; problems: string[] }[]>([]);
  const { busy, err, run } = useStep();
  const read = () => run(async () => {
    const p = await pageText(activeTab().id);
    setRules(parseRules(await ipc.aiChat(RULES_PROMPT, [{ role: "user", content: wrap(p) }], true), p.text));
    setConfirm(false); setResults([]);
  });
  const none = rules && !rules.types.length && !rules.maxBytes && !rules.namePattern && !rules.nameRule && !rules.notes.length;
  return (
    <Tool label="Submit-checker" icon={<FileCheck2 size={16} className="text-primary" />} title="Check before you submit" hint="Open the assignment page. Quick Pebble reads its rules (file type, name, size), then checks the file you plan to hand in and says what's wrong. It never submits anything; you do that yourself.">
      {!confirm ? <button type="button" className={btn} disabled={busy || !activeTab().url} onClick={() => setConfirm(true)}>{rules ? "Read the rules again" : "Read the rules on this page"}</button>
        : <SendCheck busy={busy} provider={provider} what={`the text of “${activeTab().title}” (up to 6,000 characters)`} onSend={() => void read()} onCancel={() => setConfirm(false)} />}
      {rules && (
        <div className="mt-2 space-y-2 text-[12.5px]" aria-label="Submission rules">
          {none ? <p className="text-text-secondary">The page doesn't state any file rules.</p> : (
            <ul className="list-disc pl-5">
              {rules.types.length > 0 && <li>File types: {rules.types.map((t) => `.${t}`).join(", ")}</li>}
              {rules.maxBytes && <li>Largest size: {(rules.maxBytes / 1024 / 1024).toFixed(rules.maxBytes < 1024 * 1024 ? 2 : 0)} MB</li>}
              {(rules.nameRule || rules.namePattern) && <li>File name: {rules.nameRule || rules.namePattern}</li>}
              {rules.notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          )}
          <button type="button" className={btn} onClick={() => void run(async () => { const files = await ipc.submitPickFiles(); setResults(files.map((f) => ({ name: f.name, problems: checkSubmission(rules, f) }))); })}>Choose the file to check…</button>
          {results.map((r) => <div key={r.name} className={`rounded-lg border p-2 ${r.problems.length ? "border-amber-500/60" : "border-group-personal/60"}`}><p className="font-medium">{r.name}</p>{r.problems.length ? <ul className="list-disc pl-5 text-[12px]">{r.problems.map((p, i) => <li key={i}>{p}</li>)}</ul> : <p className="text-[12px] text-text-secondary">Meets every rule the page states.</p>}</div>)}
        </div>
      )}
      <Err err={err} />
    </Tool>
  );
}

// ---------------------------------------------------------------- practice partner

function PracticeTool() {
  const provider = useProvider();
  const [confirm, setConfirm] = useState<"read" | "explain" | null>(null);
  const [mine, setMine] = useState("");
  const [explain, setExplain] = useState<string | null>(null);
  const [question, setQuestion] = useState<string | null>(null);
  const { busy, err, run, setErr } = useStep();
  const speak = (t: string) => { try { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(t)); } catch { setErr("Your computer's voice isn't available."); } };
  return (
    <Tool label="Practice partner" icon={<GraduationCap size={16} className="text-primary" />} title="Practice partner" hint="On a quiz page: hear the current question read aloud (your computer's own voice), or get a kind explanation of why your answer was wrong. It never answers or submits for you.">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn} disabled={busy || !activeTab().url} onClick={() => setConfirm("read")}><Volume2 size={13} className="mr-1 inline" />Read the question aloud</button>
        <input value={mine} onChange={(e) => setMine(e.target.value)} placeholder="The answer I gave…" aria-label="The answer I gave" className="min-w-40 flex-1 rounded-lg border border-border bg-surface px-2 py-1.5" />
        <button type="button" className={btn} disabled={busy || !mine.trim() || !activeTab().url} onClick={() => setConfirm("explain")}>Explain my mistake</button>
      </div>
      {confirm && <SendCheck busy={busy} provider={provider} what={`the text of “${activeTab().title}” (up to 6,000 characters)${confirm === "explain" ? " and the answer you typed" : ""}`} onCancel={() => setConfirm(null)} onSend={() => void run(async () => {
        const p = await pageText(activeTab().id);
        if (confirm === "read") {
          const q = parseQuestion(await ipc.aiChat(QUESTION_PROMPT, [{ role: "user", content: wrap(p) }], true));
          if (!q) throw new Error("Couldn't find a question on this page.");
          setQuestion(speakable(q)); speak(speakable(q));
        } else setExplain(await ipc.aiChat(EXPLAIN_PROMPT, [{ role: "user", content: `My answer was: ${mine.slice(0, 300)}\n\n${wrap(p)}` }]));
        setConfirm(null);
      })} />}
      {question && <p className="mt-2 text-[12.5px]"><b>Question:</b> {question} <button type="button" className="text-primary hover:underline" onClick={() => speak(question)}>Say it again</button></p>}
      {explain && <p aria-label="Explanation" className="mt-2 whitespace-pre-wrap rounded-xl bg-surface-secondary p-3 text-[12.5px]">{explain}</p>}
      <Err err={err} />
    </Tool>
  );
}
