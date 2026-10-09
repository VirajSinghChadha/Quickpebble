import { create } from "zustand";
import { account, AuthError, NetworkError, type Profile, type Session } from "../lib/account";
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

/** Account state lives outside any panel so the app stays signed in across updates and restarts. */
export const useAccount = create<AccountState>((set, get) => ({
  status: "loading", session: null, profile: null, offline: false,

  init: async () => {
    let stored: { session: Session; profile: Profile | null } | null = null;
    try {
      const raw = (await ipc.settingsGet()).account_session;
      if (raw) stored = JSON.parse(raw);
    } catch { /* treated as signed out */ }
    if (!stored?.session) { set({ status: "signed-out" }); return; }
    try {
      const session = stored.session.expires_at - 60 > Date.now() / 1000 ? stored.session : await account.refresh(stored.session.refresh_token);
      await get().signedIn(session);
    } catch (e) {
      if (e instanceof NetworkError && stored.profile) {
        // Offline: let the person in; their keys load next time they're online.
        set({ status: "ready", session: stored.session, profile: stored.profile, offline: true });
      } else if (e instanceof AuthError) {
        await persist(null, null);
        set({ status: "signed-out", session: null, profile: null });
      } else {
        set({ status: stored.profile ? "ready" : "signed-out", session: stored.session, profile: stored.profile, offline: true });
      }
    }
  },

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
