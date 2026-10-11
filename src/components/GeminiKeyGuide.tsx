import { useState, type ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { ipc } from "../lib/ipc";
import { useAccount } from "../store/useAccount";
import { useStore } from "../store/useStore";

export const AI_STUDIO_URL = "https://aistudio.google.com/apikey";

/** A small browser-window drawing with one highlighted spot, so each step is easy to find on the real page. */
function Picture({ children, label }: { children: ReactNode; label: string }) {
  return (
    <svg viewBox="0 0 240 120" role="img" aria-label={label} className="w-full rounded-lg border border-border bg-surface-secondary">
      <rect x="0" y="0" width="240" height="16" fill="currentColor" opacity=".08" />
      <circle cx="9" cy="8" r="2.5" fill="#f87171" /><circle cx="18" cy="8" r="2.5" fill="#fbbf24" /><circle cx="27" cy="8" r="2.5" fill="#4ade80" />
      <rect x="60" y="4" width="120" height="8" rx="4" fill="currentColor" opacity=".12" />
      {children}
    </svg>
  );
}
const Line = ({ y, w = 110 }: { y: number; w?: number }) => <rect x="16" y={y} width={w} height="6" rx="3" fill="currentColor" opacity=".15" />;
const Hot = ({ x, y, w, h, text }: { x: number; y: number; w: number; h: number; text: string }) => (
  <g><rect x={x} y={y} width={w} height={h} rx="6" fill="#2563eb" /><text x={x + w / 2} y={y + h / 2 + 3.5} textAnchor="middle" fontSize="9" fontWeight="600" fill="#fff">{text}</text><rect x={x - 3} y={y - 3} width={w + 6} height={h + 6} rx="8" fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="4 3" /></g>
);

const STEPS: { title: string; body: string; pic: ReactNode; alt: string }[] = [
  { title: "Open Google AI Studio and sign in", body: "Use any Google account. Press the blue button below and it opens in a new tab.", alt: "A sign-in page with a Google account button",
    pic: <><Line y={30} w={80} /><Line y={42} w={140} /><Hot x={16} y={66} w={110} h={22} text="Sign in with Google" /></> },
  { title: "Click “Create API key”", body: "It is near the top right of the API keys page.", alt: "The API keys page with a Create API key button at the top right",
    pic: <><Line y={26} w={90} /><Hot x={140} y={24} w={84} h={18} text="Create API key" /><Line y={60} w={200} /><Line y={74} w={170} /><Line y={88} w={190} /></> },
  { title: "Choose “Create API key in new project”", body: "If it asks you to pick a project and you have none, choose this option. Accept Google's terms if shown.", alt: "A dialog offering to create the key in a new project",
    pic: <><rect x="40" y="26" width="160" height="80" rx="8" fill="currentColor" opacity=".08" /><Line y={36} w={90} /><Hot x={56} y={64} w={128} h={22} text="Create key in new project" /></> },
  { title: "Copy the key and paste it below", body: "Press the copy icon next to your new key. It starts with “AIza”. Keep it private, like a password.", alt: "A key listed with a copy icon beside it",
    pic: <><rect x="16" y="40" width="150" height="22" rx="6" fill="currentColor" opacity=".12" /><text x="24" y="54" fontSize="9" fill="currentColor" opacity=".6">AIzaSy••••••••••••••••</text><Hot x={176} y={40} w={48} h={22} text="Copy" /><Line y={80} w={180} /></> },
];

/** Shown when Gemini (the default) has no key yet: pictured steps, a button that opens AI Studio, and a box to paste the key. */
export function GeminiKeyGuide({ onSaved }: { onSaved: () => void }) {
  const [key, setKey] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const k = key.trim();
    if (!k) return;
    setBusy(true); setMsg(null);
    try {
      await ipc.aiSetKey("gemini", k);
      try { await useAccount.getState().saveKey("gemini", k); } catch { /* works for now; the account copy can be retried from Settings */ }
      setKey(""); onSaved();
    } catch (e) { setMsg(String(e)); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3 p-3 text-[12.5px]">
      <div>
        <p className="text-[14px] font-semibold">Connect Gemini to use the assistant</p>
        <p className="mt-1 text-text-secondary">A Gemini key is free to create and takes about a minute. The pictures are simple drawings of what to look for; Google's page may look slightly different.</p>
      </div>
      <button type="button" onClick={() => useStore.getState().newTab(AI_STUDIO_URL)} className="flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 font-medium text-white dark:text-bg"><ExternalLink size={13} />Open Google AI Studio</button>
      <ol className="space-y-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="space-y-1.5">
            <p className="font-medium"><span className="mr-1.5 inline-grid size-5 place-items-center rounded-full bg-primary text-[11px] text-white dark:text-bg">{i + 1}</span>{s.title}</p>
            <p className="text-text-secondary">{s.body}</p>
            <Picture label={s.alt}>{s.pic}</Picture>
          </li>
        ))}
      </ol>
      <div className="space-y-1.5 rounded-xl border border-border p-3">
        <label className="font-medium" htmlFor="gemini-key">Paste your key here</label>
        <input id="gemini-key" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void save()} placeholder="AIza…" className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5" />
        <button type="button" disabled={busy || !key.trim()} onClick={() => void save()} className="rounded-full bg-primary px-3.5 py-1.5 font-medium text-white disabled:opacity-50 dark:text-bg">{busy ? "Saving…" : "Save key"}</button>
        {msg && <p className="text-red-500" role="alert">{msg}</p>}
        <p className="text-[11.5px] text-text-secondary">Saved encrypted to your Quick Pebble account and kept only in memory on this computer. Prefer a local model? Change the provider in Settings.</p>
      </div>
    </div>
  );
}
