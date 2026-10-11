// API keys, encrypted with the OS keychain via Electron's safeStorage. Never stored in SQLite.
import { app, safeStorage } from "electron";
import fs from "node:fs";
import path from "node:path";

const file = () => path.join(app.getPath("userData"), "secrets.json");
let cache = null;
/** Provider keys come from the person's signed-in account on every launch, so they are held in memory only: nothing is written to disk
 * and the macOS keychain is never touched (it asked for permission again after every update of an unsigned app). */
export const MEMORY_ONLY = new Set(["gemini", "openai", "anthropic"]);
const memory = new Map();

function load() {
  if (cache) return cache;
  try { cache = JSON.parse(fs.readFileSync(file(), "utf8")); } catch { cache = {}; }
  return cache;
}

export function getSecret(name) {
  const envName = `QP_${name.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_API_KEY`;
  const env = process.env[envName] || (name === "gemini" ? process.env.GEMINI_API_KEY : "");
  if (env && env.trim()) return env.trim();
  if (MEMORY_ONLY.has(name)) return memory.get(name) || null;
  const enc = load()[name];
  if (!enc || !safeStorage.isEncryptionAvailable()) return null;
  try { return safeStorage.decryptString(Buffer.from(enc, "base64")) || null; } catch { return null; }
}

export function setSecret(name, value) {
  if (MEMORY_ONLY.has(name)) { if (value) memory.set(name, value); else memory.delete(name); return; }
  const data = load();
  if (!value) delete data[name];
  else {
    if (!safeStorage.isEncryptionAvailable()) throw new Error("The system keychain is not available, so the key can't be stored safely. Set the QP_" + name.toUpperCase() + "_API_KEY environment variable instead.");
    data[name] = safeStorage.encryptString(value).toString("base64");
  }
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(data), { mode: 0o600 });
  if (value && getSecret(name) !== value) throw new Error("The key was saved but could not be read back from the system keychain.");
}
