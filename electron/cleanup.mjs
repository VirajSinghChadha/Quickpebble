// Mac clean-up and speed, wired to the safety foundation. Scans only read; every change is a dry-run list the person reviews
// and confirms (see receipts.mjs), lands in the Trash and can be undone. Anything sent to the AI is listed for the person first.
import { app, nativeImage } from "electron";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as ai from "./ai.mjs";
import { cleanSuggestion } from "./downloadsort.mjs";
import { scanDisk, groupRoots, GROUP_TITLES } from "./diskscan.mjs";
import { duBytes, existing, forgottenApps, installedApps, installerFor, LEFTOVER_ROOTS, leftoverCandidates, runningAppPaths } from "./apps.mjs";
import { addLoginItem, addRunKey, frontApp, hasUnsavedWork, loginItems, quitApp, removeLoginItem, removeRunKey, runningApps, slowReport, unusedApps } from "./system.mjs";
import { IMAGE_EXT, needsBetterName, parseVisionKind, PHOTO_PROMPT, photoKind, pngSize, RENAME_PROMPT, renameMode, tidyPlan } from "./tidy.mjs";
import { checkRoot, isInside } from "./fsguard.mjs";

const home = () => os.homedir();
const MAX_RENAME = 30;
const MAX_PHOTO_AI = 40;

/** A small JPEG of a file's first page or the photo itself (macOS/Windows use the system's Quick Look thumbnails). */
async function thumbnailJpeg(p, size = 768) {
  let img = null;
  try { img = await nativeImage.createThumbnailFromPath(p, { width: size, height: size }); } catch { /* not supported here */ }
  if (!img || img.isEmpty()) { img = nativeImage.createFromPath(p); if (!img.isEmpty()) img = img.resize({ width: Math.min(size, img.getSize().width) }); }
  if (!img || img.isEmpty()) throw new Error("Couldn't make a picture of it");
  return img.toJPEG(72).toString("base64");
}

