/** Orders tabs for the strip: pinned first, then ungrouped, then each group together under its own header. */
import type { GroupName, Tab } from "../store/useStore";

export type StripItem = { kind: "tab"; tab: Tab } | { kind: "group"; group: GroupName; count: number; collapsed: boolean };

export function orderForStrip(tabs: Tab[], groups: readonly GroupName[], collapsed: ReadonlySet<GroupName>, activeId: string): StripItem[] {
  const out: StripItem[] = [];
  for (const t of tabs) if (t.pinned) out.push({ kind: "tab", tab: t });
  for (const t of tabs) if (!t.pinned && !t.group) out.push({ kind: "tab", tab: t });
  for (const g of groups) {
    const members = tabs.filter((t) => !t.pinned && t.group === g);
    if (!members.length) continue;
    const shut = collapsed.has(g);
    out.push({ kind: "group", group: g, count: members.length, collapsed: shut });
    // A collapsed group still shows the tab you are on, so the current page never vanishes from the strip.
    for (const t of members) if (!shut || t.id === activeId) out.push({ kind: "tab", tab: t });
  }
  return out;
}

export function toggled<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}
