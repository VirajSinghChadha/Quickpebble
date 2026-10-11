const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("quickdo", {
  state: () => ipcRenderer.invoke("qp-quickdo:state"),
  onOpen: (cb) => ipcRenderer.on("qp-quickdo:open", (_e, s) => cb(s)),
  run: (instruction, text) => ipcRenderer.invoke("qp-quickdo:run", String(instruction ?? ""), String(text ?? "")),
  copy: (draft) => ipcRenderer.invoke("qp-quickdo:copy", String(draft ?? "")),
  paste: (draft) => ipcRenderer.invoke("qp-quickdo:paste", String(draft ?? "")),
  close: () => ipcRenderer.send("qp-quickdo:close"),
});
