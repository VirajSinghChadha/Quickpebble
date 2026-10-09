// QP_SMOKE_SCREEN=1: starts the real Python screen agent (creating its private venv if needed) and exercises its safe endpoints.
import { app } from "electron";
export async function run({ commands, browser, screenAgent }) {
  const win = browser.windows.get("main");
  const t0 = Date.now();
  const r = await screenAgent.connection();
  console.log("SCREEN started", { port: r.port, secs: Math.round((Date.now() - t0) / 1000), tokenLen: r.token.length });
  console.log("SCREEN wait ->", JSON.stringify(await commands.screen_act(win, { action: { type: "wait" } })));
  try { await commands.screen_act(win, { action: { type: "format_disk" } }); console.log("SCREEN bad action -> ACCEPTED (bad)"); } catch (e) { console.log("SCREEN bad action rejected:", e.message); }
  const noToken = await fetch(`http://127.0.0.1:${r.port}/act`, { method: "POST", body: JSON.stringify({ action: { type: "wait" } }) });
  console.log("SCREEN without token ->", noToken.status);
  try { await commands.screen_propose(win, { goal: "x".repeat(5000), history: [] }); } catch (e) { console.log("SCREEN oversize goal rejected:", e.message); }
  screenAgent.stop();
  app.exit(0);
}
