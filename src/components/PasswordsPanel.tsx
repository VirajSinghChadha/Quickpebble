import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Eye, EyeOff, KeyRound, Lock, LogIn, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { ipc, type VaultEntry } from "../lib/ipc";
import { generatePassword, strength } from "../lib/passwords";
import { hostOf } from "../lib/url";
import { selectActive, useStore } from "../store/useStore";

const field = "w-full rounded-lg border border-border bg-surface px-2.5 py-2 outline-none focus:border-primary";
const btn = "rounded-lg border border-border px-2.5 py-1.5 text-[12px] hover:bg-surface-secondary disabled:opacity-40";
const primary = "rounded-lg bg-primary px-3 py-1.5 font-medium text-white disabled:opacity-40 dark:text-bg";

type Status = { exists: boolean; unlocked: boolean };

/** Master-password vault in the side panel. Passwords stay encrypted until revealed, copied or filled. */
export function PasswordsPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const refresh = useCallback(() => void ipc.vaultStatus().then(setStatus), []);
  useEffect(refresh, [refresh]);
  if (!status) return null;
  if (!status.exists) return <CreateVault done={refresh} />;
  if (!status.unlocked) return <UnlockVault done={refresh} />;
  return <Vault onLocked={refresh} />;
}

function PromptCard({ onChanged, canSave = true }: { onChanged: () => void; canSave?: boolean }) {
  const prompt = useStore((s) => s.loginPrompt);
  const [err, setErr] = useState<string | null>(null);
  if (!prompt) return null;
  const finish = () => { useStore.getState().setLoginPrompt(null); setErr(null); onChanged(); };
  const save = async () => {
    try { await ipc.vaultSavePending(prompt.tabId); finish(); } catch (e) { setErr(String(e)); }
  };
  return (
    <div role="alertdialog" aria-label="Save password" className="mx-3 mt-3 rounded-2xl border border-primary/50 bg-surface p-3 shadow-pebble">
      <p className="mb-1 flex items-center gap-2 font-semibold"><KeyRound size={14} className="text-primary" /> Save password for {prompt.host}?</p>
      <p className="mb-3 text-[12px] text-text-secondary">{prompt.username ? <>Username: <b>{prompt.username}</b>. </> : null}It is encrypted with your master password.{!canSave && <b> First unlock or create your vault below, then press Save (this offer lasts 5 minutes).</b>}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" autoFocus={canSave} disabled={!canSave} className={primary} onClick={() => void save()}>Save</button>
        <button type="button" className={btn} onClick={() => { void ipc.vaultDismissPending(prompt.tabId, false); finish(); }}>Not now</button>
        <button type="button" className={btn} onClick={() => { void ipc.vaultDismissPending(prompt.tabId, true); finish(); }}>Never for this site</button>
      </div>
      {err && <p role="alert" className="mt-2 text-[12px] text-red-500">{err}</p>}
    </div>
  );
}

function CreateVault({ done }: { done: () => void }) {
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const s = strength(pw);
  const submit = async () => {
    if (pw !== again) return setErr("The two passwords don't match.");
    setBusy(true);
    try { await ipc.vaultCreate(pw); done(); } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  };
  return (
    <div className="h-full overflow-y-auto">
      <PromptCard onChanged={done} canSave={false} />
      <form className="space-y-3 p-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-surface-secondary text-primary"><KeyRound size={22} /></div>
        <h2 className="text-center text-[15px] font-semibold">Create your password vault</h2>
        <p className="text-center text-[12px] text-text-secondary">Choose a master password. It encrypts everything here and is never stored or sent anywhere.</p>
        <input type="password" autoFocus autoComplete="new-password" className={field} placeholder="Master password (8+ characters)" aria-label="Master password" value={pw} onChange={(e) => setPw(e.target.value)} />
        {pw && <p className={`text-[11.5px] ${s === "strong" ? "text-group-personal" : s === "okay" ? "text-group-school" : "text-red-500"}`}>Strength: {s}. Longer is better; try a phrase of several words.</p>}
        <input type="password" autoComplete="new-password" className={field} placeholder="Repeat master password" aria-label="Repeat master password" value={again} onChange={(e) => setAgain(e.target.value)} />
        <p className="rounded-xl bg-red-500/10 px-3 py-2 text-[12px] text-red-600 dark:text-red-400"><b>There is no recovery.</b> If you forget the master password, the saved passwords cannot be opened by anyone, including me.</p>
        <button type="submit" disabled={busy || pw.length < 8} className={`${primary} w-full`}>{busy ? "Creating…" : "Create vault"}</button>
        {err && <p role="alert" className="text-[12px] text-red-500">{err}</p>}
      </form>
    </div>
  );
}

