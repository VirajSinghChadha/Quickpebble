import { useState } from "react";
import { Sparkles } from "lucide-react";
import { ipc } from "../lib/ipc";
import { FIND_PROMPT, SORT_PROMPT, findMessage, parseFind, parseSort, sortMessage, type TabLine } from "../lib/tabAsk";
import { selectActive, useStore } from "../store/useStore";
import { displayUrl, tabLabel } from "../lib/url";
import { Favicon } from "./Favicon";
import { Modal } from "./Modal";

/** ⌘⇧A tab search. */
export function TabSearch() {
  const tabs = useStore((s) => s.tabs);
  const active = useStore(selectActive);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [aiIds, setAiIds] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const lines = (): TabLine[] => tabs.filter((t) => t.url).map((t) => ({ id: t.id, title: t.title, host: displayUrl(t.url) }));
  const ask = async () => {
    const want = q.trim(); const ls = lines();
    if (!want || !ls.length) return;
    setBusy(true); setNote(null);
    try {
      const ids = parseFind(await ipc.aiChat(FIND_PROMPT, [{ role: "user", content: findMessage(ls, want) }], true), ls);
      setAiIds(ids); setSel(0);
      if (!ids.length) setNote("The AI could not find a match among your open tabs.");
    } catch (e) { setNote(String(e)); } finally { setBusy(false); }
  };
  const sortAll = async () => {
    const ls = lines().filter((l) => !tabs.find((t) => t.id === l.id)?.pinned);
    if (!ls.length) return;
    setBusy(true); setNote(null);
    try {
      const plan = parseSort(await ipc.aiChat(SORT_PROMPT, [{ role: "user", content: sortMessage(ls) }], true), ls);
      for (const [id, g] of plan) useStore.getState().setGroup(id, g);
      setNote(plan.size ? `Put ${plan.size} tab${plan.size === 1 ? "" : "s"} into groups. Change any of them from the tab menu.` : "The AI did not find tabs that fit your groups.");
    } catch (e) { setNote(String(e)); } finally { setBusy(false); }
  };
  const close = () => useStore.getState().setOverlay(null);
  const needle = q.trim().toLowerCase();
  const shown = aiIds ? aiIds.flatMap((id) => tabs.filter((t) => t.id === id)) : tabs.filter((t) => !needle || `${t.title} ${t.url} ${t.group ?? ""}`.toLowerCase().includes(needle));

  const pick = (id?: string) => {
    if (!id) return;
    close();
    useStore.getState().activate(id);
  };

  return (
    <Modal onClose={close} label="Search tabs" align="top" width="max-w-lg">
      <input
        autoFocus
        value={q}
        onChange={(e) => (setQ(e.target.value), setSel(0), setAiIds(null), setNote(null))}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") (e.preventDefault(), setSel((i) => (i + 1) % Math.max(shown.length, 1)));
          else if (e.key === "ArrowUp") (e.preventDefault(), setSel((i) => (i - 1 + shown.length) % Math.max(shown.length, 1)));
          else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void ask();
          else if (e.key === "Enter") pick(shown[sel]?.id);
        }}
        placeholder="Search open tabs…"
        aria-label="Search tabs"
        className="border-b border-border bg-transparent px-5 py-4 text-[15px] outline-none placeholder:text-text-secondary"
      />
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2 text-[12px]">
        <button type="button" disabled={busy || !q.trim()} onClick={() => void ask()} className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 hover:bg-surface-secondary disabled:opacity-40" title="Describe the page, for example: the tab where I read about volcanoes. Only tab titles and sites are sent to your AI."><Sparkles size={12} />{busy ? "Thinking…" : "Find with AI"}</button>
        <button type="button" disabled={busy || tabs.length < 2} onClick={() => void sortAll()} className="rounded-full border border-border px-3 py-1 hover:bg-surface-secondary disabled:opacity-40" title="Sends your tab titles and sites to your AI, then puts tabs into groups">Sort tabs into groups</button>
        {aiIds && <span className="text-text-secondary">AI matches</span>}
        {note && <span className="text-text-secondary" role="status">{note}</span>}
      </div>
      <ul role="listbox" className="overflow-y-auto p-2">
        {shown.length === 0 && <li className="px-3 py-6 text-center text-text-secondary">No tabs match</li>}
        {shown.map((t, i) => (
          <li
            key={t.id}
            role="option"
            aria-selected={i === sel}
            onMouseEnter={() => setSel(i)}
            onClick={() => pick(t.id)}
            className={`flex cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2.5 ${i === sel ? "bg-surface-secondary" : ""}`}
          >
            <Favicon src={t.favicon} url={t.url} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px]">{tabLabel(t.title, t.url)}</p>
              {t.url && <p className="truncate text-[11.5px] text-text-secondary">{displayUrl(t.url)}</p>}
            </div>
            {t.group && <span className="rounded-md bg-surface-secondary px-1.5 py-0.5 text-[11px] text-text-secondary">{t.group}</span>}
            {t.id === active.id && <span className="text-[11px] text-primary">current</span>}
          </li>
        ))}
      </ul>
    </Modal>
  );
}
