import { useEffect, useState, type ReactNode } from "react";
import { AppWindow, FileImage, FolderTree, Gauge, HardDrive, Package, Power, Sparkles, Wand2 } from "lucide-react";
import { ipc, type DiskReport, type ForgottenApp, type LoginItem, type RenameCandidates, type SlowReport, type TaskView } from "../lib/ipc";
import { formatBytes, timeAgo } from "../lib/format";
import { useReview } from "../store/useReview";
import { useStore } from "../store/useStore";
import { Modal, ModalHeader } from "./Modal";

const btn = "rounded-lg border border-border px-3 py-1.5 hover:bg-surface-secondary disabled:opacity-40";
const primary = "rounded-lg bg-primary px-3 py-1.5 font-medium text-white disabled:opacity-40 dark:text-bg";

/** One tool: a title, a plain explanation, and its controls. Errors and "working" are shown in the same place for each. */
function Tool({ icon, title, hint, children, label }: { icon: ReactNode; title: string; hint: string; children: ReactNode; label: string }) {
  return (
    <section aria-label={label} className="rounded-2xl border border-border p-4">
      <h3 className="mb-1 flex items-center gap-2 font-semibold">{icon} {title}</h3>
      <p className="mb-3 text-[12px] text-text-secondary">{hint}</p>
      {children}
    </section>
  );
}

/** Runs a step, shows "working" and any error. */
function useRun() {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const run = async <T,>(what: string, fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(what); setErr(null);
    try { return await fn(); } catch (e) { setErr(String(e)); return undefined; } finally { setBusy(null); }
  };
  return { busy, err, run };
}
const review = (v: TaskView | undefined) => { if (v) useReview.getState().open(v); };
const Status = ({ busy, err }: { busy: string | null; err: string | null }) => (<>
  {busy && <p role="status" className="mt-2 flex items-center gap-2 text-[12px] text-text-secondary"><span className="size-3 animate-spin rounded-full border-2 border-border border-t-primary" /> {busy}</p>}
  {err && <p role="alert" className="mt-2 text-[12px] text-red-500">{err}</p>}
</>);
const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);

export function CleanupPanel() {
  const close = () => useStore.getState().setOverlay(null);
  return (
    <Modal onClose={close} label="Clean up your Mac" width="max-w-3xl">
      <ModalHeader title={isMac ? "Clean up your Mac" : "Clean up your computer"} onClose={close} />
      <div className="space-y-3 overflow-y-auto px-5 pb-5">
        <p className="text-[12px] text-text-secondary">Every tool here only looks until you say otherwise. You always see the full list first, untick what you want to keep, and confirm. Deleting means the Trash, your protected folders are never touched, and every change can be undone from Recent changes.</p>
        <DiskTool />
        <InstallersTool />
        <AppsTool />
        <TidyTool />
        <RenameTool />
        <PhotosTool />
        <SlowTool />
        <QuitTool />
        <LoginTool />
      </div>
    </Modal>
  );
}

function DiskTool() {
  const { busy, err, run } = useRun();
  const [r, setR] = useState<DiskReport | null>(null);
  return (
    <Tool label="Disk" icon={<HardDrive size={16} className="text-primary" />} title="Find what's eating your disk" hint="Looks at the names and sizes of the files in your home folder (nothing is opened or sent anywhere) and groups what could go: old downloads, node_modules folders, app caches, simulator and Xcode data, and very big files.">
      <button type="button" className={primary} disabled={!!busy} onClick={() => void run("Scanning your home folder… this can take a minute", async () => setR(await ipc.cleanDiskScan()))}>{r ? "Scan again" : "Scan my disk"}</button>
      {r && (
        <div className="mt-3 space-y-3">
          <p className="text-[12.5px]">{formatBytes(r.total)} in your home folder ({r.scanned.toLocaleString()} items looked at).{r.partial && " The scan stopped early to stay quick, so some things may be missing."}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {r.groups.map((g) => (
              <div key={g.id} className="rounded-xl border border-border p-3">
                <p className="font-medium">{g.title}</p>
                <p className="text-[12px] text-text-secondary">{g.count ? `${g.count} item${g.count === 1 ? "" : "s"} · ${formatBytes(g.bytes)}` : "Nothing found"}</p>
                {g.top.slice(0, 3).map((t) => <p key={t.path} className="truncate text-[11px] text-text-secondary" title={t.path}>{formatBytes(t.size)} · {t.path.split("/").slice(-2).join("/")}</p>)}
                {g.count > 0 && <button type="button" className={`${btn} mt-2 text-[12px]`} disabled={!!busy} onClick={() => void run("Making the list…", async () => review(await ipc.cleanDiskReview(g.id)))}>Review {g.title.toLowerCase()}…</button>}
              </div>
            ))}
          </div>
          <details><summary className="cursor-pointer text-[12.5px] font-medium">Biggest folders</summary>
            <ul className="mt-1 space-y-0.5 text-[12px] text-text-secondary">{r.folders.map((f) => <li key={f.path} className="truncate" title={f.path}>{formatBytes(f.size)} · {f.path}</li>)}</ul>
          </details>
        </div>
      )}
      <Status busy={busy} err={err} />
    </Tool>
  );
}

