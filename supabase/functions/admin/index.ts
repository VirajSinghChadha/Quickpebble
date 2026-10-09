import { cors, db, json, timingSafeEqual } from "../_shared/common.ts";

const rand = (n: number) => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => alphabet[b % alphabet.length]).join("");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const expected = Deno.env.get("ADMIN_CODE") ?? "";
  const given = req.headers.get("x-admin-code") ?? "";
  if (expected.length < 12 || !timingSafeEqual(given, expected)) {
    await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    return json({ error: "Wrong admin code." }, 401);
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Bad request" }, 400);
  }
  const admin = db();
  const action = String(body.action ?? "");

  if (action === "overview") {
    const [{ data: codes }, { data: profiles }, { data: keys }] = await Promise.all([
      admin.from("access_codes").select("*").order("created_at", { ascending: false }),
      admin.from("profiles").select("*").order("created_at", { ascending: false }),
      admin.from("user_keys").select("id,user_id,provider,last4,updated_at"),
    ]);
    const signIns = new Map<string, string | null>();
    for (let page = 1; page <= 20; page++) {
      const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      for (const u of data?.users ?? []) signIns.set(u.id, u.last_sign_in_at ?? null);
      if ((data?.users.length ?? 0) < 200) break;
    }
    const codeById = new Map((codes ?? []).map((c) => [c.id, c]));
    const users = (profiles ?? []).map((p) => ({
      user_id: p.user_id,
      name: p.name,
      email: p.email,
      joined: p.created_at,
      last_sign_in: signIns.get(p.user_id) ?? null,
      code: codeById.get(p.code_id)?.code ?? null,
      code_label: codeById.get(p.code_id)?.label ?? null,
      keys: (keys ?? []).filter((k) => k.user_id === p.user_id).map((k) => ({ id: k.id, provider: k.provider, last4: k.last4 })),
    }));
    return json({ codes, users });
  }
  if (action === "create_code") {
    const label = String(body.label ?? "").slice(0, 80);
    const maxUses = Math.min(Math.max(Number(body.max_uses) || 1, 1), 10000);
    const code = `QP-${rand(4)}-${rand(4)}`;
    const { data, error } = await admin.from("access_codes").insert({ code, label, max_uses: maxUses }).select("*").single();
    if (error) return json({ error: error.message }, 500);
    return json({ code: data });
  }
  if (action === "revoke_code") {
    await admin.from("access_codes").update({ revoked: Boolean(body.revoked) }).eq("id", String(body.id));
    return json({ ok: true });
  }
  if (action === "delete_code") {
    await admin.from("access_codes").delete().eq("id", String(body.id));
    return json({ ok: true });
  }
  if (action === "delete_key") {
    await admin.from("user_keys").delete().eq("id", Number(body.id));
    return json({ ok: true });
  }
  if (action === "delete_user") {
    const { error } = await admin.auth.admin.deleteUser(String(body.user_id));
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }
  return json({ error: "Unknown action" }, 400);
});