export function createCleanup({ db, safety }) {
  const { tasks, log, guarded } = safety;
  const isGuarded = (p) => guarded().some((g) => isInside(p, g));
  let disk = null, forgotten = [], renameSet = null, photos = null;

  // ---- custom kinds: quitting apps and turning off login items, with undo where possible
  tasks.registerKind("blocked", { check: (it) => it.note || "This can't be done right now.", run: () => null });   // shown, never done
  tasks.registerKind("quit_app", {
    check: (it) => (it.label ? null : "No app named."),
    run: async (it) => {
      if (await hasUnsavedWork(it.label)) throw new Error("It has unsaved work, so it was left open. Save it yourself first.");
      await quitApp(it.label);
      return { logKind: "quit_app", what: `Quit ${it.label}` };
    },
  });
  tasks.registerKind("login_item_off", {
    check: (it) => (it.label ? null : "No login item named."),
    run: async (it) => { await removeLoginItem(it.label); return { logKind: "login_item", what: `Stopped “${it.label}” opening at login`, from: it.data?.path ?? null, to: it.label }; },
  });
  tasks.registerKind("run_key_off", {
    check: (it) => (it.label ? null : "No item named."),
    run: async (it) => { await removeRunKey(it.label); return { logKind: "run_key", what: `Stopped “${it.label}” starting at sign-in`, from: it.data?.value ?? "", to: it.label }; },
  });
  log.register("login_item", (e) => { if (!e.src) throw new Error("There's no record of which app it opened."); return addLoginItem(e.src); });
  log.register("run_key", (e) => addRunKey(e.dst, e.src ?? ""));

  // ---- opt-in: notice which app is in front, so "quit unused apps" knows what you haven't touched. Local only.
  let seen = (() => { try { return JSON.parse(db.getSetting("app_activity_seen") ?? "{}"); } catch { return {}; } })();
  const tick = async () => {
    if (db.getSetting("app_activity") !== "1") { if (seen.since) { seen = {}; db.setSetting("app_activity_seen", "{}"); } return; }
    seen.since ??= Date.now();
    seen.apps ??= {};
    const name = await frontApp().catch(() => null);
    if (name) seen.apps[name.replace(/[‎‏]/g, "")] = Date.now();
    db.setSetting("app_activity_seen", JSON.stringify(seen));
  };
  const timer = setInterval(() => void tick(), 60_000);
  timer.unref?.();

  const commands = {
    // ------------------------------------------------ what's eating my disk
    clean_disk_scan: async () => {
      disk = await scanDisk({ skip: isGuarded });
      const groups = Object.entries(disk.groups).map(([id, items]) => ({ id, title: GROUP_TITLES[id], count: items.length, bytes: items.reduce((s, i) => s + i.size, 0), top: items.slice(0, 5) }));
      return { total: disk.total, partial: disk.partial, scanned: disk.scanned, folders: disk.folders, groups };
    },
    clean_disk_review: (_w, { group }) => {
      if (!disk?.groups[group]) throw new Error("Scan your disk first.");
      return tasks.preview({ title: `Clear ${GROUP_TITLES[group].toLowerCase()}`, roots: groupRoots()[group], items: disk.groups[group].slice(0, 500).map((i) => ({ kind: "trash", path: i.path, size: i.size, note: i.note })) });
    },

    // ------------------------------------------------ installers for apps you already have
    clean_installers: async () => {
      const names = (await installedApps({ withSize: false })).map((a) => a.name);
      const dirs = [path.join(home(), "Downloads"), path.join(home(), "Desktop")];
      const items = [];
      for (const d of dirs) {
        for (const e of await fsp.readdir(d, { withFileTypes: true }).catch(() => [])) {
          const appName = installerFor(e.name, names);
          if (!appName) continue;
          const p = path.join(d, e.name);
          const st = await fsp.stat(p).catch(() => null);
          items.push({ kind: "trash", path: p, size: st?.size ?? null, note: `${appName} is already installed` });
        }
      }
      return tasks.preview({ title: "Remove installers for apps you already have", roots: dirs, items });
    },

    // ------------------------------------------------ forgotten apps
    clean_apps_scan: async (_w, { days }) => {
      const d = Math.min(3650, Math.max(30, Number(days) || 90));
      forgotten = forgottenApps(await installedApps(), d);
      for (const a of forgotten) {
        a.leftovers = existing(leftoverCandidates(home(), a.bundleId, a.name));
        a.leftoverBytes = 0;
        for (const l of a.leftovers) a.leftoverBytes += (await duBytes(l)) ?? 0;
      }
      return forgotten.map(({ name, path: p, lastUsed, size, leftovers, leftoverBytes }) => ({ name, path: p, lastUsed, size, leftovers: leftovers.length, leftoverBytes }));
    },
    clean_apps_review: async (_w, { paths }) => {
      const want = new Set(Array.isArray(paths) ? paths : []);
      const running = await runningAppPaths();
      const items = [];
      for (const a of forgotten.filter((x) => want.has(x.path))) {
        const open = running.has(a.path);
        items.push({ kind: open ? "blocked" : "trash", path: a.path, label: `Move “${path.basename(a.path)}” to the Trash`, size: a.size, note: open ? `${a.name} is open right now. Quit it first.` : `The app${a.lastUsed ? `, last opened ${new Date(a.lastUsed).toLocaleDateString()}` : ", never opened as far as macOS knows"}` });
        for (const l of a.leftovers) items.push({ kind: open ? "blocked" : "trash", path: l, label: `Move “${path.basename(l)}” to the Trash`, size: await duBytes(l), note: `Left behind by ${a.name}` });
      }
      return tasks.preview({ title: "Uninstall apps you don't use", roots: ["/Applications", path.join(home(), "Applications"), ...LEFTOVER_ROOTS(home())], items });
    },

    // ------------------------------------------------ Desktop and Downloads tidy-up
    clean_tidy: async (_w, { folders }) => {
      const dirs = (Array.isArray(folders) ? folders : ["desktop", "downloads"]).filter((f) => ["desktop", "downloads"].includes(f)).map((f) => app.getPath(f));
      const items = [];
      for (const d of dirs) {
        const entries = [];
        for (const e of await fsp.readdir(d, { withFileTypes: true }).catch(() => [])) {
          if (!e.isFile()) continue;
          const st = await fsp.stat(path.join(d, e.name)).catch(() => null);
          entries.push({ name: e.name, isFile: true, size: st?.size ?? null });
        }
        items.push(...tidyPlan(d, entries, (p) => fs.existsSync(p)));
      }
      return tasks.preview({ title: "Tidy up Desktop and Downloads", roots: dirs, items });
    },

    // ------------------------------------------------ rename by content
    clean_rename_candidates: async (_w, { folder }) => {
      const problem = checkRoot(folder, { guarded: guarded() });
      if (problem) throw new Error(problem);
      const files = [];
      for (const e of await fsp.readdir(folder, { withFileTypes: true }).catch(() => [])) {
        if (!e.isFile() || e.name.startsWith(".") || !needsBetterName(e.name)) continue;
        const mode = renameMode(e.name);
        if (!mode) continue;
        const p = path.join(folder, e.name);
        if (isGuarded(p)) continue;
        files.push({ path: p, name: e.name, mode, size: (await fsp.stat(p).catch(() => null))?.size ?? null });
        if (files.length >= MAX_RENAME) break;
      }
      renameSet = { folder, files };
      const cfg = ai.aiConfig(db);
      return { folder, files, provider: cfg.provider, model: cfg.model };
    },
    clean_rename_suggest: async (_w, { paths }) => {
      if (!renameSet) throw new Error("Choose a folder first.");
      const want = new Set(Array.isArray(paths) ? paths : []);
      const cfg = ai.aiConfig(db);
      const items = [], failed = [];
      for (const f of renameSet.files.filter((x) => want.has(x.path))) {
        try {
          const reply = f.mode === "picture"
            ? await ai.vision(cfg, RENAME_PROMPT, `File type: ${path.extname(f.name)}`, await thumbnailJpeg(f.path))
            : await ai.chat(cfg, RENAME_PROMPT, [{ role: "user", content: `File type: ${path.extname(f.name)}\n<<<CONTENT\n${(await fsp.readFile(f.path, "utf8")).slice(0, 2000)}\n>>>CONTENT` }]);
          const name = cleanSuggestion(reply, path.extname(f.name));
          if (!name || /^unknown\./i.test(name)) { failed.push({ name: f.name, error: "The AI couldn't tell what it is." }); continue; }
          items.push({ kind: "rename", path: f.path, to: path.join(renameSet.folder, name), size: f.size, note: `Suggested from its ${f.mode === "picture" ? "picture" : "text"}` });
        } catch (e) { failed.push({ name: f.name, error: String(e.message ?? e).slice(0, 160) }); }
      }
      return { view: tasks.preview({ title: "Rename files by what's in them", roots: [renameSet.folder], items }), failed };
    },

    // ------------------------------------------------ photo triage
    clean_photos_scan: async (_w, { folder }) => {
      const problem = checkRoot(folder, { guarded: guarded() });
      if (problem) throw new Error(problem);
      const found = [];
      const walk = async (dir, depth) => {
        if (depth > 3 || found.length >= 5000) return;
        for (const e of await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])) {
          const p = path.join(dir, e.name);
          if (e.name.startsWith(".") || isGuarded(p)) continue;
          if (e.isDirectory()) { if (!/\.(photoslibrary|app)$/i.test(e.name) && !["Screenshots", "Receipts", "Documents"].includes(e.name)) await walk(p, depth + 1); continue; }
          if (!e.isFile() || !IMAGE_EXT.test(e.name)) continue;
          let dims = null;
          if (/\.png$/i.test(e.name)) { try { const fd = await fsp.open(p, "r"); const { buffer } = await fd.read(Buffer.alloc(24), 0, 24, 0); await fd.close(); dims = pngSize(buffer); } catch { /* unreadable */ } }
          found.push({ path: p, name: e.name, size: (await fsp.stat(p).catch(() => null))?.size ?? null, ...photoKind(e.name, dims) });
        }
      };
      await walk(folder, 0);
      photos = { folder, found };
      return photoPreview(folder, found.filter((f) => f.kind !== "photo"), found.filter((f) => f.kind === "photo").length);
    },
    clean_photos_ai: async (_w, { paths }) => {
      if (!photos) throw new Error("Scan a folder first.");
      const want = new Set(Array.isArray(paths) ? paths.slice(0, MAX_PHOTO_AI) : []);
      const cfg = ai.aiConfig(db);
      const sorted = photos.found.filter((f) => f.kind !== "photo");
      const failed = [];
      for (const f of photos.found.filter((x) => x.kind === "photo" && want.has(x.path))) {
        try {
          const kind = parseVisionKind(await ai.vision(cfg, PHOTO_PROMPT, "What is this?", await thumbnailJpeg(f.path, 512)));
          if (kind !== "photo") sorted.push({ ...f, kind, why: "the AI looked at it" });
        } catch (e) { failed.push({ name: f.name, error: String(e.message ?? e).slice(0, 160) }); }
      }
      return { ...photoPreview(photos.folder, sorted, 0), failed };
    },
    clean_photos_unsure: () => (photos?.found ?? []).filter((f) => f.kind === "photo").slice(0, 200).map((f) => ({ path: f.path, name: f.name, size: f.size })),

    // ------------------------------------------------ why is my Mac slow, quit apps
    system_slow: () => slowReport(),
    apps_running: async (_w, { hours }) => {
      const running = await runningApps();
      const h = Math.min(24 * 30, Math.max(1, Number(hours) || 48));
      const tracking = db.getSetting("app_activity") === "1";
      return { running, tracking, since: seen.since ?? null, unused: tracking && seen.since ? unusedApps(running, seen.apps ?? {}, seen.since, h) : [] };
    },
    apps_quit_review: (_w, { names }) => tasks.preview({
      title: "Quit apps",
      items: (Array.isArray(names) ? names : []).slice(0, 40).map((n) => ({ kind: "quit_app", label: String(n).slice(0, 80), note: "Asked to quit politely, so it can offer to save. Apps with unsaved work are left open." })),
    }),

    // ------------------------------------------------ login items
    login_items: () => loginItems(),
    login_items_review: async (_w, { names }) => {
      const want = new Set(Array.isArray(names) ? names : []);
      const all = await loginItems();
      const agents = path.join(home(), "Library", "LaunchAgents");
      const items = all.filter((i) => want.has(i.name)).map((i) => {
        if (i.kind === "launch_agent") return { kind: "move", path: i.path, to: path.join(agents, "Disabled by Quick Pebble", path.basename(i.path)), note: "Stops after your next log-in. Undo moves it back." };
        if (i.kind === "run_key") return { kind: "run_key_off", label: i.name, data: { value: i.path }, note: "Stops starting at sign-in" };
        return { kind: "login_item_off", label: i.name, data: { path: i.path }, note: "Stops opening at login. Undo adds it back." };
      });
      return tasks.preview({ title: "Stop things starting at login", roots: [agents], items });
    },
  };

  function photoPreview(folder, sorted, unsure) {
    const dest = { screenshot: "Screenshots", receipt: "Receipts", document: "Documents" };
    const items = sorted.filter((f) => dest[f.kind] && path.basename(path.dirname(f.path)) !== dest[f.kind]).map((f) => ({ kind: "move", path: f.path, to: path.join(folder, dest[f.kind], f.name), size: f.size, note: `Looks like a ${f.kind}: ${f.why}` }));
    return { view: tasks.preview({ title: "Sort screenshots and receipts out of your photos", roots: [folder], items }), unsure };
  }

  return { commands, stop: () => clearInterval(timer) };
}