function InstallersTool() {
  const { busy, err, run } = useRun();
  return (
    <Tool label="Installers" icon={<Package size={16} className="text-primary" />} title="Old installers and disk images" hint="Finds .dmg, .pkg and setup files in Downloads and on the Desktop for apps you have already installed.">
      <button type="button" className={btn} disabled={!!busy} onClick={() => void run("Looking…", async () => review(await ipc.cleanInstallers()))}>Find old installers…</button>
      <Status busy={busy} err={err} />
    </Tool>
  );
}

function AppsTool() {
  const { busy, err, run } = useRun();
  const [days, setDays] = useState(90);
  const [apps, setApps] = useState<ForgottenApp[] | null>(null);
  const [pick, setPick] = useState<Set<string>>(new Set());
  if (!isMac) return null;
  return (
    <Tool label="Forgotten apps" icon={<AppWindow size={16} className="text-primary" />} title="Forgotten apps" hint="Apps you haven't opened in months, with their size and the files they leave behind in your Library. Apple's apps and Quick Pebble are never listed. Removing one sends the app and its leftovers to the Trash, after you confirm.">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[12px]">Not opened for <select className="rounded-lg border border-border bg-surface px-2 py-1" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Not opened for">{[30, 90, 180, 365].map((d) => <option key={d} value={d}>{d} days</option>)}</select></label>
        <button type="button" className={btn} disabled={!!busy} onClick={() => void run("Checking your apps… this can take a minute", async () => { setApps(await ipc.cleanAppsScan(days)); setPick(new Set()); })}>Find them</button>
      </div>
      {apps && (apps.length === 0 ? <p className="mt-2 text-[12px] text-text-secondary">None: you use all your apps.</p> : (
        <>
          <ul className="mt-2 max-h-56 divide-y divide-border overflow-y-auto rounded-xl border border-border" aria-label="Forgotten apps list">
            {apps.map((a) => (
              <li key={a.path}><label className="flex cursor-pointer items-center gap-3 px-3 py-1.5 hover:bg-surface-secondary">
                <input type="checkbox" className="size-4 accent-primary" checked={pick.has(a.path)} onChange={() => setPick((p) => { const n = new Set(p); if (n.has(a.path)) n.delete(a.path); else n.add(a.path); return n; })} aria-label={a.name} />
                <span className="flex-1">{a.name} <span className="text-[11.5px] text-text-secondary">· {a.lastUsed ? `last opened ${timeAgo(Math.floor(a.lastUsed / 1000))}` : "never opened"}</span></span>
                <span className="text-[12px] tabular-nums text-text-secondary">{formatBytes((a.size ?? 0) + a.leftoverBytes)}{a.leftovers ? ` (${a.leftovers} leftover${a.leftovers === 1 ? "" : "s"})` : ""}</span>
              </label></li>
            ))}
          </ul>
          <button type="button" className={`${btn} mt-2`} disabled={!!busy || pick.size === 0} onClick={() => void run("Making the list…", async () => review(await ipc.cleanAppsReview([...pick])))}>Review removing {pick.size || ""} app{pick.size === 1 ? "" : "s"}…</button>
        </>
      ))}
      <Status busy={busy} err={err} />
    </Tool>
  );
}

