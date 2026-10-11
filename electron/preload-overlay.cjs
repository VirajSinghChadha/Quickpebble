const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("overlay", {
  onState: (cb) => ipcRenderer.on("qp-overlay:state", (_e, s) => cb(s)),
  stop: () => ipcRenderer.send("qp-overlay:stop"),
  pause: () => ipcRenderer.send("qp-overlay:pause"),
  hover: (on) => ipcRenderer.send("qp-overlay:hover", !!on),
});
