import { GROUPS, type Tab, type GroupName } from "../store/useStore";
import { isPrivateWindow } from "./ipc";

export interface WorkspaceTab {
  url: string;
  title: string;
  favicon: string;
  pinned: boolean;
  group: GroupName | null;
}
export interface Workspace {
  id: string;
  name: string;
  createdAt: number;
  tabs: WorkspaceTab[];
}
const KEY = "qp.workspaces.v1";

export function pageUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try { return ["https:", "http:"].includes(new URL(value).protocol); }
  catch { return false; }
}

export function workspaceTabs(tabs: Pick<Tab, "url" | "title" | "favicon" | "pinned" | "group">[]): WorkspaceTab[] {
  return tabs.filter((t) => pageUrl(t.url)).map(({ url, title, favicon, pinned, group }) => ({ url, title, favicon, pinned, group }));
}

export function createWorkspace(name: string, tabs: Tab[]): Workspace {
  const pages = workspaceTabs(tabs);
  if (!name.trim() || !pages.length) throw new Error("Enter a name and open at least one web page.");
  return { id: crypto.randomUUID(), name: name.trim().slice(0, 80), createdAt: Date.now(), tabs: pages };
}

export function loadWorkspaces(): Workspace[] {
  if (isPrivateWindow()) return [];
  try {
    const data: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(data)) return [];
    return data.filter((w) => typeof w?.id === "string" && typeof w.name === "string" &&
      w.name.trim() && Number.isFinite(w.createdAt) && Array.isArray(w.tabs)).map((w) => ({
      id: w.id, name: w.name, createdAt: w.createdAt,
      tabs: w.tabs.filter((t: WorkspaceTab) => pageUrl(t?.url)).map((t: WorkspaceTab) => ({
        url: t.url, title: typeof t.title === "string" ? t.title : t.url,
        favicon: typeof t.favicon === "string" ? t.favicon : "", pinned: t.pinned === true,
        group: GROUPS.includes(t.group as GroupName) ? t.group : null,
      })),
    })).filter((w) => w.tabs.length > 0);
  } catch { return []; }
}

export function persistWorkspaces(list: Workspace[]): void {
  if (isPrivateWindow()) throw new Error("Workspaces are unavailable in private windows.");
  try { localStorage.setItem(KEY, JSON.stringify(list)); }
  catch { throw new Error("Could not save workspaces. Local storage may be full or unavailable."); }
}
