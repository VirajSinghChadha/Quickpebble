// "What's eating my disk?" Walks the home folder (names and sizes only; no file is opened) and groups what could be cleared:
// old downloads, node_modules folders, app caches, simulator and Xcode build data, and very big files. Nothing is changed here:
// each group becomes a dry-run list the person reviews. The walk has a time and entry budget and says when it stopped early.
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DAY = 86400_000;
export const BIG_FILE = 500 * 1024 * 1024;
export const OLD_DOWNLOAD_DAYS = 90;
// Never walked into (they belong to other apps or are huge libraries the person manages elsewhere).
const SKIP_DIRS = new Set([".Trash", "Library", ".git", "Photos Library.photoslibrary", "Music Library.musiclibrary", ".cache", "AppData", "OneDrive", "Dropbox", "Google Drive", "iCloud Drive (Archive)"]);
const PACKAGE = /\.(photoslibrary|musiclibrary|tvlibrary|app|bundle|framework|fcpbundle|imovielibrary|logicx|band)$/i;

/** On-disk size of an entry (allocated blocks when known, so sparse and cloned files aren't over-counted). */
export const sizeOf = (st) => (Number.isFinite(st.blocks) && st.blocks > 0 ? st.blocks * 512 : Number(st.size) || 0);

/** Places outside the walk whose top-level entries are safe to clear (apps rebuild them). Per platform. */
export function cacheTargets(platform = process.platform, home = os.homedir(), env = process.env) {
  if (platform === "darwin") return [
    { group: "caches", dir: path.join(home, "Library", "Caches"), note: "App cache: rebuilt by the app when needed" },
    { group: "simulators", dir: path.join(home, "Library", "Developer", "CoreSimulator", "Devices"), note: "iOS Simulator device: Xcode recreates simulators you still need" },
    { group: "simulators", dir: path.join(home, "Library", "Developer", "Xcode", "DerivedData"), note: "Xcode build data: rebuilt on the next build" },
    { group: "simulators", dir: path.join(home, "Library", "Developer", "Xcode", "iOS DeviceSupport"), note: "Device support files: downloaded again when a device connects" },
  ];
  if (platform === "win32") return [{ group: "caches", dir: path.join(env.LOCALAPPDATA || path.join(home, "AppData", "Local"), "Temp"), note: "Temporary file" }];
  return [{ group: "caches", dir: path.join(env.XDG_CACHE_HOME || path.join(home, ".cache")), note: "App cache: rebuilt by the app when needed" }];
}

/** Size of a whole folder, within the shared budget. */
async function folderSize(dir, budget, fs) {
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    if (budget.spent()) { budget.partial = true; break; }
    const d = stack.pop();
    let entries;
    try { entries = await fs.readdir(d, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      budget.count++;
      const p = path.join(d, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) { stack.push(p); continue; }
      try { total += sizeOf(await fs.lstat(p)); } catch { /* vanished */ }
    }
  }
  return total;
}

/**
 * Scans `home`. Returns { total, partial, folders: biggest folders, groups: { old_downloads, node_modules, caches, simulators, big_files } }.
 * Every group item is { path, size, note }. `skip(path)` lets protected folders be left out entirely.
 */
export async function scanDisk({ home = os.homedir(), platform = process.platform, now = Date.now(), fs = fsp, maxEntries = 400_000, maxMs = 90_000, skip = () => false, onProgress } = {}) {
  const started = Date.now();
  const budget = { count: 0, partial: false, spent: () => budget.count > maxEntries || Date.now() - started > maxMs };
  const groups = { old_downloads: [], node_modules: [], caches: [], simulators: [], big_files: [] };
  const dirSizes = new Map();
  const downloads = path.join(home, "Downloads");

  // Post-order walk: a folder's size is the sum of its files and subfolders.
  async function walk(dir, depth) {
    if (budget.spent()) { budget.partial = true; return 0; }
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return 0; }
    let total = 0;
    for (const e of entries) {
      if (budget.spent()) { budget.partial = true; break; }
      budget.count++;
      if (budget.count % 5000 === 0) onProgress?.(budget.count);
      const p = path.join(dir, e.name);
      if (e.isSymbolicLink() || skip(p)) continue;
      if (e.isDirectory()) {
        if (depth === 0 && SKIP_DIRS.has(e.name)) continue;
        if (e.name === "node_modules") {
          const s = await folderSize(p, budget, fs);
          groups.node_modules.push({ path: p, size: s, note: `Installed packages for ${path.basename(dir)}: run “npm install” there to get them back` });
          total += s;
          continue;
        }
        if (PACKAGE.test(e.name) || SKIP_DIRS.has(e.name)) { total += await folderSize(p, budget, fs); continue; }
        total += await walk(p, depth + 1);
        continue;
      }
      let st;
      try { st = await fs.lstat(p); } catch { continue; }
      const s = sizeOf(st);
      total += s;
      if (s >= BIG_FILE) groups.big_files.push({ path: p, size: s, note: `Big file, last changed ${new Date(st.mtimeMs).toLocaleDateString()}` });
    }
    if (depth <= 2) dirSizes.set(dir, total);
    return total;
  }

  const total = await walk(home, 0);

  // Downloads: top-level things not changed or opened for a long time.
  try {
    for (const e of await fs.readdir(downloads, { withFileTypes: true })) {
      if (e.name.startsWith(".") || /\.(crdownload|download|part)$/i.test(e.name)) continue;
      const p = path.join(downloads, e.name);
      if (skip(p)) continue;
      const st = await fs.lstat(p).catch(() => null);
      if (!st) continue;
      const last = Math.max(st.mtimeMs, st.atimeMs || 0);
      const days = Math.floor((now - last) / DAY);
      if (days >= OLD_DOWNLOAD_DAYS) groups.old_downloads.push({ path: p, size: e.isDirectory() ? dirSizes.get(p) ?? await folderSize(p, budget, fs) : sizeOf(st), note: `Not opened or changed for ${days} days` });
    }
  } catch { /* no Downloads folder */ }

  for (const t of cacheTargets(platform, home)) {
    let entries;
    try { entries = await fs.readdir(t.dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const p = path.join(t.dir, e.name);
      if (e.isSymbolicLink() || skip(p) || e.name.startsWith(".")) continue;
      const size = e.isDirectory() ? await folderSize(p, budget, fs) : sizeOf(await fs.lstat(p).catch(() => ({ size: 0 })));
      if (size >= 1024 * 1024) groups[t.group].push({ path: p, size, note: t.note });
    }
  }

  for (const g of Object.values(groups)) g.sort((a, b) => b.size - a.size);
  const folders = [...dirSizes.entries()].filter(([d]) => d !== home).map(([d, size]) => ({ path: d, size })).sort((a, b) => b.size - a.size).slice(0, 15);
  return { total, partial: budget.partial, scanned: budget.count, folders, groups, rootsFor: groupRoots(home, platform) };
}

/** The folder(s) each group may act in: the dry run refuses anything outside them. */
export function groupRoots(home = os.homedir(), platform = process.platform) {
  const caches = cacheTargets(platform, home);
  return {
    old_downloads: [path.join(home, "Downloads")],
    node_modules: [home],
    caches: caches.filter((c) => c.group === "caches").map((c) => c.dir),
    simulators: caches.filter((c) => c.group === "simulators").map((c) => c.dir),
    big_files: [home],
  };
}

export const GROUP_TITLES = {
  old_downloads: "Old downloads",
  node_modules: "node_modules folders",
  caches: "App caches",
  simulators: "Simulator and Xcode data",
  big_files: "Very big files",
};
