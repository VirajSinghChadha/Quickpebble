import { useEffect, useState } from "react";
import { Plus, Trash2, UserRound } from "lucide-react";
import { ipc, type Profile } from "../lib/ipc";
import { useStore } from "../store/useStore";
import { Modal, ModalHeader } from "./Modal";

const COLORS = ["#2563eb", "#16a34a", "#dc2626", "#d97706", "#7c3aed", "#0891b2", "#db2777"];

/** Separate browsing identities: each profile has its own cookies, logins (including Google accounts) and site data. */
export function ProfilesPanel() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [current, setCurrent] = useState("default");
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [error, setError] = useState("");
  const close = () => useStore.getState().setOverlay(null);

  const load = () => void ipc.profileList().then(setProfiles);
  useEffect(() => { load(); void ipc.profileCurrent().then((c) => setCurrent(c.id)); }, []);

  const create = async () => {
    try {
      await ipc.profileCreate(name, color);
      setName(""); setError(""); load();
    } catch (e) { setError(String(e)); }
  };
  const open = async (id: string) => { close(); await ipc.windowNewProfile(id); };
  const remove = async (id: string) => { await ipc.profileDelete(id); load(); };

  return (
    <Modal onClose={close} label="Profiles" width="max-w-md">
      <ModalHeader title="Profiles" onClose={close} />
      <div className="space-y-4 overflow-y-auto px-5 pb-5">
        <p className="text-[12.5px] text-text-secondary">Each profile keeps its own logins, cookies and site data. Sign in to a different Google account in each one, for example Personal and Work.</p>
        <ul className="space-y-1.5">
          <li className="flex items-center gap-3 rounded-xl border border-border px-3 py-2">
            <span className="grid size-7 place-items-center rounded-full bg-surface-secondary text-text-secondary"><UserRound size={14} /></span>
            <span className="flex-1 font-medium">Default{current === "default" ? " · this window" : ""}</span>
            {current !== "default" && <button type="button" onClick={() => void open("default")} className="rounded-lg border border-border px-2.5 py-1 text-[12px] hover:bg-surface-secondary">Open</button>}
          </li>
          {profiles.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2">
              <span className="grid size-7 place-items-center rounded-full text-[12px] font-semibold text-white" style={{ background: p.color }}>{p.name[0]?.toUpperCase()}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{p.name}{current === p.id ? " · this window" : ""}</span>
              {current !== p.id && <button type="button" onClick={() => void open(p.id)} className="rounded-lg border border-border px-2.5 py-1 text-[12px] hover:bg-surface-secondary">Open</button>}
              <button type="button" aria-label={`Delete ${p.name}`} title="Delete profile" onClick={() => void remove(p.id)} className="grid size-7 place-items-center rounded-lg text-text-secondary hover:bg-surface-secondary"><Trash2 size={13} /></button>
            </li>
          ))}
        </ul>
        <form className="space-y-2 border-t border-border pt-4" onSubmit={(e) => { e.preventDefault(); void create(); }}>
          <p className="font-medium">New profile</p>
          <div className="flex gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Name, e.g. Work" aria-label="Profile name" className="h-9 flex-1 rounded-lg border border-border bg-surface px-3 outline-none focus:border-primary" />
            <button type="submit" disabled={!name.trim()} className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 font-medium text-white disabled:opacity-40 dark:text-bg"><Plus size={14} /> Add</button>
          </div>
          <div className="flex gap-2" role="group" aria-label="Profile color">
            {COLORS.map((c) => <button key={c} type="button" className="swatch" style={{ background: c }} aria-pressed={color === c} aria-label={c} onClick={() => setColor(c)} />)}
          </div>
          {error && <p role="alert" className="text-[12px] text-red-500">{error}</p>}
        </form>
      </div>
    </Modal>
  );
}
