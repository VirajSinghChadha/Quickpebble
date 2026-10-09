// Bridge for Quick Pebble's own UI (never loaded into web pages).
const { contextBridge, ipcRenderer } = require("electron");
const arg = process.argv.find((a) => a.startsWith("--qp-window="));
const label = arg ? arg.slice("--qp-window=".length) : "main";
contextBridge.exposeInMainWorld("qp", {
  label,
  platform: process.platform,
  invoke: (cmd, args) => ipcRenderer.invoke("qp:invoke", cmd, args ?? {}),
  on: (event, cb) => {
    const h = (_e, payload) => cb(payload);
    ipcRenderer.on(event, h);
    return () => ipcRenderer.removeListener(event, h);
  },
});
