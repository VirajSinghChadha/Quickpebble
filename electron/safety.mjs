// Safety foundation, wired together: the action log (undo), dry-run tasks with receipts, and the person's protected folders.
// Every later feature that changes files builds on this instead of touching the disk itself.
import { dialog, shell } from "electron";
import path from "node:path";
import { ActionLog } from "./actionlog.mjs";
import { Tasks } from "./receipts.mjs";
import { moveToTrash } from "./trash.mjs";
import { checkRoot, MAX_PROTECTED, parseProtected } from "./fsguard.mjs";

export function createSafety(db) {
  const log = new ActionLog(db);
  const guarded = () => parseProtected(db.getSetting("protected_folders"));
  const tasks = new Tasks(db, log, { guarded, trash: (p) => moveToTrash(p, { systemTrash: (x) => shell.trashItem(x) }) });
  // Settings changed by a task (never the person's own clicks in Settings) can be put back the way they were.
  log.register("setting", (e) => {
    if (db.getSetting(e.what) !== (e.dst ?? undefined)) throw new Error("That setting has been changed again since, so it was left alone.");
    db.setSetting(e.what, e.src ?? "");
  });
  const saveProtected = (list) => db.setSetting("protected_folders", JSON.stringify(list));

  const commands = {
    ...log.commands(),
    ...tasks.commands(),
    protected_list: () => guarded(),
    protected_add: async (w) => {
      const r = await dialog.showOpenDialog(w.win, { title: "Choose a folder Quick Pebble must never touch", properties: ["openDirectory", "createDirectory"] });
      if (r.canceled || !r.filePaths[0]) return guarded();
      const dir = path.resolve(r.filePaths[0]);
      const list = guarded();
      if (list.length >= MAX_PROTECTED) throw new Error(`You can protect up to ${MAX_PROTECTED} folders.`);
      if (!list.includes(dir)) saveProtected([...list, dir]);
      return guarded();
    },
    protected_remove: (_w, { path: p }) => { saveProtected(guarded().filter((x) => x !== p)); return guarded(); },
    /** A folder for a task to work in, picked by the person. Refuses system and protected folders. */
    folder_pick: async (w, { title }) => {
      const r = await dialog.showOpenDialog(w.win, { title: String(title ?? "Choose a folder").slice(0, 100), properties: ["openDirectory"] });
      if (r.canceled || !r.filePaths[0]) return null;
      const problem = checkRoot(r.filePaths[0], { guarded: guarded() });
      if (problem) throw new Error(problem);
      return r.filePaths[0];
    },
  };
  return { log, tasks, guarded, commands };
}