function TidyTool() {
  const { busy, err, run } = useRun();
  const [desk, setDesk] = useState(true);
  const [dl, setDl] = useState(true);
  return (
    <Tool label="Tidy" icon={<FolderTree size={16} className="text-primary" />} title="Tidy up Desktop and Downloads" hint="Sorts loose files into folders by kind (Images, PDFs, Documents, Installers…). Folders you made stay as they are, nothing is overwritten, and each move can be undone.">
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-1.5 text-[12.5px]"><input type="checkbox" className="accent-primary" checked={desk} onChange={(e) => setDesk(e.target.checked)} /> Desktop</label>
        <label className="flex items-center gap-1.5 text-[12.5px]"><input type="checkbox" className="accent-primary" checked={dl} onChange={(e) => setDl(e.target.checked)} /> Downloads</label>
        <button type="button" className={btn} disabled={!!busy || (!desk && !dl)} onClick={() => void run("Planning…", async () => review(await ipc.cleanTidy([...(desk ? ["desktop" as const] : []), ...(dl ? ["downloads" as const] : [])])))}>Plan the tidy-up…</button>
      </div>
      <Status busy={busy} err={err} />
    </Tool>
  );
}

function RenameTool() {
  const { busy, err, run } = useRun();
  const [c, setC] = useState<RenameCandidates | null>(null);
  const [pick, setPick] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState<{ name: string; error: string }[]>([]);
  const pictures = c?.files.filter((f) => pick.has(f.path) && f.mode === "picture").length ?? 0;
  const texts = (pick.size || 0) - pictures;
  return (
    <Tool label="Rename by content" icon={<Wand2 size={16} className="text-primary" />} title="Rename by content" hint="IMG_4021.jpg becomes “Beach trip - sunset”, scan0003.pdf becomes “Electricity bill - October”. Pick a folder; you'll see exactly what is sent to the AI before anything is.">
      <button type="button" className={btn} disabled={!!busy} onClick={() => void run("Looking for unclear names…", async () => { const f = await ipc.folderPick("Choose a folder to rename files in"); if (!f) return; const r = await ipc.cleanRenameCandidates(f); setC(r); setPick(new Set(r.files.map((x) => x.path))); setFailed([]); })}>Choose a folder…</button>
      {c && (c.files.length === 0 ? <p className="mt-2 text-[12px] text-text-secondary">Every file in that folder already has a clear name.</p> : (
        <div className="mt-2 space-y-2">
          <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-xl border border-border" aria-label="Files to rename">
            {c.files.map((f) => (
              <li key={f.path}><label className="flex cursor-pointer items-center gap-3 px-3 py-1.5 hover:bg-surface-secondary">
                <input type="checkbox" className="size-4 accent-primary" checked={pick.has(f.path)} onChange={() => setPick((p) => { const n = new Set(p); if (n.has(f.path)) n.delete(f.path); else n.add(f.path); return n; })} aria-label={f.name} />
                <span className="flex-1 truncate">{f.name}</span>
                <span className="text-[11.5px] text-text-secondary">{f.mode === "picture" ? "a small picture" : "its first 2,000 characters"}</span>
              </label></li>
            ))}
          </ul>
          <p role="note" className="rounded-lg bg-surface-secondary p-2 text-[12px]"><b>What will be sent</b> to {c.provider === "ollama" ? "Ollama on this computer" : `${c.provider[0].toUpperCase()}${c.provider.slice(1)}`} ({c.model}): {pictures ? `a small picture (768 pixels) of each of ${pictures} file${pictures === 1 ? "" : "s"} or of its first page` : ""}{pictures && texts ? ", and " : ""}{texts ? `the first 2,000 characters of ${texts} text file${texts === 1 ? "" : "s"}` : ""}. Not the file names, the folder or anything else. Nothing is renamed until you confirm the list that comes back.</p>
          <button type="button" className={primary} disabled={!!busy || pick.size === 0} onClick={() => void run(`Asking the AI about ${pick.size} file${pick.size === 1 ? "" : "s"}…`, async () => { const r = await ipc.cleanRenameSuggest([...pick]); setFailed(r.failed); review(r.view); })}>Send {pick.size} and suggest names</button>
          {failed.length > 0 && <ul className="text-[11.5px] text-text-secondary">{failed.map((f) => <li key={f.name}>No name for {f.name}: {f.error}</li>)}</ul>}
        </div>
      ))}
      <Status busy={busy} err={err} />
    </Tool>
  );
}

