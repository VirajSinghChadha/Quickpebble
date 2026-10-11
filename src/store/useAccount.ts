import { create } from "zustand";
import { account, AuthError, type Profile, type Session } from "../lib/account";
import { ipc } from "../lib/ipc";

const PROVIDERS = ["gemini", "openai", "anthropic"] as const;
type Status = "loading" | "signed-out" | "needs-code" | "ready";

interface AccountState {
  status: Status;
  session: Session | null;
  profile: Profile | null;
  offline: boolean;
  init: () => Promise<void>;
  signedIn: (session: Session) => Promise<void>;
  redeem: (code: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
  saveKey: (provider: string, key: string) => Promise<void>;
  sendReport: (report: { message: string; log: string | null; version: string; platform: string }) => Promise<void>;
}

async function persist(session: Session | null, profile: Profile | null) {
  try {
    await ipc.settingsSet("account_session", session ? JSON.stringify({ session, profile }) : "");
  } catch { /* the session just won't survive a restart */ }
}

async function pullKeys(session: Session) {
  for (const provider of PROVIDERS) {
    try {
      const { key } = await account.call<{ key: string | null }>(session, "key_get", { provider });
      if (key) await ipc.aiSetKey(provider, key);
    } catch { /* a key that can't be read is simply not loaded */ }
  }
}

type Stored = { session: Session; profile: Profile | null };
let initFlight: Promise<void> | null = null;

async function readStored(): Promise<Stored | null> {
  try {
    const raw = (await ipc.settingsGet()).account_session;
    const parsed = raw ? (JSON.parse(raw) as Stored) : null;
    return parsed?.session?.refresh_token ? parsed : null;
  } catch { return null; }
}

const stillFresh = (s: Session) => s.expires_at - 60 > Date.now() / 1000;
/** Only a refusal that says the login itself is dead should sign the person out; anything else (a hiccup, a busy server) must not. */
const loginIsDead = (e: unknown) => e instanceof AuthError && /refresh token|invalid_grant|already used|session.*(not found|expired|revoked)|user.*not found/i.test(e.message);

/** Restores the saved sign-in at start-up. Keeps the person signed in through network trouble, rotated tokens and temporary server errors. */
async function resume(): Promise<void> {
  const set = useAccount.setState;
  const get = useAccount.getState;
  const stored = await readStored();
  if (!stored) { set({ status: "signed-out" }); return; }
  const offline = (session: Session, profile: Profile | null) => set({ status: profile ? "ready" : "signed-out", session, profile, offline: true });
  let session = stored.session;
  if (!stillFresh(session)) {
    try {
      session = await account.refresh(session.refresh_token);
    } catch (e) {
      if (!(e instanceof AuthError)) return offline(stored.session, stored.profile);
      // Another window may have renewed the login a moment ago: use its newer one instead of giving up.
      const newer = await readStored();
      if (newer && newer.session.refresh_token !== stored.session.refresh_token) {
        try { session = stillFresh(newer.session) ? newer.session : await account.refresh(newer.session.refresh_token); }
        catch (e2) { if (loginIsDead(e2)) { await persist(null, null); return set({ status: "signed-out", session: null, profile: null }); } return offline(newer.session, newer.profile); }
      } else if (loginIsDead(e)) {
        await persist(null, null);
        return set({ status: "signed-out", session: null, profile: null });
      } else {
        return offline(stored.session, stored.profile);
      }
    }
    await persist(session, stored.profile);
  }
  try {
    await get().signedIn(session);
  } catch (e) {
    // Couldn't confirm the account right now. Keep the saved login rather than throwing it away.
    if (e instanceof AuthError && !stored.profile) return set({ status: "signed-out", session, profile: null });
    offline(session, stored.profile);
  }
}

/** Account state lives outside any panel so the app stays signed in across updates and restarts. */
export const useAccount = create<AccountState>((set, get) => ({
  status: "loading", session: null, profile: null, offline: false,

  /** One start-up check at a time: two at once would spend the same one-time refresh token twice and sign the person out. */
  init: () => (initFlight ??= resume().finally(() => { initFlight = null; })),

  signedIn: async (session) => {
    const { profile } = await account.call<{ profile: Profile | null }>(session, "me");
    await persist(session, profile);
    if (!profile) { set({ status: "needs-code", session, profile: null, offline: false }); return; }
    set({ status: "ready", session, profile, offline: false });
    void pullKeys(session);
  },

  redeem: async (code, name) => {
    const session = get().session;
    if (!session) throw new Error("Please sign in first.");
    const { profile } = await account.call<{ profile: Profile }>(session, "redeem", { code, name });
    await persist(session, profile);
    set({ status: "ready", profile, offline: false });
    void pullKeys(session);
  },

  signOut: async () => {
    await persist(null, null);
    for (const provider of PROVIDERS) { try { await ipc.aiSetKey(provider, ""); } catch { /* ignore */ } }
    set({ status: "signed-out", session: null, profile: null });
  },

  sendReport: async (report) => {
    let session = get().session;
    if (!session) throw new Error("Sign in to send a report.");
    if (session.expires_at - 60 < Date.now() / 1000) {
      session = await account.refresh(session.refresh_token);
      await persist(session, get().profile);
      set({ session });
    }
    await account.call(session, "report", report);
  },

  saveKey: async (provider, key) => {
    let session = get().session;
    if (!session) throw new Error("Sign in to save your key to your account.");
    if (session.expires_at - 60 < Date.now() / 1000) {
      session = await account.refresh(session.refresh_token);
      await persist(session, get().profile);
      set({ session });
    }
    await account.call(session, "key_set", { provider, key });
  },
}));
