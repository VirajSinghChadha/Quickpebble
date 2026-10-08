// Minimal WebExtension API surface handed to content scripts as `chrome` / `browser`.
// Only storage and a few harmless runtime helpers exist; everything else is intentionally absent.
(function (ID, MANIFEST) {
  var mem = {};
  var KEY = "__qpx:" + ID;
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (_) { return mem; }
  }
  function save(o) {
    try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (_) { mem = o; }
  }
  function area() {
    function done(cb, v) { if (typeof cb === "function") { try { cb(v); } catch (_) {} } return Promise.resolve(v); }
    return {
      get: function (keys, cb) {
        if (typeof keys === "function") { cb = keys; keys = null; }
        var all = load(), out = {};
        if (keys == null) out = all;
        else if (typeof keys === "string") { if (keys in all) out[keys] = all[keys]; }
        else if (Array.isArray(keys)) keys.forEach(function (k) { if (k in all) out[k] = all[k]; });
        else Object.keys(keys).forEach(function (k) { out[k] = k in all ? all[k] : keys[k]; });
        return done(cb, out);
      },
      set: function (items, cb) { var all = load(); Object.assign(all, items); save(all); return done(cb, undefined); },
      remove: function (keys, cb) { var all = load(); [].concat(keys).forEach(function (k) { delete all[k]; }); save(all); return done(cb, undefined); },
      clear: function (cb) { save({}); return done(cb, undefined); },
    };
  }
  var noEvent = { addListener: function () {}, removeListener: function () {}, hasListener: function () { return false; } };
  var shim = {
    runtime: {
      id: ID,
      lastError: null,
      getManifest: function () { return MANIFEST; },
      getURL: function () { return ""; },
      sendMessage: function () { return Promise.resolve(undefined); },
      onMessage: noEvent,
    },
    storage: { local: area(), sync: area(), onChanged: noEvent },
    i18n: { getMessage: function (k) { return k; }, getUILanguage: function () { return navigator.language; } },
  };
  return shim;
})