function PhotosTool() {
  const { busy, err, run } = useRun();
  const [unsure, setUnsure] = useState<number | null>(null);
  const [failed, setFailed] = useState<{ name: string; error: string }[]>([]);
  return (
    <Tool label="Photo triage" icon={<FileImage size={16} className="text-primary" />} title="Screenshots and receipts among your photos" hint="Pick a folder of photos (not the Photos app library). Screenshots and receipts are spotted from their names and sizes and suggested for Screenshots and Receipts folders. Only moved after you confirm.">
      <button type="button" className={btn} disabled={!!busy} onClick={() => void run("Looking through the photos…", async () => { const f = await ipc.folderPick("Choose a folder of photos"); if (!f) return; const r = await ipc.cleanPhotosScan(f); setUnsure(r.unsure); setFailed([]); review(r.view); })}>Choose a folder…</button>
      {unsure != null && unsure > 0 && (
        <div className="mt-2 space-y-1.5">
          <p className="text-[12px]">{unsure} photo{unsure === 1 ? "" : "s"} couldn&apos;t be told apart by name. The AI can look at up to 40 of them: <b>a small picture (512 pixels) of each is sent</b> to your AI provider, and it answers receipt, screenshot, document or photo.</p>
          <button type="button" className={btn} disabled={!!busy} onClick={() => void run("Asking the AI…", async () => { const list = await ipc.cleanPhotosUnsure(); const r = await ipc.cleanPhotosAi(list.slice(0, 40).map((x) => x.path)); setFailed(r.failed); setUnsure(0); review(r.view); })}>Let the AI look at {Math.min(40, unsure)}</button>
        </div>
      )}
      {failed.length > 0 && <p className="mt-1 text-[11.5px] text-text-secondary">{failed.length} couldn&apos;t be checked ({failed[0].error}).</p>}
      <Status busy={busy} err={err} />
    </Tool>
  );
}

