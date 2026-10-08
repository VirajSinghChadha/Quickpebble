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

  // ---- content blocker (best effort) ---------------------------------------
  // System webviews expose no request-interception API, so sub-resources are blocked by wrapping the
  // APIs pages use to load them. Resources the HTML parser fetches before this runs cannot be stopped.
  const TRACKERS = __QP_TRACKERS__;
  const BLOCK = __QP_BLOCK__;
  const STRICT = __QP_STRICT__;
  let blockedSince = 0;
  setInterval(() => { if (blockedSince) { const n = blockedSince; blockedSince = 0; invoke("qp_blocked", { count: n }); } }, 3000);
  const pageHost = location.hostname.toLowerCase();
  const AD_PATH = /(^|\/)(ads?|adserver|adframe|adview|adsense|pagead|banners?|sponsored|prebid|popunder)(\/|\.|-|_|$)/i;
  const trackerUrl = (u) => {
    try {
      const h = new URL(String(u && u.url ? u.url : u), location.href).hostname.toLowerCase();
      if (h === pageHost || h.endsWith("." + pageHost) || pageHost.endsWith("." + h)) return false; // first party
      if (TRACKERS.some((t) => h === t || h.endsWith("." + t))) return true;
      // Strict mode: third-party requests whose path looks like an ad call (/ads/, /adserver/, /pagead/, /banner…).
      return STRICT && AD_PATH.test(new URL(String(u && u.url ? u.url : u), location.href).pathname);
    } catch (_) { return false; }
  };
  if (BLOCK) {
    const hit = () => { blockedSince++; };
    const origFetch = window.fetch;
    if (origFetch) window.fetch = function (input) { if (trackerUrl(input)) { hit(); return Promise.reject(new TypeError("Failed to fetch")); } return origFetch.apply(this, arguments); };
    const xOpen = XMLHttpRequest.prototype.open, xSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u) { this.__qpBlock = trackerUrl(u); return xOpen.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function () {
      if (this.__qpBlock) { hit(); const x = this; setTimeout(() => x.dispatchEvent(new ProgressEvent("error")), 0); return; }
      return xSend.apply(this, arguments);
    };
    if (navigator.sendBeacon) { const ob = navigator.sendBeacon.bind(navigator); navigator.sendBeacon = (u, d) => (trackerUrl(u) ? (hit(), false) : ob(u, d)); }
    for (const [C, prop] of [[HTMLScriptElement, "src"], [HTMLImageElement, "src"], [HTMLIFrameElement, "src"], [HTMLLinkElement, "href"]]) {
      const d = Object.getOwnPropertyDescriptor(C.prototype, prop);
      if (!d || !d.set) continue;
      Object.defineProperty(C.prototype, prop, { ...d, set(v) { if (trackerUrl(v)) { hit(); setTimeout(() => this.dispatchEvent(new Event("error")), 0); return; } d.set.call(this, v); } });
    }
    const setAttr = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (n, v) {
      if ((n === "src" || n === "href") && /^(SCRIPT|IMG|IFRAME|LINK)$/.test(this.tagName) && trackerUrl(v)) { hit(); return; }
      return setAttr.call(this, n, v);
    };
    new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        const list = n.matches && n.matches("script[src],img[src],iframe[src],link[href]") ? [n] : [];
        n.querySelectorAll && list.push(...n.querySelectorAll("script[src],img[src],iframe[src]"));
        for (const el of list) if (trackerUrl(el.getAttribute("src") || el.getAttribute("href"))) { el.remove(); hit(); }
      }
    }).observe(document, { childList: true, subtree: true });
    const css = document.createElement("style");
    const BASE_HIDE = "ins.adsbygoogle,.adsbygoogle,[id^='google_ads_'],[id^='div-gpt-ad'],.OUTBRAIN,#taboola-below-article-thumbnails,iframe[src*='doubleclick.net'],iframe[src*='googlesyndication.com'],[id^='taboola-'],[class*='taboola'],[data-ad-slot],[data-google-query-id]";
    // Strict mode also hides common ad containers by name. Patterns are specific to avoid hiding real content.
    const STRICT_HIDE = "[id^='ad-'],[id^='ads-'],[id$='-ad'],[id$='_ad'],[id*='advert'],[class~='ad'],[class~='ads'],[class~='advert'],[class~='advertisement'],[class*='ad-banner'],[class*='ad-container'],[class*='ad-slot'],[class*='ad-wrapper'],[class*='adsbox'],[class*='sponsored-'],[class*='sponsor-'],[class*='-promoted'],[aria-label='advertisement' i],[aria-label='Advertisement'],[data-testid*='ad-'],[data-ad],[data-ad-unit],[data-adunit],[data-ad-client],.ad-unit,.ad-block,.ad-box,.banner-ad,.top-ad,.sidebar-ad,.sticky-ad,.leaderboard,.native-ad,.mrec,.interstitial-ad,.popup-ad,.cookie-ad,#ad,#ads,#advert,#adbox,#banner-ad";
    css.textContent = (BASE_HIDE + (STRICT ? "," + STRICT_HIDE : "")) + "{display:none!important;visibility:hidden!important;height:0!important;min-height:0!important}";
    const addCss = () => (document.head || document.documentElement).appendChild(css);
    document.head || document.documentElement ? addCss() : document.addEventListener("DOMContentLoaded", addCss, { once: true });
  }

  // ---- login capture ---------------------------------------------------------
  // Only REPORTS a submitted login (username + password) to the browser, which asks the person before saving anything.
  let lastLogin = "";
  const seenLogin = (form) => {
    try {
      const pws = form.querySelectorAll("input[type=password]");
      const pw = pws[0];
      if (!pw || !pw.value || pws.length > 2) return;
      const cands = Array.from(form.querySelectorAll("input")).filter((i) => i !== pw && /^(text|email|tel)$/i.test(i.type || "text") && i.value);
      const user = cands.filter((i) => i.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING).pop() || cands[0];
      const key = (user ? user.value : "") + "\u0000" + pw.value;
      if (key === lastLogin) return;
      lastLogin = key;
      setTimeout(() => { lastLogin = ""; }, 3000);
      invoke("qp_login_seen", { username: user ? user.value : "", password: pw.value });
    } catch (_) { /* never break the page */ }
  };
  document.addEventListener("submit", (e) => { if (e.target instanceof HTMLFormElement) seenLogin(e.target); }, true);
  document.addEventListener("click", (e) => {
    const b = e.target && e.target.closest && e.target.closest("button,input[type=submit],[role=button]");
    const f = b && (b.form || b.closest("form"));
    if (f && f.querySelector("input[type=password]")) setTimeout(() => seenLogin(f), 0); // sites that log in with JS and skip "submit"
  }, true);

  // ---- cookie banners ----------------------------------------------------------
  // Clicks "Reject / Decline / Necessary only" on consent banners. It never clicks "Accept", and only touches
  // buttons that sit inside something that looks like a consent banner.
  const COOKIES = __QP_COOKIES__;
  // <cookie-matchers>
  const REJECT_RE = /^(reject( all| additional| non-?essential| optional)?( cookies)?|decline( all| optional)?( cookies)?|deny( all)?( cookies)?|refuse( all)?( cookies)?|disagree|i do not accept|do not accept|no,? thanks|no thank you|(use |allow |accept |continue with )?(only )?(strictly )?(necessary|essential|required)( cookies)?( only)?|continue without (accepting|agreeing)|(save|confirm) (my )?(choices|preferences) ?(only necessary)?)$/i;
  const ACCEPT_ALL_RE = /(accept|allow|agree( to)?|consent( to)?) (all|everything)|^(accept|agree|ok|okay|got it|i agree|i accept)( cookies)?$/i;
  const CONSENT_RE = /cookie|consent|gdpr|ccpa|cmp|onetrust|cookiebot|didomi|usercentrics|osano|truste|qc-cmp|sp_message|cookieyes|cky-|cc-window|cookieconsent|privacy-?(banner|notice|center)/i;
  const normLabel = (t) => String(t || "").replace(/\s+/g, " ").replace(/[.!:\u2192>\u203a]+$/g, "").trim().toLowerCase();
  const isRejectLabel = (t) => { const n = normLabel(t); return n.length > 0 && n.length <= 60 && REJECT_RE.test(n) && !ACCEPT_ALL_RE.test(n); };
  const isConsentAttr = (v) => CONSENT_RE.test(String(v || ""));
  // </cookie-matchers>
  if (COOKIES) {
    const KNOWN = ["#onetrust-reject-all-handler", ".ot-pc-refuse-all-handler", "#CybotCookiebotDialogBodyButtonDecline", "#didomi-notice-disagree-button", ".didomi-continue-without-agreeing", "button.osano-cm-denyAll", "[data-testid='uc-deny-all-button']", ".cky-btn-reject", "button#cookie-reject", ".cc-deny"];
    const shown = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"; };
    const inConsent = (el) => {
      for (let n = el, d = 0; n && n.nodeType === 1 && d < 9; n = n.parentElement, d++) {
        if (isConsentAttr(n.id) || isConsentAttr(typeof n.className === "string" ? n.className : "") || isConsentAttr(n.getAttribute("aria-label"))) return true;
        if ((n.getAttribute("role") === "dialog" || n.getAttribute("role") === "alertdialog") && /cookie/i.test(n.textContent || "")) return true;
      }
      return false;
    };
    let clicks = 0, tries = 0;
    const sweep = () => {
      if (clicks >= 3) return;
      try {
        for (const sel of KNOWN) { const el = document.querySelector(sel); if (el && shown(el)) { el.click(); clicks++; return; } }
        for (const el of document.querySelectorAll("button, a[role=button], [role=button], input[type=button], input[type=submit]")) {
          if (!shown(el)) continue;
          if (isRejectLabel(el.value || el.getAttribute("aria-label") || el.textContent) && inConsent(el)) { el.click(); clicks++; return; }
        }
      } catch (_) { /* never break the page */ }
    };
    const timer = setInterval(() => { sweep(); if (++tries > 24 || clicks >= 3) clearInterval(timer); }, 500); // first 12 seconds
  }

  // ---- reader mode ---------------------------------------------------------
  const READER_BAD = "script,style,noscript,nav,aside,footer,form,iframe,button,svg,canvas,video,audio,object,embed,select,input,textarea,[role=navigation],[role=banner],[aria-hidden=true]";
  const READER_OK = new Set("h1 h2 h3 h4 h5 h6 p ul ol li blockquote pre code em strong b i a img figure figcaption br hr table thead tbody tr th td sup sub".split(" "));
  const tlen = (el) => (el.textContent || "").replace(/\s+/g, " ").trim().length;
  const rscore = (el) => {
    let s = 0;
    el.querySelectorAll("p").forEach((p) => { const t = tlen(p); if (t > 40) s += t; });
    const links = Array.from(el.querySelectorAll("a")).reduce((n, a) => n + tlen(a), 0);
    return s * (1 - Math.min(links / (tlen(el) || 1), 0.9));
  };
  const httpUrl = (u) => { try { const x = new URL(u, location.href); return /^https?:$/.test(x.protocol) ? x.href : null; } catch (_) { return null; } };
  function readerClean(node, doc) {
    const out = doc.createDocumentFragment();
    for (const c of Array.from(node.childNodes)) {
      if (c.nodeType === 3) { out.appendChild(doc.createTextNode(c.textContent)); continue; }
      if (c.nodeType !== 1 || c.matches(READER_BAD)) continue;
      const tag = c.tagName.toLowerCase();
      if (!READER_OK.has(tag)) { out.appendChild(readerClean(c, doc)); continue; } // unwrap div/span/section…
      const el = doc.createElement(tag);
      if (tag === "a") { const h = httpUrl(c.getAttribute("href")); if (h) { el.setAttribute("href", h); el.setAttribute("rel", "noopener noreferrer"); } }
      if (tag === "img") {
        const src = httpUrl(c.currentSrc || c.getAttribute("src") || c.getAttribute("data-src"));
        if (!src) continue;
        el.setAttribute("src", src); el.setAttribute("alt", c.getAttribute("alt") || ""); el.setAttribute("loading", "lazy");
      } else el.appendChild(readerClean(c, doc));
      if ((tag === "p" || tag === "li" || /^h\d$/.test(tag)) && !el.textContent.trim() && !el.querySelector("img")) continue;
      out.appendChild(el);
    }
    return out;
  }
  function readerExtract(doc) {
    const cands = Array.from(doc.querySelectorAll("article,main,[role=main],div,section")).map((el) => [el, rscore(el)]);
    const max = Math.max(0, ...cands.map((c) => c[1]));
    if (max < 200) return null;
    // Ancestors always out-score their children, so take the most specific block that holds most of the text.
    const best = cands.filter((c) => c[1] >= max * 0.85).sort((a, b) => tlen(a[0]) - tlen(b[0]))[0][0];
    const h1 = best.querySelector("h1") || doc.querySelector("h1");
    const author = doc.querySelector('meta[name=author]');
    return {
      title: (h1 && h1.textContent.trim()) || doc.title,
      byline: (author && author.content) || "",
      site: location.hostname.replace(/^www\./, ""),
      body: readerClean(best, doc),
    };
  }
  window.__qpReader = () => {
    const open = document.getElementById("__qp_reader");
    if (open) { open.remove(); document.documentElement.style.overflow = open.__prev || ""; return; }
    const art = readerExtract(document);
    const host = document.createElement("div");
    host.id = "__qp_reader";
    host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647";
    host.__prev = document.documentElement.style.overflow;
    const root = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = ":host{all:initial}.r{position:fixed;inset:0;overflow:auto;font:var(--fs,19px)/1.7 Georgia,'Iowan Old Style',serif;background:var(--bg);color:var(--fg);--bg:#fff;--fg:#1f2937;--mut:#6b7280;--ln:#2563eb}.r.sepia{--bg:#f4ecd8;--fg:#433422;--mut:#7b6a52;--ln:#8a4b08}.r.dark{--bg:#111827;--fg:#e5e7eb;--mut:#9ca3af;--ln:#60a5fa}@media (prefers-color-scheme:dark){.r:not(.sepia):not(.light){--bg:#111827;--fg:#e5e7eb;--mut:#9ca3af;--ln:#60a5fa}}.bar{position:sticky;top:0;display:flex;gap:6px;justify-content:flex-end;padding:10px 14px;background:linear-gradient(var(--bg),transparent);font:13px system-ui,sans-serif}.bar button{border:1px solid var(--mut);background:var(--bg);color:var(--fg);border-radius:8px;padding:5px 10px;cursor:pointer}article{max-width:42em;margin:0 auto;padding:10px 22px 90px}h1{font-size:1.9em;line-height:1.25;margin:.4em 0 .2em}.m{color:var(--mut);font:14px system-ui,sans-serif;margin-bottom:1.6em}img{max-width:100%;height:auto;border-radius:6px}a{color:var(--ln)}pre{overflow:auto;background:rgba(127,127,127,.15);padding:12px;border-radius:8px;font-size:.8em}code{font-size:.9em}blockquote{border-left:3px solid var(--mut);margin-left:0;padding-left:1em;color:var(--mut)}table{border-collapse:collapse}td,th{border:1px solid var(--mut);padding:4px 8px}";
    const wrap = document.createElement("div");
    wrap.className = "r";
    const bar = document.createElement("div");
    bar.className = "bar";
    const mk = (label, fn) => { const b = document.createElement("button"); b.textContent = label; b.onclick = fn; bar.appendChild(b); return b; };
    let fs = 19;
    const themes = ["auto", "light", "sepia", "dark"]; let ti = 0;
    mk("A−", () => { fs = Math.max(13, fs - 2); wrap.style.setProperty("--fs", fs + "px"); });
    mk("A+", () => { fs = Math.min(32, fs + 2); wrap.style.setProperty("--fs", fs + "px"); });
    mk("Theme", () => { ti = (ti + 1) % themes.length; wrap.className = "r " + (themes[ti] === "auto" ? "" : themes[ti]); });
    mk("✕ Close", () => window.__qpReader());
    const article = document.createElement("article");
    if (art) {
      const h = document.createElement("h1"); h.textContent = art.title;
      const m = document.createElement("div"); m.className = "m"; m.textContent = [art.byline, art.site].filter(Boolean).join(" · ");
      article.append(h, m, art.body);
    } else {
      const p = document.createElement("p"); p.textContent = "Reader mode could not find an article on this page.";
      article.appendChild(p);
    }
    wrap.append(bar, article);
    root.append(style, wrap);
    document.documentElement.style.overflow = "hidden";
    document.documentElement.appendChild(host);
    const esc = (e) => { if (e.key === "Escape" && document.getElementById("__qp_reader")) { window.__qpReader(); removeEventListener("keydown", esc, true); } };
    addEventListener("keydown", esc, true);
  };
  window.__qpReader.extract = readerExtract;

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
    // Translate: collect visible text nodes, apply translated text by index, restore the original.
    collect_text() {
      const SKIP = "script,style,noscript,code,pre,textarea,input,select,svg,canvas,[contenteditable],[translate=no],.notranslate,[aria-hidden=true]";
      const nodes = [], items = []; let total = 0;
      const w = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n && items.length < 700 && total < 26000; n = w.nextNode()) {
        const t = n.nodeValue.replace(/\s+/g, " ").trim();
        const el = n.parentElement;
        if (t.length < 2 || !/\p{L}/u.test(t) || !el || el.closest(SKIP) || !(el.offsetWidth || el.offsetHeight || el.getClientRects().length)) continue;
        nodes.push(n); items.push([items.length, t.slice(0, 1200)]); total += t.length;
      }
      window.__qpTx = { nodes, orig: new Map(window.__qpTx ? window.__qpTx.orig : []) };
      return { items, total, lang: document.documentElement.lang || "" };
    },
    apply_text({ pairs }) {
      const tx = window.__qpTx; if (!tx || !Array.isArray(pairs)) return { error: "Nothing collected" };
      let n = 0;
      for (const p of pairs) {
        const node = tx.nodes[p[0]]; const text = p[1];
        if (!node || !node.isConnected || typeof text !== "string" || text.length > 2400) continue;
        if (!tx.orig.has(node)) tx.orig.set(node, node.nodeValue);
        const lead = (node.nodeValue.match(/^\s*/) || [""])[0], trail = (node.nodeValue.match(/\s*$/) || [""])[0];
        node.nodeValue = lead + text + trail; n++;
      }
      return { applied: n };
    },
    restore_text() {
      const tx = window.__qpTx; if (!tx) return { restored: 0 };
      let n = 0; for (const [node, v] of tx.orig) { if (node.isConnected) { node.nodeValue = v; n++; } }
      tx.orig.clear(); return { restored: n };
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
    ["f", false, "find"], ["y", false, "library"], ["r", true, "reader"], ["b", true, "bookmarks-bar"], ["=", false, "zoom-in"], ["+", true, "zoom-in"],
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
