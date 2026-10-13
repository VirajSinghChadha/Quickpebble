// "Why is my Mac slow?", quitting unused apps, and login items. Reading is done with the system's own tools (ps, lsappinfo,
// osascript, reg); quitting is always a polite "Quit" the app can answer with "Save changes?", never a force-kill.
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const run = (cmd, args, timeout = 15000) => new Promise((resolve, reject) => execFile(cmd, args, { timeout, maxBuffer: 16 * 1024 * 1024, windowsHide: true }, (err, out, errOut) => (err ? reject(new Error(String(errOut || err.message).trim().split("\n").pop())) : resolve(String(out)))));
const soft = (p) => p.catch(() => "");

/** Never offered for quitting: the system's own pieces, the Finder, and Quick Pebble. */
const KEEP_RUNNING = /^(Finder|Dock|SystemUIServer|loginwindow|WindowServer|ControlCenter|NotificationCenter|Spotlight|Quick Pebble|Electron|explorer|Taskmgr|csrss|winlogon|dwm)$/i;

/** ps -axo pid=,pcpu=,rss=,comm= → rows. rss is in KB. */
export function parsePs(out) {
  return String(out).split("\n").map((l) => l.trim().match(/^(\d+)\s+([\d.]+)\s+(\d+)\s+(.+)$/)).filter(Boolean).map((m) => ({ pid: Number(m[1]), cpu: Number(m[2]), mem: Number(m[3]) * 1024, comm: m[4] }));
}

