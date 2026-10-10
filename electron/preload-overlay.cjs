const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("overlay", {
  onState: (cb) => ipcRenderer.on("qp-overlay:state", (_e, s) => cb(s)),
  stop: () => ipcRenderer.send("qp-overlay:stop"),
  hover: (on) => ipcRenderer.send("qp-overlay:hover", !!on),
});
