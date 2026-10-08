import { useState } from "react";
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
  const close = () => useStore.getState().setOverlay(null);
  const needle = q.trim().toLowerCase();
  const shown = tabs.filter((t) => !needle || `${t.title} ${t.url} ${t.group ?? ""}`.toLowerCase().includes(needle));

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
        onChange={(e) => (setQ(e.target.value), setSel(0))}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") (e.preventDefault(), setSel((i) => (i + 1) % Math.max(shown.length, 1)));
          else if (e.key === "ArrowUp") (e.preventDefault(), setSel((i) => (i - 1 + shown.length) % Math.max(shown.length, 1)));
          else if (e.key === "Enter") pick(shown[sel]?.id);
        }}
        placeholder="Search open tabs…"
        aria-label="Search tabs"
        className="border-b border-border bg-transparent px-5 py-4 text-[15px] outline-none placeholder:text-text-secondary"
      />
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