/** Groups processes by the app they belong to ("/Applications/Slack.app/…/Slack Helper" → Slack). System processes stay apart. */
export function groupByApp(rows) {
  const apps = new Map();
  for (const r of rows) {
    const m = r.comm.match(/\/([^/]+)\.app\//);
    const name = m ? m[1] : path.basename(r.comm);
    const isApp = !!m && !/^\/System\//.test(r.comm);
    const g = apps.get(name) ?? { name, cpu: 0, mem: 0, processes: 0, app: isApp, bundle: m ? r.comm.slice(0, r.comm.indexOf(".app/") + 4) : null };
    g.cpu += r.cpu; g.mem += r.mem; g.processes++;
    apps.set(name, g);
  }
  return [...apps.values()].map((g) => ({ ...g, cpu: Math.round(g.cpu * 10) / 10 }));
}

/** The likely culprits, in plain words: heavy on the processor or on memory. */
export function culprits(groups, totalMem) {
  return groups
    .filter((g) => g.cpu >= 25 || g.mem >= Math.max(1.5e9, totalMem * 0.12))
    .sort((a, b) => b.cpu - a.cpu || b.mem - a.mem)
    .slice(0, 8)
    .map((g) => ({ ...g, why: [g.cpu >= 25 ? `using ${Math.round(g.cpu)}% of a processor core` : "", g.mem >= Math.max(1.5e9, totalMem * 0.12) ? `using ${(g.mem / 1e9).toFixed(1)} GB of memory` : ""].filter(Boolean).join(" and "), canQuit: g.app && !KEEP_RUNNING.test(g.name) }));
}

export async function slowReport() {
  const total = os.totalmem();
  if (process.platform === "win32") {
    const out = await soft(run("powershell", ["-NoProfile", "-Command", "Get-Process | Select-Object Id,CPU,WorkingSet64,ProcessName | ConvertTo-Csv -NoTypeInformation"]));
    const rows = out.split("\n").slice(1).map((l) => l.replace(/"/g, "").split(",")).filter((c) => c.length >= 4).map((c) => ({ pid: Number(c[0]), cpu: 0, mem: Number(c[2]) || 0, comm: c[3].trim() }));
    const groups = groupByApp(rows);
    return { cpus: os.cpus().length, load: null, memUsed: total - os.freemem(), memTotal: total, groups: groups.sort((a, b) => b.mem - a.mem).slice(0, 15), culprits: culprits(groups, total), note: "On Windows only memory is measured; processor use is not shown." };
  }
  const groups = groupByApp(parsePs(await run("ps", ["-axo", "pid=,pcpu=,rss=,comm="])));
  const [load1] = os.loadavg();
  const cpus = os.cpus().length;
  return { cpus, load: Math.round(load1 * 100) / 100, memUsed: total - os.freemem(), memTotal: total, groups: groups.sort((a, b) => b.cpu - a.cpu || b.mem - a.mem).slice(0, 15), culprits: culprits(groups, total), note: load1 > cpus ? "Your processor is busier than it can keep up with right now." : "" };
}

/** Parses `lsappinfo list` into { name, type, bundle, pid } (one block per app). */
export function parseLsappinfo(out) {
  return String(out).split(/^\s*\d+\)\s+/m).map((block) => ({
    name: (block.match(/^"([^"]+)"/) ?? [])[1]?.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "").trim(),
    type: (block.match(/type="([^"]+)"/) ?? [])[1],
    bundle: (block.match(/bundle path="([^"]+)"/) ?? [])[1] ?? null,
    pid: Number((block.match(/pid = (\d+)/) ?? [])[1]) || null,
  })).filter((a) => a.name);
}

/** Running apps with windows (what the Dock shows), macOS. */
export async function runningApps() {
  if (process.platform !== "darwin") return [];
  return parseLsappinfo(await soft(run("lsappinfo", ["list"]))).filter((a) => a.type === "Foreground" && !KEEP_RUNNING.test(a.name)).map(({ name, bundle }) => ({ name, bundle }));
}

/** Name of the app in front, without asking for any permission (lsappinfo). */
export async function frontApp() {
  if (process.platform !== "darwin") return null;
  const asn = (await soft(run("lsappinfo", ["front"]))).trim();
  if (!asn) return null;
  const out = await soft(run("lsappinfo", ["info", "-only", "name", asn]));
  return (out.match(/"LSDisplayName"="([^"]+)"/) ?? out.match(/="([^"]+)"/) ?? [])[1] ?? null;
}

/** Apps open but not in front for `hours` (from what Quick Pebble noticed while it was running). */
export function unusedApps(running, lastSeen, since, hours, now = Date.now()) {
  const cutoff = now - hours * 3600_000;
  if (since > cutoff) return [];   // not watching long enough to say
  return running.filter((a) => (lastSeen[a.name] ?? since) <= cutoff).map((a) => ({ ...a, lastSeen: lastSeen[a.name] ?? null }));
}

/** Does any window title say it has unsaved changes? (macOS shows "— Edited"; others show "•" or "*".) Needs Accessibility; null if unknown. */
export async function hasUnsavedWork(app) {
  if (process.platform !== "darwin" || !/^[\p{L}\p{N}][\p{L}\p{N} .&+()'_-]{0,79}$/u.test(app)) return null;
  const script = `tell application "System Events" to tell process ${JSON.stringify(app)} to get name of every window`;
  try {
    const titles = await run("osascript", ["-e", script], 5000);
    return /(—|-)\s*Edited\b|^\s*[•*]|[•*]\s*$/m.test(titles.replace(/, /g, "\n"));
  } catch { return null; }
}

/** Polite quit: the app gets the normal Quit, so it can ask to save. Never force-quits. */
export async function quitApp(name) {
  if (!/^[\p{L}\p{N}][\p{L}\p{N} .&+()'_-]{0,79}$/u.test(name) || KEEP_RUNNING.test(name)) throw new Error("That app can't be quit from here.");
  if (process.platform === "darwin") return run("osascript", ["-e", `tell application ${JSON.stringify(name)} to quit`], 20000);
  if (process.platform === "win32") return run("taskkill", ["/IM", `${name}.exe`]);   // without /F: asks the app to close
  throw new Error("Quitting apps is supported on macOS and Windows.");
}

// ---------------------------------------------------------------- login items

/** Reads a launch agent plist (via plutil, no parsing of our own). */
async function plistJson(file) {
  try { return JSON.parse(await run("plutil", ["-convert", "json", "-o", "-", file])); } catch { return null; }
}

/** What starts when you log in: login items, your own launch agents (macOS), and the Run key (Windows). */
export async function loginItems(home = os.homedir()) {
  const items = [];
  if (process.platform === "darwin") {
    const out = await soft(run("osascript", ["-e", 'tell application "System Events" to get {name, path} of every login item'], 8000));
    const parts = out.trim() ? out.trim().split(", ") : [];
    const half = Math.floor(parts.length / 2);
    for (let i = 0; i < half; i++) items.push({ kind: "login_item", name: parts[i], path: parts[half + i] || null, note: "Opens when you log in" });
    const dir = path.join(home, "Library", "LaunchAgents");
    let files = [];
    try { files = fs.readdirSync(dir).filter((f) => f.endsWith(".plist")); } catch { /* none */ }
    for (const f of files.slice(0, 200)) {
      const p = await plistJson(path.join(dir, f));
      if (!p || p.Disabled === true) continue;
      const prog = p.Program ?? (Array.isArray(p.ProgramArguments) ? p.ProgramArguments[0] : "");
      items.push({ kind: "launch_agent", name: p.Label || f.replace(/\.plist$/, ""), path: path.join(dir, f), note: `Background helper${prog ? `: ${path.basename(String(prog))}` : ""}${p.RunAtLoad ? ", starts at login" : ""}` });
    }
  } else if (process.platform === "win32") {
    const out = await soft(run("reg", ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"]));
    for (const l of out.split("\n")) {
      const m = l.match(/^\s{4}(.+?)\s{4}REG_(?:EXPAND_)?SZ\s{4}(.*)$/);
      if (m) items.push({ kind: "run_key", name: m[1].trim(), path: m[2].trim(), note: "Starts when you sign in" });
    }
  }
  return items;
}

export const LOGIN_NAME = /^[\p{L}\p{N}][\p{L}\p{N} .&+()'_@-]{0,119}$/u;

export async function removeLoginItem(name) {
  if (!LOGIN_NAME.test(name)) throw new Error("Unusual login item name.");
  await run("osascript", ["-e", `tell application "System Events" to delete login item ${JSON.stringify(name)}`], 8000);
}
export async function addLoginItem(appPath) {
  if (!/^\/[^"\n]{1,1000}$/.test(appPath)) throw new Error("Unusual app path.");
  await run("osascript", ["-e", `tell application "System Events" to make login item at end with properties {path:${JSON.stringify(appPath)}, hidden:false}`], 8000);
}
export async function removeRunKey(name) {
  if (!LOGIN_NAME.test(name)) throw new Error("Unusual name.");
  await run("reg", ["delete", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", "/v", name, "/f"]);
}
export async function addRunKey(name, value) {
  if (!LOGIN_NAME.test(name) || /[\n"]/.test(value)) throw new Error("Unusual value.");
  await run("reg", ["add", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", "/v", name, "/d", value, "/f"]);
}
