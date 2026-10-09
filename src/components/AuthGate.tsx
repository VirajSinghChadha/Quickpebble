import { useEffect, useState } from "react";
import { account } from "../lib/account";
import { ipc } from "../lib/ipc";
import { useAccount } from "../store/useAccount";

const field = "w-full rounded-lg border border-border bg-bg px-3 py-2.5 outline-none focus:border-primary";
const button = "w-full rounded-lg bg-primary px-4 py-2.5 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:text-bg";

/** Full-screen sign-in: email code, then name and beta access code on first sign-up. Covers the page webviews. */
export function AuthGate() {
  const status = useAccount((s) => s.status);
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [name, setName] = useState("");
  const [access, setAccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    void ipc.contentVisible(false);
    return () => { void ipc.contentVisible(true); };
  }, []);

  if (status === "loading") {
    return <main className="fixed inset-0 z-[60] grid place-items-center bg-bg text-text-secondary" aria-busy="true">Loading…</main>;
  }

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null); setInfo(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const send = () => run(async () => { await account.sendCode(email.trim()); setStep("code"); setInfo(`We sent a code to ${email.trim()}.`); });
  const verify = () => run(async () => { const session = await account.verifyCode(email.trim(), token.trim()); await useAccount.getState().signedIn(session); });
  const redeem = () => run(() => useAccount.getState().redeem(access, name));

  return (
    <main className="fixed inset-0 z-[60] grid place-items-center overflow-auto bg-bg px-6" aria-label="Sign in">
      <div className="w-full max-w-sm space-y-5 py-10">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold">Quick Pebble</h1>
          <p className="text-text-secondary">
            {status === "needs-code" ? "One last step: tell us your name and enter your beta access code." : "Sign in to keep your settings and API key with you."}
          </p>
        </div>

        {status === "needs-code" ? (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void redeem(); }}>
            <input className={field} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} autoFocus aria-label="Your name" />
            <input className={`${field} font-mono uppercase`} placeholder="Access code (QP-XXXX-XXXX)" value={access} onChange={(e) => setAccess(e.target.value)} aria-label="Access code" />
            <button type="submit" className={button} disabled={busy || !name.trim() || !access.trim()}>{busy ? "Checking…" : "Continue"}</button>
            <button type="button" className="w-full text-[13px] text-text-secondary hover:underline" onClick={() => void useAccount.getState().signOut()}>Use a different email</button>
          </form>
        ) : step === "email" ? (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void send(); }}>
            <input className={field} type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus aria-label="Email" />
            <button type="submit" className={button} disabled={busy || !email.includes("@")}>{busy ? "Sending…" : "Email me a sign-in code"}</button>
            <p className="text-center text-[12px] text-text-secondary">New here? The same code creates your account. Google sign-in is coming soon.</p>
          </form>
        ) : (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void verify(); }}>
            <input className={`${field} text-center font-mono tracking-[0.3em]`} inputMode="numeric" placeholder="Code from your email" value={token} onChange={(e) => setToken(e.target.value.replace(/\s/g, ""))} autoFocus aria-label="Sign-in code" />
            <button type="submit" className={button} disabled={busy || token.length < 6}>{busy ? "Checking…" : "Verify"}</button>
            <div className="flex justify-between text-[13px] text-text-secondary">
              <button type="button" className="hover:underline" onClick={() => { setStep("email"); setToken(""); setError(null); }}>Change email</button>
              <button type="button" className="hover:underline" disabled={busy} onClick={() => void send()}>Resend code</button>
            </div>
          </form>
        )}

        {info && !error && <p className="text-center text-[13px] text-text-secondary" role="status">{info}</p>}
        {error && <p className="text-center text-[13px] text-red-500" role="alert">{error}</p>}
      </div>
    </main>
  );
}
