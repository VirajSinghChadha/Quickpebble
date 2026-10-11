import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError, NetworkError, type Session } from "../lib/account";

const { settings, account } = vi.hoisted(() => ({
  settings: {} as Record<string, string>,
  account: { refresh: vi.fn(), call: vi.fn(), sendCode: vi.fn(), verifyCode: vi.fn() },
}));
vi.mock("../lib/account", async (orig) => ({ ...(await orig<typeof import("../lib/account")>()), account }));
vi.mock("../lib/ipc", () => ({
  ipc: {
    settingsGet: vi.fn(async () => ({ ...settings })),
    settingsSet: vi.fn(async (k: string, v: string) => { settings[k] = v; }),
    aiSetKey: vi.fn(async () => {}),
  },
}));
const { useAccount } = await import("./useAccount");

const now = () => Math.floor(Date.now() / 1000);
const session = (over: Partial<Session> = {}): Session => ({ access_token: "a", refresh_token: "r1", expires_at: now() + 3000, email: "me@x.com", ...over });
const save = (s: Session, profile: unknown = { name: "Me", email: "me@x.com" }) => { settings.account_session = JSON.stringify({ session: s, profile }); };
const stored = () => (settings.account_session ? JSON.parse(settings.account_session) : null);

beforeEach(() => {
  for (const k of Object.keys(settings)) delete settings[k];
  vi.clearAllMocks();
  account.call.mockImplementation(async (_s: Session, action: string) => (action === "me" ? { profile: { name: "Me", email: "me@x.com" } } : { key: null }));
  useAccount.setState({ status: "loading", session: null, profile: null, offline: false });
});

describe("staying signed in", () => {
  it("asks for an email only when nothing was ever saved", async () => {
    await useAccount.getState().init();
    expect(useAccount.getState().status).toBe("signed-out");
  });

  it("restores a saved, unexpired login without any network renewal", async () => {
    save(session());
    await useAccount.getState().init();
    expect(useAccount.getState().status).toBe("ready");
    expect(account.refresh).not.toHaveBeenCalled();
  });

  it("renews an expired login and saves the new tokens", async () => {
    save(session({ expires_at: now() - 10 }));
    account.refresh.mockResolvedValue(session({ refresh_token: "r2" }));
    await useAccount.getState().init();
    expect(useAccount.getState().status).toBe("ready");
    expect(stored().session.refresh_token).toBe("r2");
  });

  it("two start-up checks at once renew only once", async () => {
    save(session({ expires_at: now() - 10 }));
    account.refresh.mockImplementation(async () => { await new Promise((r) => setTimeout(r, 20)); return session({ refresh_token: "r2" }); });
    await Promise.all([useAccount.getState().init(), useAccount.getState().init()]);
    expect(account.refresh).toHaveBeenCalledTimes(1);
    expect(useAccount.getState().status).toBe("ready");
  });

  it("stays signed in when the network is down", async () => {
    save(session({ expires_at: now() - 10 }));
    account.refresh.mockRejectedValue(new NetworkError("offline"));
    await useAccount.getState().init();
    expect(useAccount.getState().status).toBe("ready");
    expect(useAccount.getState().offline).toBe(true);
    expect(stored()).not.toBeNull();
  });

  it("keeps the saved login through a vague refusal (it may be temporary)", async () => {
    save(session({ expires_at: now() - 10 }));
    account.refresh.mockRejectedValue(new AuthError("Request failed (403)"));
    await useAccount.getState().init();
    expect(useAccount.getState().status).toBe("ready");
    expect(stored()).not.toBeNull();
  });

  it("uses a newer login saved by another window instead of signing out", async () => {
    save(session({ expires_at: now() - 10, refresh_token: "old" }));
    account.refresh.mockImplementation(async (rt: string) => {
      if (rt === "old") { save(session({ refresh_token: "newer" })); throw new AuthError("Invalid Refresh Token: Already Used"); }
      return session({ refresh_token: "newest" });
    });
    await useAccount.getState().init();
    expect(useAccount.getState().status).toBe("ready");
    expect(stored()).not.toBeNull();
  });

  it("signs out only when the login is truly dead", async () => {
    save(session({ expires_at: now() - 10 }));
    account.refresh.mockRejectedValue(new AuthError("Invalid Refresh Token: Refresh Token Not Found"));
    await useAccount.getState().init();
    expect(useAccount.getState().status).toBe("signed-out");
    expect(stored()).toBeNull();
  });

  it("keeps the login when the account server errors on the first check", async () => {
    save(session());
    account.call.mockRejectedValue(new AuthError("Request failed (401)"));
    await useAccount.getState().init();
    expect(useAccount.getState().status).toBe("ready");
    expect(stored()).not.toBeNull();
  });

  it("a real sign-out clears the saved login and the keys", async () => {
    save(session());
    await useAccount.getState().init();
    await useAccount.getState().signOut();
    expect(useAccount.getState().status).toBe("signed-out");
    expect(stored()).toBeNull();
  });
});
