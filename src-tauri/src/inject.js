// Injected into every top-level page. Reports page state, forwards browser shortcuts,
// and enforces per-site permission blocks. Runs before page scripts.
(() => {
  if (window.top !== window || window.__qp) return;
  Object.defineProperty(window, "__qp", { value: true });
  const BLOCKED = __QP_BLOCKED__;
  const MAC = /Mac/i.test(navigator.platform);
  const invoke = (cmd, args) => {
    try {
      const i = window.__TAURI_INTERNALS__;
      return i && i.invoke ? i.invoke(cmd, args).catch(() => {}) : undefined;
    } catch (_) {}
  };

  // ---- permission firewall -------------------------------------------------
  const deny = (name) => new DOMException(name + " blocked by Quick Pebble", "NotAllowedError");
  try {
    const md = navigator.mediaDevices;
    if (md && md.getUserMedia) {
      const orig = md.getUserMedia.bind(md);
      md.getUserMedia = (c) => {
        if (c && c.video && BLOCKED.includes("camera")) return Promise.reject(deny("Camera"));
        if (c && c.audio && BLOCKED.includes("microphone")) return Promise.reject(deny("Microphone"));
        return orig(c).then((s) => { window.__qpRecording = true; s.getTracks().forEach((t) => t.addEventListener("ended", () => { window.__qpRecording = false; })); return s; });
      };
    }
    if (navigator.geolocation && BLOCKED.includes("location")) {
      const err = { code: 1, message: "Location blocked by Quick Pebble", PERMISSION_DENIED: 1 };
      navigator.geolocation.getCurrentPosition = (_, e) => e && e(err);
      navigator.geolocation.watchPosition = (_, e) => { e && e(err); return 0; };
    }
    if (window.Notification && BLOCKED.includes("notifications")) {
      Notification.requestPermission = () => Promise.resolve("denied");
    }
  } catch (_) {}

  // ---- mute ----------------------------------------------------------------
  let muted = false;
  const applyMute = () => document.querySelectorAll("audio,video").forEach((m) => { m.muted = muted || m.defaultMuted; });
  window.__qpSetMuted = (v) => { muted = !!v; applyMute(); };
  new MutationObserver(() => muted && applyMute()).observe(document, { childList: true, subtree: true });

  // ---- reporting -----------------------------------------------------------
  const favicon = () => {
    const l = document.querySelector('link[rel~="icon"]');
    try { return l && l.href ? l.href : location.origin + "/favicon.ico"; } catch (_) { return ""; }
  };
  const audible = () => Array.from(document.querySelectorAll("audio,video")).some((m) => !m.paused && !m.ended && !m.muted && m.volume > 0 && m.readyState > 2);
  let last = "";
  const report = (withText) => {
    const payload = {
      url: location.href, title: document.title || "", favicon: favicon(),
      audible: audible(), recording: !!window.__qpRecording,
      text: withText ? (document.body ? document.body.innerText.slice(0, 20000) : "") : null,
    };
    const sig = JSON.stringify([payload.url, payload.title, payload.favicon, payload.audible, payload.recording]);
    if (withText || sig !== last) { last = sig; invoke("qp_report", { report: payload }); }
  };
  window.addEventListener("DOMContentLoaded", () => report(false));
  window.addEventListener("load", () => setTimeout(() => report(true), 600));
  window.addEventListener("popstate", () => report(false));
  window.addEventListener("hashchange", () => report(false));
  setInterval(() => report(false), 2500);

  // ---- find in page --------------------------------------------------------
  window.__qpFind = () => {
    let host = document.getElementById("__qp_find");
    if (host) { host.shadowRoot.querySelector("input").focus(); return; }
    host = document.createElement("div");
    host.id = "__qp_find";
    host.style.cssText = "all:initial;position:fixed;top:12px;right:16px;z-index:2147483647";
    const root = host.attachShadow({ mode: "closed" });
    root.innerHTML = '<style>div{font:13px -apple-system,system-ui,sans-serif;display:flex;gap:6px;align-items:center;background:#fff;color:#172033;border:1px solid #e2e8f0;border-radius:12px;padding:6px 8px;box-shadow:0 8px 32px rgba(15,23,42,.18)}input{border:0;outline:0;font:inherit;width:190px;background:transparent;color:inherit}button{border:0;background:#f1f5f9;border-radius:8px;width:26px;height:26px;cursor:pointer;color:#172033}span{color:#64748b;font-size:12px}@media (prefers-color-scheme:dark){div{background:#1b2638;color:#f8fafc;border-color:#334155}button{background:#243247;color:#f8fafc}}</style><div><input placeholder="Find in page" aria-label="Find in page"><span></span><button title="Previous">↑</button><button title="Next">↓</button><button title="Close">✕</button></div>';
    const input = root.querySelector("input"), [prev, next, close] = root.querySelectorAll("button"), note = root.querySelector("span");
    const find = (back) => { if (!input.value) { note.textContent = ""; return; } note.textContent = window.find(input.value, false, back, true, false, false, false) ? "" : "No matches"; };
    input.addEventListener("input", () => { getSelection().removeAllRanges(); find(false); });
    input.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") find(e.shiftKey); if (e.key === "Escape") close.click(); }, true);
    prev.onclick = () => find(true); next.onclick = () => find(false);
    close.onclick = () => { host.remove(); getSelection().removeAllRanges(); };
    (document.body || document.documentElement).appendChild(host);
    input.focus();
  };

  // ---- agent ---------------------------------------------------------------
  const SEL = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[role=switch],[onclick],[contenteditable=""],[contenteditable="true"]';
  let els = [];
  const clean = (t, n) => (t || "").replace(/\s+/g, " ").trim().slice(0, n || 80);
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const st = getComputedStyle(el);
    return st.visibility !== "hidden" && st.display !== "none" && parseFloat(st.opacity) > 0.05;
  };
  const labelOf = (el) => clean(el.getAttribute("aria-label") || el.innerText || el.value || el.placeholder || el.title || el.alt || el.name || (el.labels && el.labels[0] && el.labels[0].innerText));
  const OPS = {
    snapshot() {
      els = Array.from(document.querySelectorAll(SEL)).filter(visible).slice(0, 120);
      return {
        url: location.href, title: document.title,
        scroll: { y: Math.round(scrollY), max: Math.max(0, Math.round(document.documentElement.scrollHeight - innerHeight)) },
        text: clean(document.body ? document.body.innerText : "", 6000),
        elements: els.map((el, i) => {
          const inView = el.getBoundingClientRect().bottom > 0 && el.getBoundingClientRect().top < innerHeight;
          return { i, tag: el.tagName.toLowerCase(), type: el.type || undefined, label: labelOf(el), href: el.href ? el.href.slice(0, 100) : undefined,
                   value: el.type === "password" ? undefined : el.value ? clean(String(el.value), 60) : undefined, disabled: el.disabled || undefined, offscreen: inView ? undefined : true };
        }),
      };
    },
    click({ i }) {
      const el = els[i]; if (!el || !el.isConnected) return { error: "Element not found. Take a fresh snapshot." };
      el.scrollIntoView({ block: "center" }); el.focus && el.focus(); el.click(); return { ok: true, clicked: labelOf(el) };
    },
    type({ i, text, submit }) {
      const el = els[i]; if (!el || !el.isConnected) return { error: "Element not found. Take a fresh snapshot." };
      if (el.type === "password") return { error: "Refusing to type into a password field." };
      el.scrollIntoView({ block: "center" }); el.focus();
      if (el.isContentEditable) { document.execCommand("selectAll"); document.execCommand("insertText", false, String(text)); }
      else if ("value" in el) {
        const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value").set.call(el, String(text));
        el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
      } else return { error: "That element cannot take text." };
      if (submit) {
        ["keydown", "keypress", "keyup"].forEach((t) => el.dispatchEvent(new KeyboardEvent(t, { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true })));
        if (el.form && el.form.requestSubmit) { try { el.form.requestSubmit(); } catch (_) {} }
      }
      return { ok: true };
    },
    select({ i, value }) {
      const el = els[i]; if (!el || el.tagName !== "SELECT") return { error: "Not a select element." };
      const o = Array.from(el.options).find((o) => o.value === value || clean(o.text) === value);
      if (!o) return { error: "Option not found. Options: " + Array.from(el.options).map((o) => clean(o.text)).join(" | ").slice(0, 300) };
      el.value = o.value; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); return { ok: true };
    },
    scroll({ direction }) {
      const d = direction === "up" ? -1 : 1; scrollBy({ top: d * innerHeight * 0.8, behavior: "instant" }); return { ok: true, y: Math.round(scrollY) };
    },
    press({ key }) {
      const t = document.activeElement || document.body;
      ["keydown", "keypress", "keyup"].forEach((n) => t.dispatchEvent(new KeyboardEvent(n, { key, bubbles: true })));
      return { ok: true };
    },
  };
  window.__qpAgent = {
    run(id, op, args) {
      let r;
      try { r = OPS[op](args || {}); } catch (e) { r = { error: String(e) }; }
      invoke("qp_agent_result", { id, result: r });
    },
  };

  // ---- shortcuts (the UI webview does not receive keys while a page has focus) -------
  const COMBOS = [
    ["t", false, "new-tab"], ["t", true, "reopen-tab"], ["w", false, "close-tab"], ["l", false, "focus-address"],
    ["r", false, "reload"], ["d", false, "bookmark"], ["[", false, "back"], ["]", false, "forward"],
    ["p", true, "palette"], ["a", true, "tab-search"], ["n", true, "private"], ["j", false, "assistant"],
    ["f", false, "find"], ["y", false, "library"], ["=", false, "zoom-in"], ["+", true, "zoom-in"],
    ["-", false, "zoom-out"], ["0", false, "zoom-reset"],
  ];
  window.addEventListener("keydown", (e) => {
    if (!(MAC ? e.metaKey : e.ctrlKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    const hit = COMBOS.find((c) => c[0] === k && c[1] === e.shiftKey);
    if (!hit) return;
    e.preventDefault(); e.stopPropagation();
    invoke("qp_shortcut", { action: hit[2] });
  }, true);
})();
