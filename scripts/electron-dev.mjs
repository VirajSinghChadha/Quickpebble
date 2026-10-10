// Starts Vite and the Chromium shell together, with hot reload for the UI.
import { spawn } from "node:child_process";
const vite = spawn("npx", ["vite", "--port", "1420", "--strictPort"], { stdio: ["ignore", "pipe", "inherit"], shell: process.platform === "win32" });
vite.stdout.on("data", (d) => {
  process.stdout.write(d);
  if (/Local:\s+http:\/\/localhost:1420/.test(String(d)) && !globalThis.started) {
    globalThis.started = true;
    const app = spawn("npx", ["electron", "."], { stdio: "inherit", env: { ...process.env, QP_DEV_URL: "http://localhost:1420/" }, shell: process.platform === "win32" });
    app.on("exit", () => { vite.kill(); process.exit(0); });
  }
});
