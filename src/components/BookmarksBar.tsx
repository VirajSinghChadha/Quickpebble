import { useEffect, useState } from "react";
import { Folder } from "lucide-react";
import { ipc, type Bookmark } from "../lib/ipc";
import { hostOf } from "../lib/url";
import { selectActive, useStore } from "../store/useStore";
import { Favicon } from "./Favicon";

/** Thin strip under the toolbar with your most recent bookmarks. Toggle with ⌘⇧B. */
export function BookmarksBar() {
  const version = useStore((s) => s.bookmarksVersion);
  const [marks, setMarks] = useState<Bookmark[]>([]);
  useEffect(() => void ipc.bookmarkList().then((b) => setMarks(b)), [version]);

  const open = (url: string, background: boolean) => {
    const s = useStore.getState();
    const cur = selectActive(s);
    if (background || cur.url) s.newTab(url);
    else void s.navigate(cur.id, url);
  };

  return (
    <nav aria-label="Bookmarks" className="flex h-[34px] items-center gap-1 overflow-hidden border-b border-border bg-surface px-3">
      {marks.length === 0 && <span className="text-[12px] text-text-secondary">Press ⌘D on a page to bookmark it, or import yours from the Bookmarks panel.</span>}
      {marks.filter((m) => m.folder === "").slice(0, 12).map((m) => (
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
      {[...new Set(marks.map((m) => m.folder).filter(Boolean))].sort().slice(0, 6).map((f) => (
        <button key={f} type="button" title={`Open the ${f} folder`} onClick={() => useStore.getState().setSidebar("bookmarks")} className="flex h-7 max-w-32 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[12px] text-text-secondary hover:bg-surface-secondary hover:text-text-primary">
          <Folder size={13} /> <span className="truncate">{f}</span>
        </button>
      ))}
    </nav>
  );
}
