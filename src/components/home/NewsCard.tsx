import { useCallback, useEffect, useState } from "react";
import { Newspaper, RefreshCw } from "lucide-react";
import { ipc, type Headline } from "../../lib/ipc";
import { cacheGet, cacheSet, NEWS_SOURCES } from "../../lib/home";
import { hostOf } from "../../lib/url";
import { selectActive, useStore } from "../../store/useStore";

const TTL = 15 * 60 * 1000;

/** A few headlines from the one public feed the person picked. Headlines are plain text; links open in this tab. */
export function NewsCard({ count = 5 }: { count?: number }) {
  const source = useStore((s) => s.home.newsSource);
  const tab = useStore(selectActive);
  const [items, setItems] = useState<Headline[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const label = NEWS_SOURCES.find((n) => n.id === source)?.label ?? source;

  const load = useCallback(
    async (force = false) => {
      const key = `news.${source}.${count}`;
      const hit = force ? null : cacheGet<Headline[]>(key, TTL);
      if (hit) return setItems(hit), setErr(null);
      setLoading(true);
      try {
        const fresh = await ipc.newsFetch(source, count);
        cacheSet(key, fresh);
        setItems(fresh);
        setErr(null);
      } catch (e) {
        setErr(String(e));
      } finally {
        setLoading(false);
      }
    },
    [source, count],
  );
  useEffect(() => void load(), [load]);

  return (
    <section className="home-widget rounded-2xl border border-border bg-surface p-4 text-left" aria-label="Top news">
      <div className="flex items-center justify-between text-[12px] text-text-secondary">
        <span className="flex min-w-0 items-center gap-1.5"><Newspaper size={12} /><span className="truncate">{label}</span></span>
        <button type="button" aria-label="Refresh news" title="Refresh" onClick={() => void load(true)} className="grid size-6 place-items-center rounded-md hover:bg-surface-secondary"><RefreshCw size={12} className={loading ? "animate-spin" : ""} /></button>
      </div>
      {items ? (
        <ul className="mt-2 space-y-0.5">
          {items.map((h) => (
            <li key={h.url}>
              <button type="button" title={h.url} onClick={() => void useStore.getState().navigate(tab.id, h.url)} className="group block w-full rounded-lg px-2 py-1.5 text-left transition-colors duration-150 hover:bg-surface-secondary">
                <span className="line-clamp-2 text-[13px] leading-snug">{h.title}</span>
                <span className="text-[11px] text-text-secondary">{hostOf(h.url)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : err ? (
        <p role="alert" className="mt-3 text-[12px] text-red-500">{err} <button type="button" onClick={() => void load(true)} className="underline">Try again</button></p>
      ) : (
        <div className="mt-3 space-y-2" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="h-4 animate-pulse rounded bg-surface-secondary" style={{ width: `${92 - i * 14}%` }} />)}</div>
      )}
    </section>
  );
}
