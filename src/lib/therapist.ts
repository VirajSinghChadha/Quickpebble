/** Native port of the "Tab Therapist" Chrome extension: health score, duplicates, organising, saved tabs. */
import type { GroupName, Tab } from "../store/useStore";

export interface Analysis {
  total: number;
  duplicates: Tab[];
  inactive: number;
  score: number;
  message: string;
  recommendation: string;
}

const isPage = (t: Tab) => /^https?:\/\//.test(t.url);

/** Keep active and pinned copies; otherwise keep the first occurrence. */
export function findDuplicates(tabs: Tab[], activeId?: string): Tab[] {
  const keep = new Map<string, Tab>();
  const dupes: Tab[] = [];
  for (const t of tabs.filter(isPage)) {
    const previous = keep.get(t.url);
    if (!previous) keep.set(t.url, t);
    else if (t.pinned || t.id === activeId) {
      if (!previous.pinned && previous.id !== activeId) dupes.push(previous);
      keep.set(t.url, t);
    } else dupes.push(t);
  }
  return dupes;
}

export function analyze(tabs: Tab[], activeId: string): Analysis {
  const duplicates = findDuplicates(tabs, activeId);
  const inactive = tabs.filter((t) => t.id !== activeId).length;
  const score = Math.max(
    0,
    Math.min(100, 100 - Math.max(0, tabs.length - 10) * 2 - duplicates.length * 5 - Math.max(0, inactive - 15)),
  );
  const message =
    score >= 80
      ? "Your tabs are looking healthy. Keep it up!"
      : score >= 60
        ? "You're doing okay, but a little cleanup wouldn't hurt."
        : score >= 40
          ? "We should probably talk about your tab habits."
          : "Your browser needs professional help.";
  const recommendation =
    duplicates.length > 0
      ? `I found ${duplicates.length} duplicate tab${duplicates.length === 1 ? "" : "s"}. You don't need to keep seeing the same page twice.`
      : tabs.length > 30
        ? "You have over 30 tabs open. Let's take this one tab at a time."
        : tabs.length > 15
          ? "You have quite a few tabs open. Consider closing anything you haven't used recently."
          : "Your browser is looking pretty healthy. I'm proud of you.";
  return { total: tabs.length, duplicates, inactive, score, message, recommendation };
}

const CATEGORIES: Record<Exclude<GroupName, "Personal">, string[]> = {
  School: ["docs.google.com", "classroom.google.com", "khanacademy.org", "quizlet.com", "wikipedia.org", "coursera.org", "edx.org"],
  Work: ["github.com", "slack.com", "notion.so", "figma.com", "linear.app", "atlassian.net", "gitlab.com"],
  Entertainment: ["youtube.com", "netflix.com", "spotify.com", "reddit.com", "twitch.tv", "disneyplus.com"],
  Shopping: ["amazon.com", "noon.com", "ebay.com", "etsy.com", "aliexpress.com", "walmart.com"],
};

/** Matches on hostname boundaries (the original used substring matching, which also hit query strings). */
export function categorize(url: string): GroupName | null {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
  for (const [name, domains] of Object.entries(CATEGORIES)) {
    if (domains.some((d) => host === d || host.endsWith(`.${d}`))) return name as GroupName;
  }
  return null;
}

/** Tab id → group, for categories that contain at least two tabs. */
export function organize(tabs: Tab[]): Map<string, GroupName> {
  const buckets = new Map<GroupName, string[]>();
  for (const t of tabs.filter(isPage)) {
    const c = categorize(t.url);
    if (c) buckets.set(c, [...(buckets.get(c) ?? []), t.id]);
  }
  const out = new Map<string, GroupName>();
  for (const [g, ids] of buckets) if (ids.length >= 2) ids.forEach((id) => out.set(id, g));
  return out;
}

export interface SavedTab {
  title: string;
  url: string;
  favicon: string;
}
const KEY = "qp.therapist.saved.v1";

export function loadSaved(): SavedTab[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((s) => typeof s?.url === "string") : [];
  } catch {
    return [];
  }
}

export function persistSaved(list: SavedTab[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable */
  }
}

export function addSaved(list: SavedTab[], tab: Pick<Tab, "title" | "url" | "favicon">): SavedTab[] {
  if (!isPage(tab as Tab) || list.some((s) => s.url === tab.url)) return list;
  return [...list, { title: tab.title || tab.url, url: tab.url, favicon: tab.favicon }];
}
