import { useEffect, useState } from "react";
import { CircleAlert, CircleCheck, Info, ShieldQuestion } from "lucide-react";
import { ipc } from "../lib/ipc";
import { checkPage, CLAIMS_PROMPT, parseClaims, type Claim, type Finding, type PageFacts, type PageReport } from "../lib/pageCheck";

const SURE = { sure: "Sure", likely: "Likely", unsure: "Not sure" } as const;

function Row({ f, label }: { f: Finding; label: string }) {
  const Icon = f.tone === "warn" ? CircleAlert : f.tone === "ok" ? CircleCheck : Info;
  return (
    <li className="flex gap-2" aria-label={label}>
      <Icon size={14} className={`mt-0.5 shrink-0 ${f.tone === "warn" ? "text-amber-500" : f.tone === "ok" ? "text-group-personal" : "text-primary"}`} />
      <span className="min-w-0">
        <span className="font-medium">{f.title}</span> <span className="rounded bg-surface-secondary px-1 text-[10.5px] text-text-secondary">{SURE[f.sure]}</span>
        <span className="block text-[12px] text-text-secondary">{f.detail}</span>
      </span>
    </li>
  );
}

/** "This site" → Check this page: ads, age, who runs it, trackers, and (optionally) its claims against pages you've read. */
export function PageCheck({ tabId, url }: { tabId: string; url: string }) {
  const [report, setReport] = useState<PageReport | null>(null);
  const [facts, setFacts] = useState<PageFacts | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [plan, setPlan] = useState<{ excerpts: { url: string; title: string; snippet: string }[]; provider: string } | null>(null);
  const [claims, setClaims] = useState<{ list: Claim[]; sources: { url: string; title: string }[] } | null>(null);
  useEffect(() => { setReport(null); setFacts(null); setPlan(null); setClaims(null); setMsg(null); }, [tabId, url]);

  const check = async () => {
    setBusy(true); setMsg(null);
    try {
      const f = await ipc.agentExec<PageFacts>(tabId, "page_facts");
      setFacts(f);
      setReport(checkPage(f, await ipc.pageTrackers(tabId)));
    } catch (e) { setMsg(String(e)); } finally { setBusy(false); }
  };
  // Step 1 of the claims check: find related pages the person read, and show what would be sent.
  const prepare = async () => {
    if (!facts) return;
    const stats = await ipc.recallStats();
    if (!stats.enabled || !stats.pages) return setMsg("Comparing needs Recall (pages you've read, kept on this computer). Turn it on in the Library → Memory, read around the topic, then try again.");
    const own = new URL(facts.url).hostname;
    const hits = (await ipc.recallSearch(`${facts.title} ${facts.meta.description}`.slice(0, 300), 8)).filter((h) => { try { return new URL(h.url).hostname !== own; } catch { return false; } }).slice(0, 5);
    if (!hits.length) return setMsg("None of the pages you've read are about the same thing, so there's nothing to compare with.");
    const st = await ipc.aiStatus().catch(() => null);
    setPlan({ excerpts: hits, provider: st ? (st.provider === "ollama" ? "Ollama on this computer" : st.provider) : "your AI provider" });
  };
  // Step 2: only after the person agreed.
  const compare = async () => {
    if (!facts || !plan) return;
    setBusy(true); setMsg(null);
    try {
      const body = `PAGE (${facts.url}):\n<<<PAGE\n${facts.text.slice(0, 4000)}\n>>>PAGE\n\n${plan.excerpts.map((h, i) => `EXCERPT ${i + 1} (${h.title}, ${h.url}):\n<<<EXCERPT\n${h.snippet.slice(0, 900)}\n>>>EXCERPT`).join("\n\n")}`;
      const reply = await ipc.aiChat(CLAIMS_PROMPT, [{ role: "user", content: body }], true);
      setClaims({ list: parseClaims(reply, plan.excerpts.length), sources: plan.excerpts });
      setPlan(null);
    } catch (e) { setMsg(String(e)); } finally { setBusy(false); }
  };

  if (!/^https?:/.test(url)) return null;
  return (
    <section className="space-y-2" aria-label="Check this page">
      <h3 className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-text-secondary"><ShieldQuestion size={13} /> Check this page</h3>
      {!report && <p className="text-[12px] text-text-secondary">Ads and sponsored parts, how old it is, who runs the site and which trackers it loads. Read from the page on this computer; nothing is sent anywhere.</p>}
      <button type="button" disabled={busy} onClick={() => void check()} className="rounded-lg border border-border px-3 py-1.5 hover:bg-surface-secondary disabled:opacity-40">{report ? "Check again" : "Check this page"}</button>
      {report && (
        <ul className="space-y-2 text-[12.5px]" aria-label="Page check results">
          <Row f={report.ads} label="Ads" />
          <Row f={report.freshness} label="Date" />
          <Row f={report.owner} label="Who runs it" />
          <Row f={report.trackers} label="Trackers" />
        </ul>
      )}
      {report && !plan && !claims && <button type="button" disabled={busy} onClick={() => void prepare()} className="rounded-lg border border-border px-3 py-1.5 text-[12.5px] hover:bg-surface-secondary disabled:opacity-40">Compare its claims with pages I've read…</button>}
      {plan && (
        <div role="dialog" aria-label="What will be sent" className="space-y-2 rounded-xl border border-primary/50 p-3 text-[12px]">
          <p><b>What will be sent</b> to {plan.provider}: the first 4,000 characters of this page, and short excerpts from {plan.excerpts.length} page{plan.excerpts.length === 1 ? "" : "s"} you read:</p>
          <ul className="list-disc pl-5 text-text-secondary">{plan.excerpts.map((h) => <li key={h.url} className="truncate">{h.title}</li>)}</ul>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => void compare()} className="rounded-lg bg-primary px-3 py-1.5 font-medium text-white dark:text-bg">Send and compare</button>
            <button type="button" onClick={() => setPlan(null)} className="rounded-lg border border-border px-3 py-1.5">Cancel</button>
          </div>
        </div>
      )}
      {claims && (
        <div className="space-y-1.5 text-[12.5px]" aria-label="Claims compared">
          {claims.list.length === 0 && <p className="text-text-secondary">The AI didn't find claims it could compare.</p>}
          {claims.list.map((c, i) => (
            <div key={i} className={`rounded-lg border p-2 ${c.verdict === "disagrees" ? "border-amber-500/60" : "border-border"}`}>
              <p>“{c.claim}”</p>
              <p className="text-[12px] text-text-secondary">{c.verdict === "disagrees" ? "⚠ Disagrees with" : c.verdict === "agrees" ? "Agrees with" : "Not covered by the pages you've read"}{c.source ? ` “${claims.sources[c.source - 1]?.title}”` : ""} · {c.confidence} confidence{c.note ? `. ${c.note}` : ""}</p>
            </div>
          ))}
          <p className="text-[11px] text-text-secondary">This is the AI's reading of short excerpts, not a fact check. A disagreement is a reason to look closer, not proof either way.</p>
        </div>
      )}
      {busy && <p role="status" className="text-[12px] text-text-secondary">Working…</p>}
      {msg && <p role="alert" className="text-[12px] text-text-secondary">{msg}</p>}
    </section>
  );
}
