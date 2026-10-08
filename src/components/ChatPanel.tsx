import { useEffect, useRef, useState } from "react";
import { Answer } from "./Answer";
import { Bot, Check, CircleAlert, MousePointerClick, Send, Square, Trash2, X } from "lucide-react";
import { useOllama } from "../hooks/useOllama";
import { selectActive, useStore } from "../store/useStore";
import { useChat } from "../store/useChat";

const SUGGESTIONS = {
  screen: ["Open Notes and write a shopping list", "Find my latest download in Finder", "Turn on dark mode in System Settings"],
  act: ["Open the first search result", "Find the pricing page on this site", "Close all YouTube tabs"],
  ask: ["Summarize this page", "What are the key points?", "Explain this like I'm new to it"],
};

export function ChatPanel() {
  const { items, busy, mode, approvalMode, approval, sourceTabIds, setSourceTabIds, webResearch, setWebResearch, includeCurrentPage, setIncludeCurrentPage, setMode, setApprovalMode, send, stop, clear } = useChat();
  const sourceTabs = useStore(s => s.tabs);
  const activeId = useStore(s => s.activeId);
  const [showSources, setShowSources] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const composer = useRef<HTMLTextAreaElement>(null);
  const hasPage = useStore((s) => !!selectActive(s).url);
  const { status } = useOllama(30000);
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { if (follow.current) end.current?.scrollIntoView({ block: "end", behavior: "auto" }); }, [items, approval, busy]);
  useEffect(() => { if (composer.current) { composer.current.style.height = "auto"; composer.current.style.height = `${Math.min(composer.current.scrollHeight, 112)}px`; } }, [text]);

  const submit = () => {
    if (!text.trim() || busy) return;
    follow.current = true;
    void send(text);
    setText("");
  };
  const cloud = status && status.provider !== "ollama";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <div className="flex rounded-lg bg-surface-secondary p-0.5" role="tablist" aria-label="Assistant mode">
          {(["act", "ask", "screen"] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              type="button"
              disabled={busy}
              onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1 text-[12px] font-medium transition-colors duration-150 ${mode === m ? "bg-surface text-text-primary shadow-pebble" : "text-text-secondary"}`}
            >
              {m === "act" ? "Do tasks" : m === "ask" ? "Ask" : "Screen"}
            </button>
          ))}
        </div>
        {mode === "act" && (
          <select
            value={approvalMode}
            onChange={(e) => setApprovalMode(e.target.value as "ask" | "auto")}
            aria-label="Approval mode"
            className="rounded-lg border border-border bg-surface px-1.5 py-1 text-[12px]"
            title="Ask first: approve every action. Autopilot: only sensitive clicks (buy, delete, send…) need approval."
          >
            <option value="ask">Ask before acting</option>
            <option value="auto">Autopilot</option>
          </select>
        )}
        <button type="button" aria-label="Clear chat" title="Clear chat" onClick={clear} disabled={busy || items.length === 0} className="ml-auto grid size-7 place-items-center rounded-lg text-text-secondary hover:bg-surface-secondary disabled:opacity-40">
          <Trash2 size={14} />
        </button>
      </div>

      {mode === "ask" && <div className="border-b border-border px-3 py-2">
        <button type="button" disabled={busy} onClick={() => setShowSources(!showSources)} aria-expanded={showSources} className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-xs text-text-secondary hover:bg-surface-secondary"><span>Sources · {sourceTabIds.length ? `${sourceTabIds.length} selected pages` : hasPage && includeCurrentPage ? 'Current page' : 'No pages attached'}</span><span>{showSources ? 'Done' : 'Choose'}</span></button>
        <label className="mt-1 flex items-center gap-2 px-2 text-xs text-text-secondary"><input type="checkbox" disabled={busy} checked={webResearch} onChange={e => setWebResearch(e.target.checked)}/> Search the web for sources</label>
        {webResearch && <p className="mt-1 px-2 text-[10px] leading-relaxed text-text-secondary">Sends your question to Brave Search. API key required in Settings. Results are search excerpts.</p>}
        {showSources && <div className="mt-2 space-y-1">
          <p className="px-2 pb-1 text-[11px] text-text-secondary">Choose up to four loaded pages. Only their text is used. With none selected, use the current page if enabled.</p>
          <label className="flex items-center gap-2 px-2 py-1 text-xs"><input type="checkbox" disabled={busy} checked={includeCurrentPage} onChange={e => setIncludeCurrentPage(e.target.checked)}/> Use current page when none selected</label>
          {sourceTabs.filter(t => t.url && !t.suspended && !t.needsLoad).map(t => <label key={t.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs"><input type="checkbox" disabled={busy || (sourceTabIds.length >= 4 && !sourceTabIds.includes(t.id))} checked={sourceTabIds.includes(t.id)} onChange={e => setSourceTabIds(e.target.checked ? [...sourceTabIds, t.id] : sourceTabIds.filter(id => id !== t.id))}/><span className="truncate">{t.title || t.url}{t.id === activeId ? ' · current' : ''}</span></label>)}
        </div>}
      </div>}
      <div ref={scroll} onScroll={() => { const e = scroll.current; if (e) follow.current = e.scrollHeight - e.scrollTop - e.clientHeight < 70; }} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
        {items.length === 0 && (
          <div className="mt-6 space-y-4 text-center">
            <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-surface-secondary text-primary"><Bot size={24} /></div>
            <div>
              <p className="text-[14px] font-semibold">{mode === "ask" ? "A little clarity, one question away" : "Tell me what to do"}</p>
              <p className="mx-auto mt-1 max-w-[260px] text-text-secondary">
                {mode === "act" ? "I can click, type, scroll and open tabs in this browser for you. You stay in control." : mode === "screen" ? "I look at your whole screen and use the mouse and keyboard, one approved step at a time. Needs a Gemini key and Python 3." : "Get clear answers with citations from the pages you choose."}
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              {SUGGESTIONS[mode].map((s) => (
                <button key={s} type="button" disabled={busy} onClick={() => { follow.current = true; void send(s); }} className="rounded-xl border border-border px-3 py-2 text-left text-[12.5px] transition-colors duration-150 hover:bg-surface-secondary">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {items.map((m) =>
          m.kind === "user" ? (
            <div key={m.id} className="ml-8 whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-3 py-2 text-white dark:text-bg">{m.text}</div>
          ) : m.kind === "assistant" ? <Answer key={m.id} item={m}/> : m.kind === "step" ? (
            <div key={m.id} className="flex items-start gap-2 px-1 text-[12px] text-text-secondary">
              {m.ok ? <Check size={13} className="mt-0.5 shrink-0 text-group-personal" /> : <X size={13} className="mt-0.5 shrink-0 text-red-500" />}
              <span className="min-w-0 break-words">{m.text}</span>
            </div>
          ) : m.kind === "say" ? (
            <p key={m.id} className="px-1 text-[12.5px] italic text-text-secondary">{m.text}</p>
          ) : m.kind === "error" ? (
            <div key={m.id} role="alert" className="flex items-start gap-2 rounded-xl bg-red-500/10 px-3 py-2 text-red-600 dark:text-red-400"><CircleAlert size={14} className="mt-0.5 shrink-0" />{m.text}</div>
          ) : (
            <div key={m.id} className={`mr-4 select-text whitespace-pre-wrap rounded-2xl rounded-bl-md px-3 py-2 ${m.kind === "question" ? "border border-primary/40 bg-surface" : "bg-surface-secondary"}`}>{m.text}</div>
          ),
        )}
        {approval && (
          <div role="alertdialog" aria-label="Approve action" className="rounded-2xl border border-primary/50 bg-surface p-3 shadow-pebble">
            <p className="mb-2 flex items-center gap-2 font-medium"><MousePointerClick size={14} className="text-primary" /> Allow this action?</p>
            <p className="mb-3 break-words text-text-secondary">{approval.description}</p>
            <div className="flex gap-2">
              <button type="button" autoFocus onClick={() => approval.resolve(true)} className="rounded-lg bg-primary px-3 py-1.5 font-medium text-white dark:text-bg">Allow</button>
              <button type="button" onClick={() => approval.resolve(false)} className="rounded-lg border border-border px-3 py-1.5">Stop</button>
            </div>
          </div>
        )}
        {busy && !approval && (
          <div className="flex items-center gap-2 px-1 text-text-secondary" role="status">
            <span className="size-3.5 animate-spin rounded-full border-2 border-border border-t-primary" /> Working…
          </div>
        )}
        <div ref={end} />
      </div>

      <div className="border-t border-border p-4">
        <div className="flex items-end gap-2 rounded-xl border border-border bg-surface px-3 py-2 focus-within:border-primary">
          <textarea
            ref={composer}
            value={text}
            rows={1}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={mode !== "ask" ? (hasPage ? "What should I do?" : "What should I open or do?") : "Ask a question…"}
            aria-label="Message"
            className="max-h-28 min-h-5 flex-1 resize-none bg-transparent outline-none placeholder:text-text-secondary"
          />
          {busy ? (
            <button type="button" aria-label="Stop" onClick={stop} className="grid size-7 shrink-0 place-items-center rounded-lg bg-red-500 text-white"><Square size={12} fill="currentColor" /></button>
          ) : (
            <button type="button" aria-label="Send" onClick={submit} disabled={!text.trim()} className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary text-white disabled:opacity-40 dark:text-bg"><Send size={13} /></button>
          )}
        </div>
        <p className="mt-2 text-[11px] text-text-secondary">
          {status?.online ? `${status.provider === "ollama" ? "Local · " : "Cloud · "}${status.provider} · ${status.model}` : (status?.error ?? "Checking AI…")}
          {cloud && " — page content is sent to this provider."}
          {mode === "screen" && " Screen mode sends a screenshot of your whole screen to Google Gemini at every step. Move the mouse into a screen corner to abort."}
        </p>
      </div>
    </div>
  );
}
