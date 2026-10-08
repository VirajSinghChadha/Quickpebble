import { useCallback, useEffect, useState } from "react";
import { Camera, Globe2, MapPin, Bell, Mic, ShieldCheck, Trash2 } from "lucide-react";
import { ipc, type PrivacyStats, type SitePermission } from "../lib/ipc";
import { hostOf } from "../lib/url";
import { selectActive, useStore } from "../store/useStore";
import { Modal, ModalHeader } from "./Modal";

const PERMS = [
  { id: "camera", label: "Camera", icon: Camera },
  { id: "microphone", label: "Microphone", icon: Mic },
  { id: "location", label: "Location", icon: MapPin },
  { id: "notifications", label: "Notifications", icon: Bell },
] as const;
const POLICIES = ["ask", "allow", "block"] as const;

export function PrivacyCenter() {
  const tab = useStore(selectActive);
  const [stats, setStats] = useState<PrivacyStats | null>(null);
  const [rules, setRules] = useState<SitePermission[]>([]);
  const [host, setHost] = useState(hostOf(tab.url));
  const [done, setDone] = useState<string | null>(null);
  const close = () => useStore.getState().setOverlay(null);

  const load = useCallback(async () => {
    setStats(await ipc.privacyStats());
    setRules(await ipc.privacyPermissions());
  }, []);
  useEffect(() => void load(), [load]);

  const policyFor = (h: string, p: string) => rules.find((r) => r.host === h && r.permission === p)?.policy ?? "ask";
  const setPolicy = async (h: string, p: string, policy: string) => {
    await ipc.privacySetPermission(h, p, policy);
    await load();
  };
  const hosts = Array.from(new Set([...rules.map((r) => r.host), ...(host ? [host] : [])])).sort();

  return (
    <Modal onClose={close} label="Privacy Center" width="max-w-2xl">
      <ModalHeader title="Privacy Center" onClose={close} />
      <div className="space-y-6 overflow-y-auto px-5 py-5">
        <section className="flex items-center gap-4 rounded-2xl bg-surface-secondary p-4">
          <ShieldCheck size={30} className="text-primary" />
          <div className="flex-1">
            <p className="text-[15px] font-semibold">{stats?.blocked_total ?? 0} trackers blocked this session</p>
            <p className="text-text-secondary">Known ad and analytics hosts are blocked in page requests and navigation. This is best-effort, not a full ad blocker.</p>
          </div>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              role="switch"
              checked={stats?.block_trackers ?? true}
              onChange={async (e) => {
                await ipc.settingsSet("block_trackers", String(e.target.checked));
                await load();
              }}
              className="size-4 accent-primary"
            />
            <span>Protection</span>
          </label>
        </section>

        <section>
          <h3 className="mb-2 text-[13px] font-semibold">Site permissions</h3>
          <p className="mb-3 text-text-secondary">
            “Block” makes a site's camera, microphone, location or notification requests fail. Changes apply the next time the site loads.
          </p>
          <form
            className="mb-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setHost(host.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""));
            }}
          >
            <div className="flex h-9 flex-1 items-center gap-2 rounded-xl border border-border bg-surface px-3">
              <Globe2 size={14} className="text-text-secondary" />
              <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="example.com" aria-label="Site" className="flex-1 bg-transparent outline-none" />
            </div>
          </form>
          {hosts.length === 0 && <p className="rounded-xl border border-dashed border-border p-4 text-center text-text-secondary">No saved site rules yet.</p>}
          <div className="space-y-2">
            {hosts.map((h) => (
              <div key={h} className="rounded-xl border border-border p-3">
                <p className="mb-2 font-medium">{h}</p>
                <div className="grid grid-cols-2 gap-2">
                  {PERMS.map(({ id, label, icon: Icon }) => (
                    <label key={id} className="flex items-center gap-2 text-text-secondary">
                      <Icon size={14} />
                      <span className="flex-1">{label}</span>
                      <select
                        value={policyFor(h, id)}
                        onChange={(e) => void setPolicy(h, id, e.target.value)}
                        aria-label={`${label} for ${h}`}
                        className="rounded-lg border border-border bg-surface px-1.5 py-1 text-text-primary"
                      >
                        {POLICIES.map((p) => (
                          <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-[13px] font-semibold">Browsing data</h3>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={async () => {
                await ipc.privacyClearData(true, false);
                setDone("History cleared");
              }}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 transition-colors duration-150 hover:bg-surface-secondary"
            >
              <Trash2 size={14} /> Clear history
            </button>
            <button
              type="button"
              onClick={async () => {
                await ipc.privacyClearData(false, true);
                setDone("Cookies and site data cleared");
              }}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 transition-colors duration-150 hover:bg-surface-secondary"
            >
              <Trash2 size={14} /> Clear cookies &amp; site data
            </button>
            {done && <span role="status" className="self-center text-primary">{done}</span>}
          </div>
        </section>
      </div>
    </Modal>
  );
}
