/** Sensitive things the screen agent asks about. "Allowed" = it may do them without asking each time. */
export const CATEGORIES = [
  { id: "purchases", label: "Buy things or make payments", defaultAllowed: false },
  { id: "deleting", label: "Delete or overwrite files and data", defaultAllowed: false },
  { id: "messages", label: "Send messages, emails or posts to other people", defaultAllowed: false },
  { id: "accounts", label: "Sign in or out, or change account settings", defaultAllowed: false },
  { id: "installs", label: "Install software or change system settings", defaultAllowed: false },
  { id: "submit", label: "Submit forms and answers", defaultAllowed: true },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];
export type Perms = Record<CategoryId, boolean>;
export type Scope = "session" | "always";

export const defaultPerms = (): Perms => Object.fromEntries(CATEGORIES.map((c) => [c.id, c.defaultAllowed])) as Perms;

export const categoryLabel = (id: string): string => CATEGORIES.find((c) => c.id === id)?.label ?? id;

/** Website a permission applies to; no page open means the whole computer. */
export function hostOf(url: string | undefined): string {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, "") || "this computer" : "this computer";
  } catch {
    return "this computer";
  }
}

/** Reads saved permissions for a host, ignoring anything malformed. */
export function loadPerms(json: string | undefined, host: string): Perms | null {
  try {
    const entry = (JSON.parse(json ?? "{}") as Record<string, Record<string, unknown>>)[host];
    if (!entry || typeof entry !== "object") return null;
    const base = defaultPerms();
    for (const c of CATEGORIES) if (typeof entry[c.id] === "boolean") base[c.id] = entry[c.id] as boolean;
    return base;
  } catch {
    return null;
  }
}

export function savePerms(json: string | undefined, host: string, perms: Perms): string {
  let all: Record<string, Perms> = {};
  try {
    const parsed = JSON.parse(json ?? "{}");
    if (parsed && typeof parsed === "object") all = parsed;
  } catch {
    /* start fresh */
  }
  all[host] = perms;
  return JSON.stringify(all);
}
