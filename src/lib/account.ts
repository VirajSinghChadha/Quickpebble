// Sign-in and cloud key sync against the Quick Pebble Supabase project.
// The publishable key below is meant to be public; it can only do what the database rules allow.
export const SUPABASE_URL = "https://vlhttxrenggbmpsrgmpm.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_s1bol8ZC0FRdprR-SawdnA_e-zzsLsZ";

export interface Session {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  email: string;
}
export interface Profile {
  name: string;
  email: string;
}

export class NetworkError extends Error {}
export class AuthError extends Error {}

async function request(path: string, init: RequestInit & { token?: string } = {}): Promise<Record<string, unknown>> {
  const { token, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}${path}`, {
      ...rest,
      headers: {
        apikey: PUBLISHABLE_KEY,
        Authorization: `Bearer ${token ?? PUBLISHABLE_KEY}`,
        "Content-Type": "application/json",
      },
    });
  } catch {
    throw new NetworkError("Can't reach the server. Check your internet connection.");
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message = String(data.error_description ?? data.msg ?? data.message ?? data.error ?? `Request failed (${res.status})`);
    if (res.status === 401 || res.status === 400 || res.status === 403) throw new AuthError(message);
    throw new Error(message);
  }
  return data;
}

function toSession(data: Record<string, unknown>): Session {
  const user = data.user as { email?: string } | undefined;
  return {
    access_token: String(data.access_token),
    refresh_token: String(data.refresh_token),
    expires_at: Number(data.expires_at ?? Math.floor(Date.now() / 1000) + Number(data.expires_in ?? 3600)),
    email: user?.email ?? "",
  };
}

export const account = {
  sendCode: async (email: string) => {
    await request("/auth/v1/otp", { method: "POST", body: JSON.stringify({ email, create_user: true }) });
  },
  verifyCode: async (email: string, token: string) =>
    toSession(await request("/auth/v1/verify", { method: "POST", body: JSON.stringify({ type: "email", email, token }) })),
  refresh: async (refreshToken: string) =>
    toSession(await request("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: JSON.stringify({ refresh_token: refreshToken }) })),
  call: async <T>(session: Session, action: string, body: Record<string, unknown> = {}) =>
    (await request("/functions/v1/account", { method: "POST", token: session.access_token, body: JSON.stringify({ action, ...body }) })) as T,
};
