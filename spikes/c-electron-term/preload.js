const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("term", {
  spawn: (id) => ipcRenderer.send("spawn", id),
  input: (id, data) => ipcRenderer.send("input", id, data),
  resize: (id, cols, rows) => ipcRenderer.send("resize", id, cols, rows),
  ready: () => ipcRenderer.send("ready"),
  onData: (cb) => ipcRenderer.on("data", (_e, id, d) => cb(id, d)),
})
