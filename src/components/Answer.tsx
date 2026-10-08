import { useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';
import type { ChatItem } from '../store/useChat';
import { useStore } from '../store/useStore';

export function Answer({ item }: { item: ChatItem }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  const sources = item.sources ?? [];
  const open = (url: string) => useStore.getState().newTab(url);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(item.text + (sources.length ? '\n\nSources:\n' + sources.map(s => `[${s.id}] ${s.title}: ${s.url}`).join('\n') : ''));
      setCopied(true); setCopyError('');
    } catch { setCopyError('Copy unavailable. Select the answer text to copy it.'); }
  };
  return <article className="answer-card select-text" aria-label="Assistant answer">
    <div className="flex items-center justify-between gap-2 pb-3 text-[11px] font-medium text-text-secondary"><span>PEBBLE</span><button type="button" onClick={() => void copy()} aria-label="Copy answer" className="flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-surface-secondary">{copied ? <Check size={12}/> : <Copy size={12}/>} {copied ? 'Copied' : 'Copy'}</button></div>
    <div className="space-y-3 text-[13px] leading-[1.75]">
      {(item.blocks ?? [{ text: item.text, citations: [] }]).map((b, i) => <p key={i} className="whitespace-pre-wrap break-words">{b.text} {b.citations.map(id => {
        const source = sources.find(s => s.id === id);
        return source ? <button key={id} type="button" className="citation" title={source.title} aria-label={`Source ${id}: ${source.title}`} onClick={() => open(source.url)}>{id}</button> : null;
      })}</p>)}
    </div>
    {item.blocks && <div className="mt-4 border-t border-border pt-3">
      <p className="mb-2 text-[11px] font-medium text-text-secondary">{sources.length ? 'Sources used · check the original pages' : 'No source citations · general answer'}</p>
      <div className="space-y-1.5">{sources.map(s => <button key={s.id} type="button" onClick={() => open(s.url)} className="source-card flex w-full items-center gap-2 text-left"><span className="citation shrink-0">{s.id}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{s.title}</span><span className="block truncate text-[11px] text-text-secondary">{new URL(s.url).hostname}{s.kind === "search" ? " · search excerpt" : " · page"}</span></span><ExternalLink size={12} className="shrink-0 text-text-secondary"/></button>)}</div>
    </div>}
    {copyError && <p role="status" className="mt-2 text-xs text-text-secondary">{copyError}</p>}
  </article>;
}
