import { useEffect, useState } from "react";
import { ipc, type Bookmark } from "../lib/ipc";
import { hostOf } from "../lib/url";
import { selectActive, useStore } from "../store/useStore";
import { Favicon } from "./Favicon";

/** Thin strip under the toolbar with your most recent bookmarks. Toggle with ⌘⇧B. */
export function BookmarksBar() {
  const version = useStore((s) => s.bookmarksVersion);
  const [marks, setMarks] = useState<Bookmark[]>([]);
  useEffect(() => void ipc.bookmarkList().then((b) => setMarks(b.slice(0, 14))), [version]);

  const open = (url: string, background: boolean) => {
    const s = useStore.getState();
    const cur = selectActive(s);
    if (background || cur.url) s.newTab(url);
    else void s.navigate(cur.id, url);
  };

  return (
    <nav aria-label="Bookmarks" className="flex h-[34px] items-center gap-1 overflow-hidden border-b border-border bg-surface px-3">
      {marks.length === 0 && <span className="text-[12px] text-text-secondary">Press ⌘D on a page to bookmark it.</span>}
      {marks.map((m) => (
        <button
          key={m.url}
          type="button"
          title={m.url}
          onClick={() => open(m.url, false)}
          onAuxClick={(e) => e.button === 1 && open(m.url, true)}
          className="flex h-7 max-w-40 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[12px] text-text-secondary transition-colors duration-150 hover:bg-surface-secondary hover:text-text-primary"
        >
          <Favicon src="" url={m.url} size={14} />
          <span className="truncate">{m.title || hostOf(m.url)}</span>
        </button>
      ))}
    </nav>
  );
}
