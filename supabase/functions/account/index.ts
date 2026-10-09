import { cors, db, decrypt, encrypt, json } from "../_shared/common.ts";

const PROVIDERS = ["gemini", "openai", "anthropic"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = db();
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !auth.user) return json({ error: "Please sign in again." }, 401);
  const user = auth.user;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Bad request" }, 400);
  }
  const action = String(body.action ?? "");

  const { data: profile } = await admin.from("profiles").select("name,email,created_at").eq("user_id", user.id).maybeSingle();

  if (action === "me") return json({ profile });

  if (action === "redeem") {
    if (profile) return json({ profile });
    const code = String(body.code ?? "").trim().toUpperCase();
    const name = String(body.name ?? "").trim().slice(0, 80);
    if (!name) return json({ error: "Please enter your name." }, 400);
    if (!code) return json({ error: "Please enter your access code." }, 400);
    const { data: row } = await admin.from("access_codes").select("*").eq("code", code).maybeSingle();
    if (!row || row.revoked || row.uses >= row.max_uses) return json({ error: "That access code isn't valid or has been used up." }, 403);
    // Claim a use atomically: the update only matches while a use is still available.
    const { data: claimed } = await admin
      .from("access_codes")
      .update({ uses: row.uses + 1 })
      .eq("id", row.id)
      .eq("uses", row.uses)
      .eq("revoked", false)
      .select("id")
      .maybeSingle();
    if (!claimed) return json({ error: "That access code was just used up. Please try again." }, 409);
    const { error } = await admin.from("profiles").insert({ user_id: user.id, email: user.email ?? "", name, code_id: row.id });
    if (error) return json({ error: "Could not create your account." }, 500);
    return json({ profile: { name, email: user.email } });
  }

  if (!profile) return json({ error: "Enter an access code first." }, 403);

  const provider = String(body.provider ?? "");
  if (action === "key_list") {
    const { data } = await admin.from("user_keys").select("provider,last4").eq("user_id", user.id);
    return json({ keys: data ?? [] });
  }
  if (!PROVIDERS.includes(provider)) return json({ error: "Unknown provider" }, 400);

  if (action === "key_get") {
    const { data } = await admin.from("user_keys").select("ciphertext,iv").eq("user_id", user.id).eq("provider", provider).maybeSingle();
    if (!data) return json({ key: null });
    try {
      return json({ key: await decrypt(data.ciphertext, data.iv, user.id) });
    } catch {
      return json({ error: "Could not read the saved key." }, 500);
    }
  }
  if (action === "key_set") {
    const key = String(body.key ?? "").trim();
    if (key.length < 8 || key.length > 512 || /\s/.test(key)) return json({ error: "That doesn't look like an API key." }, 400);
    const { ciphertext, iv } = await encrypt(key, user.id);
    const { error } = await admin.from("user_keys").upsert(
      { user_id: user.id, provider, ciphertext, iv, last4: key.slice(-4), updated_at: new Date().toISOString() },
      { onConflict: "user_id,provider" },
    );
    if (error) return json({ error: "Could not save the key." }, 500);
    return json({ ok: true });
  }
  if (action === "key_delete") {
    await admin.from("user_keys").delete().eq("user_id", user.id).eq("provider", provider);
    return json({ ok: true });
  }
  return json({ error: "Unknown action" }, 400);
});
