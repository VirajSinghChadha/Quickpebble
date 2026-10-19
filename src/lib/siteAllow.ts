// "Allow everything on this website": one click lets the browser assistant carry out routine steps on a site without asking
// each time. Sensitive steps (pay, buy, delete, send, submit) are still asked about, whatever the site.

const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export const hostOfUrl = (url: string): string | null => {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return null;
    const h = u.hostname.toLowerCase().replace(/^www\./, "");
    return HOST.test(h) ? h : null;
  } catch {
    return null;
  }
};

/** The saved list: only well-formed host names, no duplicates, at most 200. */
export function parseSites(json: string | undefined): string[] {
  try {
    const a = JSON.parse(json ?? "[]") as unknown;
    if (!Array.isArray(a)) return [];
    return [...new Set(a.filter((h): h is string => typeof h === "string" && HOST.test(h)))].slice(0, 200);
  } catch {
    return [];
  }
}

/** Is this page on an allowed site (the site itself or any of its subdomains)? */
export function isSiteAllowed(sites: readonly string[], url: string): boolean {
  const h = hostOfUrl(url);
  return !!h && sites.some((s) => h === s || h.endsWith(`.${s}`));
}

export const addSite = (sites: readonly string[], host: string): string[] => (HOST.test(host) && !sites.includes(host) ? [...sites, host].slice(-200) : [...sites]);
export const removeSite = (sites: readonly string[], host: string): string[] => sites.filter((s) => s !== host);
