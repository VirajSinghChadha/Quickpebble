// Per-tab memory for the Task Manager. Pure so it can be tested: the browser passes in process metrics and its tabs.
const mb = (kb) => Math.round(kb / 1024);

/**
 * metrics: [{ pid, memory: { workingSetSize (KB) }, cpu: { percentCPUUsage } }] from the OS (all of Quick Pebble's processes).
 * tabs: [{ id, title, url, pid (0 when no page is loaded), suspended, pinned, active, audible }].
 * Tabs that share a process share its memory, so each gets an even share and is flagged `shared`; totals count each process once.
 */
export function summarize(metrics, tabs) {
  const byPid = new Map(metrics.map((m) => [m.pid, m]));
  const users = new Map();
  for (const t of tabs) if (t.pid) users.set(t.pid, (users.get(t.pid) ?? 0) + 1);
  const rows = tabs.map((t) => {
    const m = t.pid ? byPid.get(t.pid) : null;
    const n = t.pid ? users.get(t.pid) ?? 1 : 1;
    return {
      id: t.id, title: t.title || t.url || "New tab", url: t.url || "",
      mb: m ? Math.round(mb(m.memory.workingSetSize) / n) : 0,
      cpu: m ? Math.round(Math.max(0, m.cpu?.percentCPUUsage ?? 0) * 10) / 10 / n : 0,
      shared: n > 1, live: !!m, suspended: !!t.suspended, pinned: !!t.pinned, active: !!t.active, audible: !!t.audible,
    };
  }).sort((a, b) => b.mb - a.mb || a.title.localeCompare(b.title));
  const total = metrics.reduce((n, m) => n + m.memory.workingSetSize, 0);
  const tabPids = new Set(tabs.filter((t) => t.pid).map((t) => t.pid));
  const tabsKb = metrics.filter((m) => tabPids.has(m.pid)).reduce((n, m) => n + m.memory.workingSetSize, 0);
  const totalMb = mb(total), tabsMb = Math.min(mb(tabsKb), totalMb);   // 'other' is the remainder, so the rounded numbers always add up
  return { rows, total_mb: totalMb, tabs_mb: tabsMb, other_mb: totalMb - tabsMb, processes: metrics.length, suspended: tabs.filter((t) => t.suspended).length };
}
