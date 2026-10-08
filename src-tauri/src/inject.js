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

  // ---- shortcuts (the UI webview does not receive keys while a page has focus) -------
  const COMBOS = { t: "new-tab", w: "close-tab", l: "focus-address", r: "reload", d: "bookmark", "[": "back", "]": "forward", p: "palette", a: "tab-search", n: "private" };
  const NEEDS_SHIFT = { p: true, a: true, n: true };
  window.addEventListener("keydown", (e) => {
    if (!(MAC ? e.metaKey : e.ctrlKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    const action = COMBOS[k];
    if (!action || !!NEEDS_SHIFT[k] !== e.shiftKey) return;
    e.preventDefault(); e.stopPropagation();
    invoke("qp_shortcut", { action });
  }, true);
})();