function SlowTool() {
  const { busy, err, run } = useRun();
  const [r, setR] = useState<SlowReport | null>(null);
  return (
    <Tool label="Slow" icon={<Gauge size={16} className="text-primary" />} title={isMac ? "Why is my Mac slow?" : "Why is my computer slow?"} hint="Reads the same numbers as Activity Monitor and names the apps using the most processor and memory. You can ask any of them to quit; apps with unsaved work get the chance to save.">
      <button type="button" className={btn} disabled={!!busy} onClick={() => void run("Measuring…", async () => setR(await ipc.systemSlow()))}>{r ? "Check again" : "Check now"}</button>
      {r && (
        <div className="mt-2 space-y-2 text-[12.5px]">
          <p>Memory: {formatBytes(r.memUsed)} of {formatBytes(r.memTotal)} in use.{r.load != null && ` Processor load: ${r.load} on ${r.cpus} cores.`} {r.note}</p>
          {r.culprits.length === 0 ? <p className="text-text-secondary">Nothing stands out right now. If it still feels slow, try again while it&apos;s happening.</p> : (
            <ul className="divide-y divide-border rounded-xl border border-border" aria-label="Culprits">
              {r.culprits.map((c) => (
                <li key={c.name} className="flex items-center gap-3 px-3 py-1.5">
                  <span className="flex-1"><b>{c.name}</b> <span className="text-text-secondary">is {c.why}</span></span>
                  {c.canQuit && <button type="button" className={`${btn} text-[12px]`} onClick={() => void run("Making the list…", async () => review(await ipc.appsQuitReview([c.name])))}>Quit…</button>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <Status busy={busy} err={err} />
    </Tool>
  );
}

function QuitTool() {
  const { busy, err, run } = useRun();
  const [hours, setHours] = useState(48);
  const [data, setData] = useState<Awaited<ReturnType<typeof ipc.appsRunning>> | null>(null);
  const [pick, setPick] = useState<Set<string>>(new Set());
  const load = () => void run("Checking…", async () => { const d = await ipc.appsRunning(hours); setData(d); setPick(new Set(d.unused.map((u) => u.name))); });
  useEffect(load, [hours]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!isMac) return null;
  return (
    <Tool label="Quit unused apps" icon={<Sparkles size={16} className="text-primary" />} title="Quit apps you haven't touched" hint="Turn on “Notice which app I'm using” and Quick Pebble checks once a minute which app is in front (kept on this computer only). Apps left open but not used for a while are listed here. Quitting is polite: an app with unsaved work stays open or asks you to save.">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-[12.5px]"><input type="checkbox" role="switch" className="accent-primary" checked={!!data?.tracking} onChange={(e) => void run("Saving…", async () => { await ipc.settingsSet("app_activity", e.target.checked ? "1" : "0"); load(); })} aria-label="Notice which app I'm using" /> Notice which app I&apos;m using</label>
        <label className="text-[12px]">Unused for <select className="rounded-lg border border-border bg-surface px-2 py-1" value={hours} onChange={(e) => setHours(Number(e.target.value))} aria-label="Unused for">{[8, 24, 48, 96, 168].map((h) => <option key={h} value={h}>{h < 24 ? `${h} hours` : `${h / 24} day${h === 24 ? "" : "s"}`}</option>)}</select></label>
      </div>
      {data && (
        <div className="mt-2 text-[12.5px]">
          {!data.tracking ? <p className="text-text-secondary">Off. {data.running.length} apps are open right now.</p>
            : data.unused.length === 0 ? <p className="text-text-secondary">{data.since && Date.now() - data.since < hours * 3600_000 ? `Watching since ${new Date(data.since).toLocaleString()}; check back after ${hours} hours.` : "Every open app has been used recently."}</p>
            : (<>
              <ul className="divide-y divide-border rounded-xl border border-border" aria-label="Unused apps">
                {data.unused.map((u) => (
                  <li key={u.name}><label className="flex cursor-pointer items-center gap-3 px-3 py-1.5 hover:bg-surface-secondary">
                    <input type="checkbox" className="size-4 accent-primary" checked={pick.has(u.name)} onChange={() => setPick((p) => { const n = new Set(p); if (n.has(u.name)) n.delete(u.name); else n.add(u.name); return n; })} aria-label={u.name} />
                    <span className="flex-1">{u.name}</span><span className="text-[11.5px] text-text-secondary">{u.lastSeen ? `last used ${timeAgo(Math.floor(u.lastSeen / 1000))}` : "not used since I started noticing"}</span>
                  </label></li>
                ))}
              </ul>
              <button type="button" className={`${btn} mt-2`} disabled={!!busy || pick.size === 0} onClick={() => void run("Making the list…", async () => review(await ipc.appsQuitReview([...pick])))}>Review quitting {pick.size}…</button>
            </>)}
        </div>
      )}
      <Status busy={busy} err={err} />
    </Tool>
  );
}

function LoginTool() {
  const { busy, err, run } = useRun();
  const [items, setItems] = useState<LoginItem[] | null>(null);
  const [pick, setPick] = useState<Set<string>>(new Set());
  return (
    <Tool label="Login items" icon={<Power size={16} className="text-primary" />} title="What starts when you log in" hint="Apps and background helpers that start by themselves. Turning one off doesn't remove the app, and Undo turns it back on. (macOS may ask once whether Quick Pebble may read your login items.)">
      <button type="button" className={btn} disabled={!!busy} onClick={() => void run("Reading…", async () => { setItems(await ipc.loginItems()); setPick(new Set()); })}>{items ? "Read again" : "Show them"}</button>
      {items && (items.length === 0 ? <p className="mt-2 text-[12px] text-text-secondary">Nothing starts by itself (or macOS didn&apos;t let Quick Pebble look).</p> : (<>
        <ul className="mt-2 max-h-56 divide-y divide-border overflow-y-auto rounded-xl border border-border" aria-label="Login items list">
          {items.map((i) => (
            <li key={`${i.kind}:${i.name}`}><label className="flex cursor-pointer items-center gap-3 px-3 py-1.5 hover:bg-surface-secondary">
              <input type="checkbox" className="size-4 accent-primary" checked={pick.has(i.name)} onChange={() => setPick((p) => { const n = new Set(p); if (n.has(i.name)) n.delete(i.name); else n.add(i.name); return n; })} aria-label={i.name} />
              <span className="min-w-0 flex-1 truncate">{i.name}</span><span className="text-[11.5px] text-text-secondary">{i.note}</span>
            </label></li>
          ))}
        </ul>
        <button type="button" className={`${btn} mt-2`} disabled={!!busy || pick.size === 0} onClick={() => void run("Making the list…", async () => review(await ipc.loginItemsReview([...pick])))}>Review turning off {pick.size}…</button>
      </>))}
      <Status busy={busy} err={err} />
    </Tool>
  );
}
