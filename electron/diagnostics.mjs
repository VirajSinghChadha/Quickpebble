// "Report a problem": a short, redacted diagnostic log the person can choose to attach. It only ever contains recent warnings and
// errors from the app itself plus version info: no page contents, no passwords, no keys. They see exactly what is sent before sending.
import os from "node:os";

const MAX_LINES = 300;
const MAX_LINE = 300;
const lines = [];

/** Removes anything that looks like a secret, an email address, a personal folder or a URL's query string. */
export function redact(text) {
  return String(text)
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "[google-key]")
    .replace(/sb_(?:publishable|secret)_[0-9A-Za-z_-]+/g, "[supabase-key]")
    .replace(/eyJ[0-9A-Za-z_-]{8,}\.[0-9A-Za-z_-]{8,}\.[0-9A-Za-z_-]{8,}/g, "[token]")
    .replace(/xsmtpsib-[0-9A-Za-z_-]+/g, "[smtp-key]")
    .replace(/\b(?:sk|pk)-[0-9A-Za-z_-]{16,}/g, "[api-key]")
    .replace(/(Bearer|Basic)\s+[0-9A-Za-z._~+/=-]{8,}/gi, "$1 [token]")
    .replace(/([?&](?:key|token|apikey|api_key|access_token|refresh_token|code|password|pass|secret)=)[^&\s"']+/gi, "$1[removed]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/\/Users\/[^/\s"']+/g, "/Users/~")
    .replace(/C:\\Users\\[^\\\s"']+/gi, "C:\\Users\\~")
    .replace(/(https?:\/\/[^\s"'?#]+)\?[^\s"']*/g, "$1?[query removed]");
}

const record = (level, args) => {
  try {
    const text = args.map((a) => (a instanceof Error ? `${a.message}` : typeof a === "string" ? a : JSON.stringify(a))).join(" ");
    lines.push(`${new Date().toISOString().slice(11, 19)} ${level} ${redact(text).replace(/\s+/g, " ").slice(0, MAX_LINE)}`);
    if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
  } catch { /* logging must never break the app */ }
};

let installed = false;
/** Keeps the app's own warnings and errors in a small ring buffer. Call once, early. */
export function installDiagnostics() {
  if (installed) return;
  installed = true;
  for (const level of ["warn", "error"]) {
    const original = console[level].bind(console);
    console[level] = (...args) => { record(level, args); original(...args); };
  }
  process.on("uncaughtException", (e) => record("fatal", [e]));
  process.on("unhandledRejection", (e) => record("rejection", [e instanceof Error ? e : String(e)]));
}
export const noteProblem = (what) => record("note", [what]);
export const recentLines = () => [...lines];

/** The text that would be attached. `settings` is a plain object of harmless preferences. */
export function buildReport({ version, electron, chrome, settings = {}, includeLog, extra = [] }) {
  const head = [
    `Quick Pebble ${version}`,
    `${os.platform()} ${os.release()} (${os.arch()}), Electron ${electron}, Chromium ${chrome}`,
    `Settings: ${Object.entries(settings).map(([k, v]) => `${k}=${String(v).slice(0, 40)}`).join(", ") || "defaults"}`,
  ];
  const log = includeLog ? ["", "Recent warnings and errors:", ...(extra.length || lines.length ? [...extra, ...lines] : ["(none)"])] : [];
  return redact([...head, ...log].join("\n")).slice(0, 30000);
}
