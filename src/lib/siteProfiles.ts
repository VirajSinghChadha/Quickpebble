/** Per-site preferences, saved as JSON under the "site_profiles" setting, keyed by host (without "www."). */
export interface SiteProfile {
  zoom?: number; // 0.3 to 3, where 1 is 100%
  trackers?: boolean; // undefined = follow the global tracker setting
  muted?: boolean;
}

export type SiteProfiles = Record<string, SiteProfile>;

export function parseProfiles(json: string | undefined): SiteProfiles {
  try {
    const raw = JSON.parse(json ?? "{}") as Record<string, Record<string, unknown>>;
    const out: SiteProfiles = {};
    for (const [host, p] of Object.entries(raw)) {
      if (!p || typeof p !== "object") continue;
      const profile: SiteProfile = {};
      if (typeof p.zoom === "number" && Number.isFinite(p.zoom)) profile.zoom = Math.min(3, Math.max(0.3, p.zoom));
      if (typeof p.trackers === "boolean") profile.trackers = p.trackers;
      if (typeof p.muted === "boolean") profile.muted = p.muted;
      if (Object.keys(profile).length) out[host] = profile;
    }
    return out;
  } catch {
    return {};
  }
}

/** Returns the JSON to store after setting (or, when empty, removing) one site's profile. */
export function withProfile(json: string | undefined, host: string, profile: SiteProfile | null): string {
  const all = parseProfiles(json);
  const clean = profile && Object.fromEntries(Object.entries(profile).filter(([, v]) => v !== undefined));
  if (!clean || Object.keys(clean).length === 0) delete all[host];
  else all[host] = clean as SiteProfile;
  return JSON.stringify(all);
}
