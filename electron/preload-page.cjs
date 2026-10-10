// Runs in every web page before its own scripts. Pages get a tiny allow-listed bridge; the calling tab is
// identified in the main process from the sender, never from the payload.
const { contextBridge, ipcRenderer, webFrame } = require("electron");
const ALLOWED = new Set(["qp_report", "qp_shortcut", "qp_blocked", "qp_agent_result", "qp_login_seen"]);
contextBridge.exposeInMainWorld("__qpPage", {
  invoke: (cmd, args) => (ALLOWED.has(cmd) ? ipcRenderer.invoke("qp:page", cmd, args) : Promise.reject(new Error("not allowed"))),
});
try {
  const script = ipcRenderer.sendSync("qp:page-script");
  if (script) webFrame.executeJavaScript(script);
} catch { /* a page must never fail to load because of us */ }
