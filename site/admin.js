const API = "https://vlhttxrenggbmpsrgmpm.supabase.co/functions/v1/admin";
const PUBLISHABLE = "sb_publishable_s1bol8ZC0FRdprR-SawdnA_e-zzsLsZ";
const $ = (id) => document.getElementById(id);
let adminCode = sessionStorage.getItem("qp_admin") || "";

async function call(action, body = {}) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: PUBLISHABLE, "x-admin-code": adminCode },
    body: JSON.stringify({ action, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  Object.assign(n, props);
  for (const k of kids) n.append(k);
  return n;
};
const when = (t) => (t ? new Date(t).toLocaleString() : "never");

function button(text, cls, onClick) {
  const b = el("button", { className: `btn ${cls}`, textContent: text, type: "button" });
  b.style.padding = "5px 10px";
  b.addEventListener("click", onClick);
  return b;
}

async function act(fn) {
  try { $("status").textContent = "Working…"; await fn(); await load(); }
  catch (e) { $("status").textContent = e.message; $("status").className = "tag err"; }
}

function render({ codes, users }) {
  const cb = $("codes");
  cb.replaceChildren();
  for (const c of codes) {
    const state = c.revoked ? "Revoked" : c.uses >= c.max_uses ? "Used up" : "Active";
    cb.append(el("tr", {},
      el("td", { className: "mono", textContent: c.code }),
      el("td", { textContent: c.label }),
      el("td", { textContent: `${c.uses} / ${c.max_uses}` }),
      el("td", {}, el("span", { className: "tag", textContent: state })),
      el("td", {},
        button("Copy", "ghost", () => navigator.clipboard.writeText(c.code)), " ",
        button(c.revoked ? "Restore" : "Revoke", "ghost", () => act(() => call("revoke_code", { id: c.id, revoked: !c.revoked }))), " ",
        button("Delete", "danger", () => confirm(`Delete code ${c.code}?`) && act(() => call("delete_code", { id: c.id }))))));
  }
  const ub = $("users");
  ub.replaceChildren();
  for (const u of users) {
    const keys = el("td", {});
    if (!u.keys.length) keys.textContent = "none";
    for (const k of u.keys) {
      keys.append(el("div", {},
        el("span", { className: "mono", textContent: `#${k.id} ${k.provider} …${k.last4} ` }),
        button("Remove", "danger", () => confirm("Remove this saved key?") && act(() => call("delete_key", { id: k.id })))));
    }
    ub.append(el("tr", {},
      el("td", { textContent: u.name }),
      el("td", { textContent: u.email }),
      el("td", { textContent: when(u.joined) }),
      el("td", { textContent: when(u.last_sign_in) }),
      el("td", { className: "mono", textContent: u.code ? `${u.code}${u.code_label ? ` (${u.code_label})` : ""}` : "none" }),
      keys,
      el("td", {}, button("Delete user", "danger", () => confirm(`Delete ${u.email} and all their data?`) && act(() => call("delete_user", { user_id: u.user_id }))))));
  }
  $("status").className = "tag";
  $("status").textContent = `${users.length} users · ${codes.length} codes`;
}

async function load() { render(await call("overview")); }

function show(unlocked) { $("login").hidden = unlocked; $("panel").hidden = !unlocked; }

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  adminCode = $("code").value;
  $("loginErr").textContent = "";
  try { await load(); sessionStorage.setItem("qp_admin", adminCode); $("code").value = ""; show(true); }
  catch (err) { adminCode = ""; $("loginErr").textContent = err.message; }
});
$("newCode").addEventListener("submit", (e) => {
  e.preventDefault();
  act(() => call("create_code", { label: $("label").value, max_uses: Number($("uses").value) || 1 }).then(() => { $("label").value = ""; }));
});
$("refresh").addEventListener("click", () => act(async () => {}));
$("lock").addEventListener("click", () => { sessionStorage.removeItem("qp_admin"); adminCode = ""; show(false); });

if (adminCode) load().then(() => show(true)).catch(() => { adminCode = ""; sessionStorage.removeItem("qp_admin"); });
