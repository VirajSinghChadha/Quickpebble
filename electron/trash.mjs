// Sending files to the Trash in a way that can be undone. On macOS and Linux the file is moved into the person's own Trash
// folder, so we know exactly where it went and Undo can bring it back. Windows' Recycle Bin hides where things go, so there
// the system call is used and Undo points the person to the Recycle Bin instead. Nothing here ever deletes permanently.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** The Trash folder files from the home volume go to, or null where we can't know (Windows). */
export function trashDir(platform = process.platform, home = os.homedir(), env = process.env) {
  if (platform === "darwin") return path.join(home, ".Trash");
  if (platform === "win32") return null;
  return path.join(env.XDG_DATA_HOME || path.join(home, ".local", "share"), "Trash", "files");
}

/** A free name inside the Trash: "report.pdf", then "report 2.pdf", "report 3.pdf" … like Finder. */
export function trashTarget(dir, name, exists) {
  const ext = path.extname(name);
  const stem = path.basename(name, ext);
  for (let n = 1; n < 10000; n++) {
    const p = path.join(dir, n === 1 ? name : `${stem} ${n}${ext}`);
    if (!exists(p)) return p;
  }
  return path.join(dir, `${stem} ${Date.now()}${ext}`);
}

/** Freedesktop trash needs a small note saying where the file came from, so the file manager can put it back too. */
export function trashInfo(original, at = new Date()) {
  const stamp = at.toISOString().slice(0, 19);
  return `[Trash Info]\nPath=${encodeURI(original)}\nDeletionDate=${stamp}\n`;
}

/**
 * Moves a file or folder to the Trash. Returns where it went (null if only the system knows, as on Windows or another disk).
 * `systemTrash` is Electron's shell.trashItem, used whenever we can't do it ourselves.
 */
export async function moveToTrash(p, { systemTrash, platform = process.platform, home = os.homedir() } = {}) {
  const dir = trashDir(platform, home);
  const sameDisk = (() => { try { return !!dir && fs.statSync(p).dev === fs.statSync(path.dirname(dir)).dev; } catch { return false; } })();
  if (!dir || !sameDisk) {
    if (!systemTrash) throw new Error("The Trash isn't available here.");
    await systemTrash(p);
    return null;
  }
  fs.mkdirSync(dir, { recursive: true });
  const to = trashTarget(dir, path.basename(p), (x) => fs.existsSync(x));
  fs.renameSync(p, to);
  if (platform !== "darwin") {
    try { fs.mkdirSync(path.join(path.dirname(dir), "info"), { recursive: true }); fs.writeFileSync(path.join(path.dirname(dir), "info", `${path.basename(to)}.trashinfo`), trashInfo(p)); }
    catch { /* the file is in the Trash either way; only the file manager's "restore" note is missing */ }
  }
  return to;
}
