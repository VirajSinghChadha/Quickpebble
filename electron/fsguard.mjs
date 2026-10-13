// Where file actions may happen. Every move, rename or trash the app does on the person's files goes through checkPath first:
// the path must sit inside a folder the person chose for that task, must not be in a protected folder (theirs or the system's),
// and is resolved through symlinks so "Downloads/link -> /System" can't sneak out. Pure apart from reading the file system.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const MAX_PROTECTED = 50;

/** Folders nothing inside of is ever touched: the operating system's own. */
export function systemDeep(platform = process.platform) {
  if (platform === "darwin") return ["/System", "/usr", "/bin", "/sbin", "/etc", "/private/etc", "/private/var/db", "/Library/Apple", "/cores"];
  if (platform === "win32") return ["C:\\Windows", "C:\\Program Files\\WindowsApps"];
  return ["/bin", "/boot", "/dev", "/etc", "/lib", "/lib64", "/proc", "/sbin", "/sys", "/usr"];
}

/** Folders that are never moved or trashed as a whole (things inside them can be, when the person picked them). */
export function systemExact(platform = process.platform, home = os.homedir()) {
  const mine = ["", "Library", "Documents", "Desktop", "Downloads", "Pictures", "Music", "Movies", "Applications", "AppData", "Library/Caches"].map((p) => path.join(home, p));
  if (platform === "darwin") return [...mine, "/", "/Applications", "/Library", "/Users", "/Volumes", "/private", "/opt"];
  if (platform === "win32") return [...mine, "C:\\", "C:\\Users", "C:\\Program Files", "C:\\Program Files (x86)", "C:\\ProgramData"];
  return [...mine, "/", "/home", "/opt", "/var", "/root"];
}

const fold = (p, platform) => (platform === "win32" || platform === "darwin" ? p.toLowerCase() : p);
const same = (a, b, platform) => fold(path.resolve(a), platform) === fold(path.resolve(b), platform);

/** Is `child` the folder `parent` or somewhere inside it? Compares resolved paths; case-insensitive on macOS and Windows. */
export function isInside(child, parent, platform = process.platform) {
  const c = fold(path.resolve(child), platform);
  const p = fold(path.resolve(parent), platform);
  if (c === p) return true;
  const rel = path.relative(p, c);
  return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/** The real location of a folder (all symlinks followed). For a folder that doesn't exist yet, its nearest existing parent is
 *  resolved and the rest added back, so "/var/x/New" and "/private/var/x" (the same place on macOS) still compare equal. */
function realDir(p, realpath) {
  let dir = path.resolve(p);
  const rest = [];
  for (let i = 0; i < 64; i++) {
    try { return path.join(realpath(dir), ...rest); }
    catch {
      const up = path.dirname(dir);
      if (up === dir) break;
      rest.unshift(path.basename(dir));
      dir = up;
    }
  }
  return path.resolve(p);
}

/** The real location of a file: symlinks in its folders are followed. The last part is kept as is (moving a link moves the link). */
export function realPath(p, realpath = fs.realpathSync.native) {
  const abs = path.resolve(p);
  return path.join(realDir(path.dirname(abs), realpath), path.basename(abs));
}

/** Reads the person's protected folders from the setting (a JSON list). Junk is dropped. */
export function parseProtected(json) {
  try {
    const list = JSON.parse(json ?? "[]");
    return Array.isArray(list) ? [...new Set(list.filter((p) => typeof p === "string" && p.length < 1024 && path.isAbsolute(p)).map((p) => path.resolve(p)))].slice(0, MAX_PROTECTED) : [];
  } catch { return []; }
}

/**
 * Why this path can't be acted on, or null if it can.
 * roots: folders the person chose for this task; the path must be strictly inside one of them.
 * guarded: the person's protected folders; nothing inside them is touched.
 */
export function checkPath(p, { roots = [], guarded = [], platform = process.platform, home = os.homedir(), realpath = fs.realpathSync.native } = {}) {
  if (typeof p !== "string" || !p || p.length > 4096 || p.includes("\0")) return "That isn't a usable file path.";
  if (!path.isAbsolute(p)) return "Only full file paths can be used.";
  const real = realPath(p, realpath);
  for (const g of guarded) if (isInside(real, realDir(g, realpath), platform) || isInside(p, g, platform)) return `“${path.basename(g) || g}” is a protected folder.`;
  for (const s of systemDeep(platform)) if (isInside(real, s, platform)) return "System folders are never changed.";
  for (const s of systemExact(platform, home)) if (same(real, s, platform) || same(p, s, platform)) return "That folder is too important to move or delete as a whole.";
  if (!roots.length) return "No folder was chosen for this task.";
  if (!roots.some((r) => { const rr = realDir(r, realpath); return isInside(real, rr, platform) && !same(real, rr, platform); })) return "That is outside the folders chosen for this task.";
  return null;
}

/** Can the person pick this folder as a place for a task to work in? (Not a system folder, not inside a protected one.) */
export function checkRoot(dir, { guarded = [], platform = process.platform, realpath = fs.realpathSync.native } = {}) {
  if (typeof dir !== "string" || !path.isAbsolute(dir)) return "Choose a folder.";
  const real = realDir(dir, realpath);
  for (const s of systemDeep(platform)) if (isInside(real, s, platform)) return "System folders can't be used.";
  if (same(real, "/", platform) || /^[a-z]:\\?$/i.test(real)) return "Choose a folder, not the whole disk.";
  for (const g of guarded) if (isInside(real, realDir(g, realpath), platform)) return `“${path.basename(g) || g}” is a protected folder.`;
  return null;
}