function UnlockVault({ done }: { done: () => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try { await ipc.vaultUnlock(pw); setPw(""); done(); } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  };
  return (
    <div className="h-full overflow-y-auto">
      <PromptCard onChanged={done} canSave={false} />
      <form className="space-y-3 p-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-surface-secondary text-primary"><Lock size={22} /></div>
        <h2 className="text-center text-[15px] font-semibold">Vault locked</h2>
        <input type="password" autoFocus autoComplete="current-password" className={field} placeholder="Master password" aria-label="Master password" value={pw} onChange={(e) => setPw(e.target.value)} />
        <button type="submit" disabled={busy || !pw} className={`${primary} w-full`}>{busy ? "Unlocking…" : "Unlock"}</button>
        {err && <p role="alert" className="text-[12px] text-red-500">{err}</p>}
        <p className="text-center text-[11.5px] text-text-secondary">It locks itself after 15 minutes of no use.</p>
      </form>
    </div>
  );
}

function Vault({ onLocked }: { onLocked: () => void }) {
  const tab = useStore(selectActive);
  const site = hostOf(tab.url);
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState<Record<number, string>>({});
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const clipTimer = useRef<number | undefined>(undefined);

  const load = useCallback(() => {
    ipc.vaultList(query).then(setEntries).catch(() => onLocked()); // locked meanwhile (idle timeout)
  }, [query, onLocked]);
  useEffect(load, [load]);

  const here = useMemo(() => entries.filter((e) => site && (site === e.host)), [entries, site]);
  const others = useMemo(() => entries.filter((e) => !here.includes(e)), [entries, here]);
  const fail = (e: unknown) => setMsg(String(e));

  const reveal = async (id: number) => {
    if (shown[id] !== undefined) return setShown(({ [id]: _, ...rest }) => rest);
    try { const p = await ipc.vaultReveal(id); setShown((s) => ({ ...s, [id]: p })); } catch (e) { fail(e); }
  };
  const copy = async (id: number) => {
    try {
      const p = await ipc.vaultReveal(id);
      await navigator.clipboard.writeText(p);
      setMsg("Password copied. It will be cleared from the clipboard in 20 seconds.");
      window.clearTimeout(clipTimer.current);
      clipTimer.current = window.setTimeout(() => void navigator.clipboard.writeText("").catch(() => {}), 20000);
    } catch (e) { fail(e); }
  };
  const fill = async (id: number) => {
    try { await ipc.vaultFill(tab.id, id); setMsg("Filled. Check the page, then sign in."); } catch (e) { fail(e); }
  };
  const remove = async (e: VaultEntry) => {
    if (!window.confirm(`Delete the saved login for ${e.username || "(no username)"} on ${e.host}?`)) return;
    try { await ipc.vaultDelete(e.id); load(); } catch (err) { fail(err); }
  };

  const row = (e: VaultEntry, suggested: boolean) => (
    <div key={e.id} className="rounded-xl border border-border bg-surface p-2.5">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{e.host}</p>
          <p className="truncate text-[12px] text-text-secondary">{e.username || "(no username)"}</p>
        </div>
        {suggested && <button type="button" className={primary} onClick={() => void fill(e.id)} title="Fill into this page"><LogIn size={13} className="mr-1 inline" />Fill</button>}
      </div>
      {shown[e.id] !== undefined && <p className="mt-2 select-text break-all rounded-lg bg-surface-secondary px-2 py-1.5 font-mono text-[12px]">{shown[e.id]}</p>}
      <div className="mt-2 flex gap-1.5">
        <button type="button" className={btn} onClick={() => void reveal(e.id)} aria-label={shown[e.id] !== undefined ? "Hide password" : "Show password"}>{shown[e.id] !== undefined ? <EyeOff size={13} /> : <Eye size={13} />}</button>
        <button type="button" className={btn} onClick={() => void copy(e.id)} aria-label="Copy password"><Copy size={13} /></button>
        <button type="button" className={`${btn} ml-auto hover:!text-red-500`} onClick={() => void remove(e)} aria-label="Delete login"><Trash2 size={13} /></button>
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PromptCard onChanged={load} />
      <div className="space-y-2 border-b border-border p-3">
        <div className="flex items-center gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 focus-within:border-primary">
            <Search size={14} className="text-text-secondary" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search logins" aria-label="Search logins" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-text-secondary" />
          </label>
          <button type="button" className={btn} onClick={() => setAdding(!adding)} aria-expanded={adding}><Plus size={13} className="mr-1 inline" />Add</button>
          <button type="button" className={btn} onClick={() => { void ipc.vaultLock(); onLocked(); }} title="Lock the vault now"><Lock size={13} /></button>
        </div>
        {msg && <p role="status" className="text-[11.5px] text-text-secondary">{msg}</p>}
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {adding && <AddLogin initialHost={site} onDone={() => { setAdding(false); load(); }} onError={fail} />}
        {here.length > 0 && <><h3 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">For this site</h3>{here.map((e) => row(e, true))}</>}
        {others.length > 0 && <><h3 className="px-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">{here.length ? "Other logins" : "All logins"}</h3>{others.map((e) => row(e, false))}</>}
        {entries.length === 0 && !adding && <p className="px-3 py-8 text-center text-text-secondary">{query ? "No logins match." : "No saved logins yet. Sign in to a site and I'll offer to save it, or press Add."}</p>}
      </div>
    </div>
  );
}

function AddLogin({ initialHost, onDone, onError }: { initialHost: string; onDone: () => void; onError: (e: unknown) => void }) {
  const [host, setHost] = useState(initialHost);
  const [user, setUser] = useState("");
  const [pw, setPw] = useState("");
  const [visible, setVisible] = useState(false);
  const save = async () => {
    try { await ipc.vaultSave(host, user, pw); onDone(); } catch (e) { onError(e); }
  };
  return (
    <form className="space-y-2 rounded-xl border border-primary/40 bg-surface p-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <input className={field} placeholder="Website (example.com)" aria-label="Website" value={host} onChange={(e) => setHost(e.target.value)} autoFocus />
      <input className={field} placeholder="Username or email" aria-label="Username" autoComplete="off" value={user} onChange={(e) => setUser(e.target.value)} />
      <div className="flex gap-1.5">
        <input className={field} type={visible ? "text" : "password"} placeholder="Password" aria-label="Password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        <button type="button" className={btn} onClick={() => setVisible(!visible)} aria-label={visible ? "Hide" : "Show"}>{visible ? <EyeOff size={13} /> : <Eye size={13} />}</button>
        <button type="button" className={btn} onClick={() => { setPw(generatePassword(20, true)); setVisible(true); }} aria-label="Generate a strong password" title="Generate a strong password"><RefreshCw size={13} /></button>
      </div>
      <button type="submit" disabled={!host || !pw} className={primary}>Save login</button>
    </form>
  );
}
