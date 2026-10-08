import { useEffect, useState } from "react";
import { ArrowUpRight, Bookmark, Clock, Command, Cpu, Search, ShieldCheck, Sparkles } from "lucide-react";
import { ipc, type Bookmark as Bm, type HistoryEntry, type MemoryStats } from "../lib/ipc";
import { useOllama } from "../hooks/useOllama";
import { displayUrl, hostOf } from "../lib/url";
import { modKey } from "../lib/actions";
import { selectActive, useStore } from "../store/useStore";
import { Favicon } from "./Favicon";

const QUICK_LINKS = [
  { name: "Wikipedia", url: "https://wikipedia.org" },
  { name: "GitHub", url: "https://github.com" },
  { name: "YouTube", url: "https://youtube.com" },
  { name: "Reddit", url: "https://reddit.com" },
  { name: "Hacker News", url: "https://news.ycombinator.com" },
  { name: "MDN", url: "https://developer.mozilla.org" },
];

function greeting(): string {
  const h = new Date().getHours();
  return h < 5 ? "Burning the midnight oil" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function SearchBox({ big }: { big?: boolean }) {
  const tab = useStore(selectActive);
  const [q, setQ] = useState("");
  return (
    <form
      className={`mx-auto flex w-full items-center gap-3 rounded-xl border border-border bg-surface px-4 shadow-pebble transition-shadow duration-150 focus-within:border-primary ${big ? "h-14 max-w-2xl" : "h-12 max-w-xl"}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) void useStore.getState().navigate(tab.id, q);
      }}
    >
      <Search size={18} className="text-text-secondary" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search or enter a website" aria-label="Search the web" className="flex-1 bg-transparent text-[15px] outline-none placeholder:text-text-secondary" />
    </form>
  );
}

function Logo({ size = 64 }: { size?: number }) {
  return <img src="/pebble.svg" alt="" width={size} height={size} className="rounded-[22%]" draggable={false} />;
}

function Tiles({ items }: { items: { name: string; url: string }[] }) {
  const tab = useStore(selectActive);
  return (
    <div className="quick-tiles mx-auto grid w-full max-w-2xl gap-3">
      {items.map((l) => (
        <button
          key={l.url}
          type="button"
          onClick={() => void useStore.getState().navigate(tab.id, l.url)}
          className="group flex flex-col items-center gap-2 rounded-2xl p-3 transition-colors duration-150 hover:bg-surface"
        >
          <span className="grid size-12 place-items-center rounded-xl bg-surface shadow-pebble transition-transform duration-150 group-hover:-translate-y-0.5">
            <Favicon src={`${new URL(l.url).origin}/favicon.ico`} url={l.url} size={22} />
          </span>
          <span className="max-w-full truncate text-[12px] text-text-secondary">{l.name}</span>
        </button>
      ))}
    </div>
  );
}

function Classic() {
  const [marks, setMarks] = useState<Bm[]>([]);
  const bookmarksVersion = useStore(s => s.bookmarksVersion);
  useEffect(() => { let active = true; void ipc.bookmarkList().then(b => { if (active) setMarks(b.slice(0, 6)); }); return () => { active = false; }; }, [bookmarksVersion]);
  return (
    <div className="newtab-content mx-auto flex max-w-4xl flex-col px-8 pb-8 pt-[7vh]">
      <div className="mb-14 flex items-center justify-between text-xs text-text-secondary"><span className="flex items-center gap-2 font-medium"><Logo size={24}/> QUICK PEBBLE</span><span>{new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span></div>
      <div className="mb-8 text-center"><span className="newtab-eyebrow">YOUR SPACE TO EXPLORE</span><h1 className="mt-4 text-[clamp(32px,4vw,48px)] font-semibold tracking-[-0.045em] leading-tight">A clearer view of the web.</h1><p className="mt-3 text-sm text-text-secondary">Less noise. More room for what matters.</p></div>
      <SearchBox big />
      <div className="mt-7"><Tiles items={marks.length ? marks.map(b => ({ name: b.title || hostOf(b.url), url: b.url })) : QUICK_LINKS}/></div>
      <div className="newtab-actions mt-12 grid gap-3 sm:grid-cols-3">
        <button type="button" className="home-card" onClick={() => useStore.getState().setSidebar('assistant')}><span className="home-card-icon"><Sparkles size={19}/></span><span className="min-w-0 flex-1"><strong className="block text-[13px] font-medium">Ask Pebble</strong><span className="mt-1 block text-xs text-text-secondary">Answers with page sources</span></span><ArrowUpRight size={15} className="text-text-secondary"/></button>
        <button type="button" className="home-card" onClick={() => useStore.getState().setSidebar('therapist')}><span className="home-card-icon"><Bookmark size={19}/></span><span className="min-w-0 flex-1"><strong className="block text-[13px] font-medium">Your workspaces</strong><span className="mt-1 block text-xs text-text-secondary">Pick up where you left off</span></span><ArrowUpRight size={15} className="text-text-secondary"/></button>
        <button type="button" className="home-card" onClick={() => useStore.getState().setOverlay('privacy')}><span className="home-card-icon"><ShieldCheck size={19}/></span><span className="min-w-0 flex-1"><strong className="block text-[13px] font-medium">Privacy center</strong><span className="mt-1 block text-xs text-text-secondary">Browse with control</span></span><ArrowUpRight size={15} className="text-text-secondary"/></button>
      </div>
      <button type="button" onClick={() => useStore.getState().setOverlay('palette')} className="mx-auto mt-9 flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-text-secondary hover:bg-surface"><Command size={13}/> Quick actions <kbd className="shortcut-key">{modKey}⇧P</kbd></button>
    </div>
  );
}

function Minimal() {
  return (
    <div className="flex flex-col items-center gap-6 pt-[26vh]">
      <Logo size={48} />
      <SearchBox big />
      <p className="text-[12px] text-text-secondary">Press {modKey}⇧P for quick actions</p>
    </div>
  );
}

function Productivity() {
  const [bookmarks, setBookmarks] = useState<Bm[]>([]);
  const [recent, setRecent] = useState<HistoryEntry[]>([]);
  const [mem, setMem] = useState<MemoryStats | null>(null);
  const tabs = useStore((s) => s.tabs);
  const tab = useStore(selectActive);
  const { status } = useOllama();
  useEffect(() => {
    void ipc.bookmarkList().then((b) => setBookmarks(b.slice(0, 8)));
    void ipc.historySearch("", 8).then(setRecent);
    void ipc.memoryStats().then(setMem);
  }, []);
  const open = (u: string) => void useStore.getState().navigate(tab.id, u);
  const card = "rounded-2xl border border-border bg-surface p-4";
  const List = ({ items }: { items: { url: string; title: string }[] }) => (
    <ul className="space-y-0.5">
      {items.length === 0 && <li className="py-2 text-text-secondary">Nothing here yet.</li>}
      {items.map((i) => (
        <li key={i.url}>
          <button type="button" onClick={() => open(i.url)} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 hover:bg-surface-secondary">
            <Favicon src="" url={i.url} />
            <span className="min-w-0 flex-1 truncate">{i.title || hostOf(i.url)}</span>
            <span className="max-w-[40%] truncate text-[11.5px] text-text-secondary">{displayUrl(i.url)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 pt-[8vh]">
      <div className="flex items-end justify-between">
        <div><p className="text-text-secondary">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p><h1 className="text-2xl font-semibold tracking-tight">{greeting()}</h1></div>
        <Logo size={40} />
      </div>
      <SearchBox />
      <div className="grid gap-4 md:grid-cols-2">
        <section className={card}><h2 className="mb-2 flex items-center gap-2 font-semibold"><Bookmark size={14} /> Bookmarks</h2><List items={bookmarks} /></section>
        <section className={card}><h2 className="mb-2 flex items-center gap-2 font-semibold"><Clock size={14} /> Recently visited</h2><List items={recent} /></section>
        <section className={card}>
          <h2 className="mb-2 flex items-center gap-2 font-semibold"><Cpu size={14} /> Memory Saver</h2>
          <p className="text-text-secondary">{tabs.length} tabs open · {mem?.suspended_tabs ?? 0} suspended · ~{mem?.estimated_saved_mb ?? 0} MB saved</p>
        </section>
        <section className={card}>
          <h2 className="mb-2 flex items-center gap-2 font-semibold"><Sparkles size={14} /> AI</h2>
          <p className="flex items-center gap-2 text-text-secondary"><span className={`size-2 rounded-full ${status?.online ? "bg-group-personal" : "bg-red-500"}`} />{status?.online ? `${status.provider} · ${status.model}` : status?.error ?? "Checking…"}</p>
        </section>
      </div>
    </div>
  );
}

export function NewTabPage() {
  const layout = useStore((s) => s.layout);
  return (
    <main className="newtab h-full overflow-y-auto bg-bg" aria-label="New tab">
      {layout === "minimal" ? <Minimal /> : layout === "productivity" ? <Productivity /> : <Classic />}
    </main>
  );
}
