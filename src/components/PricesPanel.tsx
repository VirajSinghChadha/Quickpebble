import { useEffect, useState } from "react";
import { ExternalLink, Plus, RotateCcw, ShoppingBag, X } from "lucide-react";
import { ipc, onPricesProgress, type PriceConfig, type PriceRow } from "../lib/ipc";
import { selectActive, useStore } from "../store/useStore";
import { Modal, ModalHeader } from "./Modal";

const btn = "rounded-lg border border-border px-3 py-1.5 hover:bg-surface-secondary disabled:opacity-40";
const primary = "rounded-lg bg-primary px-3 py-1.5 font-medium text-white disabled:opacity-40 dark:text-bg";
const STATUS: Record<PriceRow["status"], string> = { ok: "", blocked: "Couldn't read: the shop blocked the check", no_results: "Not found", error: "Couldn't read" };

const money = (n: number, cur?: string) => { try { return new Intl.NumberFormat(undefined, { style: "currency", currency: cur || "USD", maximumFractionDigits: 2 }).format(n); } catch { return `${n} ${cur ?? ""}`; } };

/** Compare prices in local shops. Read-only: never adds to a cart, buys or signs in. */
export function PricesPanel() {
  const close = () => useStore.getState().setOverlay(null);
  const [cfg, setCfg] = useState<PriceConfig | null>(null);
  const [query, setQuery] = useState(() => selectActive(useStore.getState()).title?.slice(0, 80) ?? "");
  const [pick, setPick] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<Awaited<ReturnType<typeof ipc.pricesCheck>> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState({ name: "", search: "" });
  const [provider, setProvider] = useState("your AI provider");
  useEffect(() => { void ipc.pricesConfig().then((c) => { setCfg(c); setPick(new Set(c.shops.slice(0, 5).map((s) => s.name))); }); void ipc.aiStatus().then((s) => setProvider(s.provider === "ollama" ? "Ollama on this computer" : s.provider)).catch(() => {}); }, []);
  useEffect(() => { const off = onPricesProgress((e) => setProgress(e)); return () => { void off.then((f) => f()); }; }, []);
  const apply = (c: PriceConfig) => { setCfg(c); setPick((p) => new Set([...p].filter((n) => c.shops.some((s) => s.name === n)))); };
  const act = async (fn: () => Promise<void>) => { setErr(null); try { await fn(); } catch (e) { setErr(String(e)); } };
  const chosen = cfg?.shops.filter((s) => pick.has(s.name)) ?? [];
  const run = () => act(async () => {
    setConfirm(false); setBusy(true); setResult(null); setProgress({ done: 0, total: chosen.length });
    try { setResult(await ipc.pricesCheck(query, chosen.map((s) => s.name))); } finally { setBusy(false); }
  });

  return (
    <Modal onClose={() => { if (busy) void ipc.pricesCancel(); close(); }} label="Compare prices" width="max-w-4xl">
      <ModalHeader title="Compare prices" onClose={() => { if (busy) void ipc.pricesCancel(); close(); }} />
      <div className="space-y-3 overflow-y-auto px-5 pb-5">
        <p className="text-[12px] text-text-secondary">Checks the search pages of shops in your country and puts what they show in one table. It only reads: it never adds anything to a cart, buys, or signs in. Prices are shown only when they're really on the shop's page; otherwise it says it couldn't read them.</p>
        {cfg && (
          <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
            <label>Country <select value={cfg.country} onChange={(e) => void act(async () => apply(await ipc.pricesSetCountry(e.target.value)))} className="rounded-lg border border-border bg-surface px-2 py-1" aria-label="Country">{cfg.countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></label>
            <span className="text-text-secondary">Prices in {cfg.currency}</span>
          </div>
        )}
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (query.trim().length >= 2 && chosen.length) setConfirm(true); }}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} maxLength={120} placeholder="What are you looking for? e.g. PS5 Slim disc edition" aria-label="Product" className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-1.5" />
          <button type="submit" className={primary} disabled={busy || query.trim().length < 2 || !chosen.length}>Compare in {chosen.length} shop{chosen.length === 1 ? "" : "s"}</button>
        </form>
        {cfg && (
          <details open={!result}>
            <summary className="cursor-pointer text-[12.5px] font-medium">Shops ({pick.size} chosen of {cfg.shops.length})</summary>
            <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Shops">
              {cfg.shops.map((s) => (
                <span key={s.name} className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] ${pick.has(s.name) ? "border-primary bg-primary/10" : "border-border"}`}>
                  <label className="flex cursor-pointer items-center gap-1"><input type="checkbox" className="accent-primary" disabled={!pick.has(s.name) && pick.size >= 10} checked={pick.has(s.name)} onChange={() => setPick((p) => { const n = new Set(p); if (n.has(s.name)) n.delete(s.name); else n.add(s.name); return n; })} />{s.name}</label>
                  <button type="button" aria-label={`Remove ${s.name}`} title="Remove this shop" onClick={() => void act(async () => apply(await ipc.pricesShopRemove(s.name)))} className="grid size-4 place-items-center rounded-full hover:bg-border"><X size={10} /></button>
                </span>
              ))}
            </div>
            <form className="mt-2 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void act(async () => { apply(await ipc.pricesShopAdd(adding)); setAdding({ name: "", search: "" }); }); }}>
              <input value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} placeholder="Shop name" aria-label="Shop name" className="w-36 rounded-lg border border-border bg-surface px-2 py-1 text-[12.5px]" />
              <input value={adding.search} onChange={(e) => setAdding({ ...adding, search: e.target.value })} placeholder="https://shop.example/search?q={q}" aria-label="Shop search address" className="min-w-52 flex-1 rounded-lg border border-border bg-surface px-2 py-1 text-[12.5px]" />
              <button type="submit" className={`${btn} text-[12.5px]`}><Plus size={12} className="mr-1 inline" />Add shop</button>
              <button type="button" className={`${btn} text-[12.5px]`} onClick={() => void act(async () => apply(await ipc.pricesShopsReset()))}><RotateCcw size={12} className="mr-1 inline" />Default shops</button>
            </form>
          </details>
        )}
        {confirm && (
          <div role="dialog" aria-label="What will happen" className="space-y-2 rounded-xl border border-primary/50 p-3 text-[12.5px]">
            <p>Quick Pebble will open the search page of {chosen.map((s) => s.name).join(", ")} in a hidden window with no account or cookies, and read what they show for “{query.trim()}”. <b>What will be sent</b> to {provider}: each page's text (up to 5,000 characters) and the product name, to pick out the offers. Nothing is clicked, added to a cart or bought.</p>
            <div className="flex gap-2"><button type="button" autoFocus className={primary} onClick={() => void run()}>Check prices</button><button type="button" className={btn} onClick={() => setConfirm(false)}>Cancel</button></div>
          </div>
        )}
        {busy && <p role="status" className="flex items-center gap-2 text-[12.5px] text-text-secondary"><span className="size-3 animate-spin rounded-full border-2 border-border border-t-primary" /> Checked {progress?.done ?? 0} of {progress?.total ?? chosen.length} shops… <button type="button" className="text-primary hover:underline" onClick={() => void ipc.pricesCancel()}>Stop</button></p>}
        {result && <Results r={result} />}
        {err && <p role="alert" className="text-[12px] text-red-500">{err}</p>}
      </div>
    </Modal>
  );
}

function Results({ r }: { r: NonNullable<Awaited<ReturnType<typeof ipc.pricesCheck>>> }) {
  const open = (url: string) => { useStore.getState().setOverlay(null); useStore.getState().newTab(url); };
  return (
    <div className="space-y-2" aria-label="Price results">
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-[12.5px]">
          <thead className="bg-surface-secondary text-[11.5px] text-text-secondary"><tr><th className="px-2 py-1.5">Shop</th><th className="px-2">Product</th><th className="px-2">Price</th><th className="px-2">Stock</th><th className="px-2">Delivery</th><th className="px-2">Checked</th><th /></tr></thead>
          <tbody>
            {r.rows.map((x, i) => (
              <tr key={i} className={`border-t border-border align-top ${x.cheapest ? "bg-group-personal/10" : ""}`}>
                <td className="px-2 py-1.5 font-medium">{x.shop}{x.cheapest && <span className="ml-1 rounded bg-group-personal px-1 text-[10.5px] text-white">Cheapest match</span>}</td>
                <td className="px-2 py-1.5">{x.title ?? <span className="text-text-secondary">{STATUS[x.status]}{x.note ? `: ${x.note}` : ""}</span>}{x.match && x.match !== "same" && <span className={`block text-[11.5px] ${x.match === "different" ? "text-red-500" : "text-amber-600"}`}>{x.match === "different" ? "Not the same thing" : "Not sure it's the same"}: {x.why}</span>}{x.condition && x.condition !== "new" && <span className="block text-[11.5px] text-amber-600">{x.condition}</span>}</td>
                <td className="px-2 py-1.5 tabular-nums">{x.price != null ? money(x.price, x.currency) : <span className="text-text-secondary">{x.title ? x.priceNote || "Couldn't read" : "—"}</span>}</td>
                <td className="px-2 py-1.5">{x.inStock === true ? "In stock" : x.inStock === false ? "Out of stock" : <span className="text-text-secondary">Not shown</span>}</td>
                <td className="px-2 py-1.5 text-[12px]">{x.delivery || <span className="text-text-secondary">Not shown</span>}</td>
                <td className="px-2 py-1.5 text-[11.5px] text-text-secondary">{new Date(x.checkedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
                <td className="px-2 py-1.5"><button type="button" aria-label={`Open ${x.shop}`} title="Open the page (you decide what to do there)" onClick={() => open(x.url || x.searchUrl)} className="grid size-7 place-items-center rounded-lg hover:bg-surface-secondary"><ExternalLink size={13} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="flex items-start gap-1.5 text-[11.5px] text-text-secondary"><ShoppingBag size={12} className="mt-0.5 shrink-0" /> Prices change often and may not include delivery or tax. “Cheapest match” only counts offers that look like the same product, new, with a price read from the page. Check the shop's page before buying; Quick Pebble never buys for you.</p>
    </div>
  );
}
