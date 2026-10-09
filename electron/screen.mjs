// Screen mode bridge (port of screen.rs). The work (screenshot + grid, Gemini call, mouse/keyboard) lives in the Python
// sidecar under agent/; this starts it on demand and proxies three calls to it over 127.0.0.1 with a per-run token.
// Opt-in: nothing runs until the person sends a task in Screen mode. Every screenshot goes to Google Gemini.
import { app } from "electron";
import { spawn, execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSecret } from "./secrets.mjs";
import { aiConfig } from "./ai.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const isWin = process.platform === "win32";

export function agentDir() {
  const candidates = [process.env.QP_AGENT_DIR, path.join(process.resourcesPath ?? "", "agent"), path.join(here, "..", "agent")].filter(Boolean);
  const found = candidates.find((p) => fs.existsSync(path.join(p, "qp_agent", "server.py")));
  if (!found) throw new Error("The screen agent files were not found (expected an `agent` folder).");
  return found;
}
/** `python3` on macOS/Linux, `python` on Windows. QP_PYTHON overrides. */
const pythonCommand = () => process.env.QP_PYTHON || (isWin ? "python" : "python3");
const venvDir = () => path.join(app.getPath("userData"), "agent-venv");
const venvPython = (v) => (isWin ? path.join(v, "Scripts", "python.exe") : path.join(v, "bin", "python"));

function runQuiet(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, _out, stderr) => {
      if (!err) return resolve();
      reject(new Error(String(stderr).trim().split("\n").pop() || err.message));
    });
  });
}
/** Private virtual environment (outside the app bundle). pip is upgraded first so prebuilt wheels are used instead of compiling for minutes. */
async function installDeps(dir, venv) {
  await runQuiet(pythonCommand(), ["-m", "venv", venv]);
  const py = venvPython(venv);
  await runQuiet(py, ["-m", "pip", "install", "--disable-pip-version-check", "--quiet", "--upgrade", "pip"]);
  await runQuiet(py, ["-m", "pip", "install", "--disable-pip-version-check", "--quiet", "--prefer-binary", "-r", path.join(dir, "requirements.txt")]);
}

export class ScreenAgent {
  constructor(db) { this.db = db; this.run = null; this.starting = null; }

  stop() { try { this.run?.child.kill(); } catch { /* already gone */ } this.run = null; }

  startOnce(model, precision) {
    const key = getSecret("gemini");
    if (!key) throw new Error("Screen mode needs a Gemini API key. Add one in Settings → AI.");
    const dir = agentDir();
    const venvPy = venvPython(venvDir());
    const python = fs.existsSync(venvPy) ? venvPy : pythonCommand();
    return new Promise((resolve, reject) => {
      const child = spawn(python, ["-m", "qp_agent.server"], { cwd: dir, windowsHide: true, env: { ...process.env, GEMINI_API_KEY: key, QP_AGENT_MODEL: model, QP_AGENT_PRECISION: precision }, stdio: ["ignore", "pipe", "pipe"] });
      let err = "", out = "", done = false;
      const finish = (fn) => { if (!done) { done = true; clearTimeout(timer); fn(); } };
      const timer = setTimeout(() => finish(() => { child.kill(); reject(new Error("The screen agent could not start. it did not start")); }), 10000);
      child.on("error", () => finish(() => reject(new Error('Python 3 was not found. Install it from https://www.python.org (on Windows, tick "Add python.exe to PATH") to use Screen mode.'))));
      child.stderr.on("data", (d) => { err += d; });
      child.on("close", () => { if (this.run?.child === child) this.run = null; finish(() => reject(new Error(`The screen agent could not start. ${err.includes("ModuleNotFoundError") ? "NEEDS_DEPS" : (err.trim().split("\n").pop() || "it did not start")}`))); });
      child.stdout.on("data", (d) => {
        out += d;
        const m = /QP_AGENT_READY\b[^\n]*?\bport=(\d+)[^\n]*?\btoken=(\S+)/.exec(out);
        if (m) finish(() => resolve({ child, port: Number(m[1]), token: m[2], model, precision }));
      });
    });
  }

  async start(model, precision) {
    try { return await this.startOnce(model, precision); }
    catch (e) {
      if (!String(e.message).includes("NEEDS_DEPS")) throw e;
      const venv = venvDir();
      fs.rmSync(venv, { recursive: true, force: true });
      try { await installDeps(agentDir(), venv); }
      catch (err) { throw new Error(`Setting up the screen agent failed (${err.message}). Check your internet connection and try again.`); }
      return this.startOnce(model, precision);
    }
  }

  async connection() {
    const cfg = aiConfig(this.db);
    const model = this.db.getSetting("screen_model") || (cfg.provider === "gemini" ? cfg.model : "");
    const precision = this.db.getSetting("screen_precision") === "standard" ? "standard" : "high";
    const alive = this.run && this.run.model === model && this.run.precision === precision && this.run.child.exitCode === null;
    if (!alive) {
      this.stop();
      this.starting ??= this.start(model, precision).finally(() => { this.starting = null; });
      this.run = await this.starting;
    }
    return this.run;
  }

  async post(r, route, body) {
    let resp;
    try { resp = await fetch(`http://127.0.0.1:${r.port}${route}`, { method: "POST", headers: { "x-qp-token": r.token, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) }); }
    catch (e) { throw new Error(`The screen agent is not responding: ${e.message ?? e}`); }
    const v = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(v.error ?? "Screen agent request failed");
    return v;
  }

  commands() {
    const check = (goal, history, extra = 0) => { if (!String(goal).trim() || goal.length > 4000 || history.length > 40 || extra) throw new Error("Invalid request"); };
    return {
      screen_propose: async (_w, { goal, history, categories, pageText }) => { check(goal, history); return this.post(await this.connection(), "/propose", { goal, history, categories, page_text: pageText }); },
      screen_verify: async (_w, { goal, history, pending, pageText }) => { check(goal, history, String(pending).length > 300); return this.post(await this.connection(), "/verify", { goal, history, pending, page_text: pageText }); },
      screen_act: async (_w, { action }) => {
        if (!this.run) throw new Error("The screen agent is not running. Start a new task.");
        return this.post(this.run, "/act", { action });
      },
    };
  }
}
