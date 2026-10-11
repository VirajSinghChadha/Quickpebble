// QP_SMOKE_AGENT=1 (developer only): runs the real screen-agent loop against live Gemini with a harmless goal and the status bar showing.
// Needs GEMINI_API_KEY in the environment. Only low-risk actions are allowed; anything else stops the run.
import { app } from "electron";
import { execFile } from "node:child_process";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SAFE = new Set(["open_app", "wait", "scroll", "click", "done", "ask"]);
const describe = (a) => (a.type === "open_app" ? `Open ${a.app}` : a.cell ? `${a.type} ${a.cell}` : a.type);

export async function run({ browser, commands, statusBar }) {
  const win = browser.windows.get("main");
  const goal = process.env.QP_SMOKE_GOAL || "Open the Notes app. Do nothing else. Once Notes is open on screen, finish.";
  commands.settings_set(win, { key: "ai_provider", value: "gemini" });
  commands.settings_set(win, { key: "ai_model", value: process.env.QP_SMOKE_MODEL || "gemini-3.5-flash-lite" });
  commands.settings_set(win, { key: "screen_precision", value: "standard" });
  const history = [];
  let outcome = "ran out of steps";
  for (let step = 1; step <= 8; step++) {
    commands.screen_overlay(win, { state: { phase: "looking", step, max: 8 } });
    let res;
    try { res = await commands.screen_propose(win, { goal, history }); }
    catch (e) { outcome = `propose failed: ${e.message}`; commands.screen_overlay(win, { state: { phase: "error", thinking: String(e.message) } }); break; }
    const { user, action } = res;
    console.log(`STEP ${step}: ${describe(action)} | risk=${action.risk} category=${action.category}`);
    console.log(`  thinking: ${user.thinking}`);
    console.log(`  message:  ${user.message}`);
    commands.screen_overlay(win, { state: { phase: "thinking", thinking: user.thinking, next: `${describe(action)}: ${user.message}`, step, max: 8 } });
    await sleep(1800);
    if (process.env.QP_SMOKE_CAPTURE && step === 1) await new Promise((r) => execFile(process.env.QP_SMOKE_PY, [process.env.QP_SMOKE_CAPTURE], () => r()));
    if (action.type === "done") { outcome = `finished: ${user.message}`; commands.screen_overlay(win, { state: { phase: "done", thinking: user.message } }); break; }
    if (action.type === "ask") { outcome = `asked: ${user.message}`; commands.screen_overlay(win, { state: { phase: "waiting", thinking: user.message } }); break; }
    if (!SAFE.has(action.type) || action.risk === "high") { outcome = `stopped: action not allowed in this test (${describe(action)})`; commands.screen_overlay(win, { state: { phase: "error", thinking: outcome } }); break; }
    commands.screen_overlay(win, { state: { phase: "acting", thinking: user.thinking, next: describe(action), step, max: 8 } });
    try { const r = await commands.screen_act(win, { action }); console.log(`  acted -> ${JSON.stringify(r)}`); history.push(`${step}. ${describe(action)}`); }
    catch (e) { outcome = `act failed: ${e.message}`; commands.screen_overlay(win, { state: { phase: "error", thinking: String(e.message) } }); break; }
    await sleep(1500);
  }
  console.log(`OUTCOME: ${outcome}`);
  await sleep(2500);
  statusBar.hide();
  app.exit(/finished/.test(outcome) ? 0 : 1);
}
