/** Words that suggest the person wants a more careful, higher-quality answer than the light default. */
export const UPGRADE_WORDS = /\b(detailed|in[- ]depth|thorough(ly)?|comprehensive|elaborate|rigorous(ly)?|deep(ly)?|accurate(ly)?|precise(ly)?|high[- ]quality|extensive)\b/i;

export const wantsUpgrade = (text: string): boolean => UPGRADE_WORDS.test(text);

export interface ModelChoice {
  id: string;
  note: string;
}

const EXCLUDE = /(embed|tts|image|imagen|live|audio|vision|aqa|robotics|computer-use|exp|thinking-exp|gemma|learnlm|veo|lyria|native)/i;

function parse(name: string): { tier: number; version: number } | null {
  const m = /^gemini-(\d+(?:\.\d+)?)-(pro|flash-lite|flash)(?:-|$)/.exec(name);
  if (!m || EXCLUDE.test(name) || /-\d{3}$/.test(name)) return null; // skip dated or numbered snapshots
  return { tier: m[2] === "pro" ? 3 : m[2] === "flash" ? 2 : 1, version: parseFloat(m[1]) };
}

/** Picks up to three better models than the current one, best first. Only uses names the key can really call. */
export function rankUpgrades(available: string[], current: string): ModelChoice[] {
  const cur = parse(current);
  const scored = available
    .filter((n) => n !== current)
    .map((n) => ({ n, p: parse(n) }))
    .filter((x): x is { n: string; p: { tier: number; version: number } } => !!x.p && x.p.tier >= 2 && (!cur || x.p.tier > cur.tier || x.p.version > cur.version))
    .sort((a, b) => b.p.tier - a.p.tier || b.p.version - a.p.version);
  const picked: typeof scored = [];
  for (const x of scored) {
    if (picked.length === 3) break;
    if (!picked.some((y) => y.p.tier === x.p.tier)) picked.push(x); // one per tier: pro, flash
  }
  for (const x of scored) if (picked.length < 3 && !picked.includes(x)) picked.push(x);
  return picked.map(({ n, p }) => ({
    id: n,
    note: p.tier === 3 ? "Most capable. Best for careful, detailed work. Slower, uses more of your quota." : "Balanced. Smarter than the light model, still fairly quick.",
  }));
}
