import { useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, Clock, Layers, Lock, Search, Sparkles } from "lucide-react";
import { ipc, type Suggestion } from "../lib/ipc";
import { displayUrl, tabLabel } from "../lib/url";
import { selectActive, useStore } from "../store/useStore";
import { Favicon } from "./Favicon";

interface Row {
  key: string;
  kind: "search" | "url" | "history" | "bookmark" | "tab" | "ai";
  title: string;
  hint?: string;
  action: () => void;
}

const ICON = { search: Search, url: Search, history: Clock, bookmark: Bookmark, tab: Layers, ai: Sparkles };

/** Centered, 12px-radius address bar with instant, keyboard-navigable suggestions. */
export function AddressBar() {
  const tab = useStore(selectActive);
  const tabs = useStore((s) => s.tabs);
  const nonce = useStore((s) => s.focusAddressNonce);
  const aiOn = useStore((s) => s.aiAutocomplete);
  const setSuggestOpen = useStore((s) => s.setSuggestOpen);
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [remote, setRemote] = useState<Suggestion[]>([]);
  const [ai, setAi] = useState<string | null>(null);
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const query = text.trim();

  useEffect(() => {
    if (!focused) setText(tab.url ? displayUrl(tab.url) : "");
  }, [tab.url, tab.id, focused]);

  useEffect(() => {
    if (nonce > 0) {
      input.current?.focus();
      input.current?.select();
    }
  }, [nonce]);

  // Debounced history/bookmark lookup.
  useEffect(() => {
    if (!focused || !query) return setRemote([]);
    let stale = false;
    const t = setTimeout(async () => {
      const r = await ipc.suggest(query);
      if (!stale) setRemote(r);
    }, 60);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [query, focused]);

  // Optional AI completion (off by default; uses the configured provider, local Ollama unless changed).
  useEffect(() => {
    setAi(null);
    if (!focused || !aiOn || query.length < 3) return;
    let stale = false;
    const t = setTimeout(async () => {
      try {
        const c = await ipc.aiRun({ task: "complete", prefix: query });
        if (!stale && c && c.toLowerCase() !== query.toLowerCase()) setAi(c);
      } catch {
        /* AI unavailable: silently skip */
      }
    }, 700);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [query, focused, aiOn]);

  const go = (value: string) => {
    void useStore.getState().navigate(tab.id, value);
    input.current?.blur();
  };

  const rows = useMemo<Row[]>(() => {
    if (!query) return [];
    const q = query.toLowerCase();
    const out: Row[] = [{ key: "go", kind: "search", title: query, hint: "Search or go", action: () => go(query) }];
    if (ai) out.push({ key: "ai", kind: "ai", title: ai, hint: "AI suggestion", action: () => go(ai) });
    tabs
      .filter((t) => t.id !== tab.id && t.url && (t.title + t.url).toLowerCase().includes(q))
      .slice(0, 3)
      .forEach((t) => out.push({ key: `tab-${t.id}`, kind: "tab", title: tabLabel(t.title, t.url), hint: "Switch to tab", action: () => useStore.getState().activate(t.id) }));
    remote.forEach((s) =>
      out.push({ key: `${s.kind}-${s.url}`, kind: s.kind, title: s.title || displayUrl(s.url), hint: displayUrl(s.url), action: () => go(s.url) }),
    );
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, ai, remote, tabs, tab.id]);

  const open = focused && rows.length > 0;
  useEffect(() => setSuggestOpen(open), [open, setSuggestOpen]);
  useEffect(() => setSel(0), [rows.length, query]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((i) => (i + 1) % Math.max(rows.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((i) => (i - 1 + rows.length) % Math.max(rows.length, 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (rows[sel] && open) rows[sel].action();
      else if (query) go(query);
    } else if (e.key === "Escape") {
      setText(tab.url ? displayUrl(tab.url) : "");
      input.current?.blur();
    }
  };

  const secure = tab.url.startsWith("https://");

  return (
    <div className="relative w-full">
      <div
        className={`flex h-9 items-center gap-2 rounded-xl border bg-surface-secondary px-3 transition-colors duration-150 ${focused ? "border-primary bg-surface" : "border-transparent hover:border-border"}`}
      >
        {tab.url && !focused ? secure ? <Lock size={13} className="shrink-0 text-text-secondary" aria-label="Secure connection" /> : <Favicon src="" url={tab.url} size={14} /> : <Search size={14} className="shrink-0 text-text-secondary" />}
        <input
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={(e) => {
            setFocused(true);
            e.currentTarget.select();
          }}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          onKeyDown={onKey}
          placeholder="Search or enter a website"
          aria-label="Address bar"
          aria-expanded={open}
          aria-controls="suggestions"
          role="combobox"
          aria-autocomplete="list"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-text-primary outline-none placeholder:text-text-secondary"
        />
      </div>
      {open && (
        <ul id="suggestions" role="listbox" className="absolute inset-x-0 top-11 z-50 overflow-hidden rounded-[14px] border border-border bg-surface p-1.5 shadow-float">
          {rows.map((r, i) => {
            const Icon = ICON[r.kind];
            return (
              <li
                key={r.key}
                role="option"
                aria-selected={i === sel}
                onMouseEnter={() => setSel(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  r.action();
                }}
                className={`flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 ${i === sel ? "bg-surface-secondary" : ""}`}
              >
                <Icon size={14} className={`shrink-0 ${r.kind === "ai" ? "text-accent" : "text-text-secondary"}`} />
                <span className="min-w-0 flex-1 truncate text-[13px]">{r.title}</span>
                {r.hint && <span className="max-w-[40%] truncate text-[11.5px] text-text-secondary">{r.hint}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
