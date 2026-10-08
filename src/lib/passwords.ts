const SETS = {
  lower: "abcdefghijkmnopqrstuvwxyz", // no l
  upper: "ABCDEFGHJKLMNPQRSTUVWXYZ", // no I or O
  digits: "23456789", // no 0 or 1
  symbols: "!@#$%^&*-_=+?",
};

/** Uniform random index without modulo bias. */
function randomBelow(n: number): number {
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return buf[0] % n;
}

/** Strong random password that always contains at least one character from each chosen set. */
export function generatePassword(length = 20, symbols = true): string {
  const sets = [SETS.lower, SETS.upper, SETS.digits, ...(symbols ? [SETS.symbols] : [])];
  const len = Math.min(64, Math.max(Math.max(8, sets.length), Math.floor(length)));
  const all = sets.join("");
  const chars = sets.map((s) => s[randomBelow(s.length)]);
  while (chars.length < len) chars.push(all[randomBelow(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBelow(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

/** Rough strength label for the master password and saved logins. */
export function strength(pw: string): "weak" | "okay" | "strong" {
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (pw.length >= 14 && classes >= 3) return "strong";
  if (pw.length >= 10 && classes >= 2) return "okay";
  return "weak";
}
