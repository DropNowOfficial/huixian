"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("relay", {
  state: () => ipcRenderer.invoke("state"),
  focus: (id) => ipcRenderer.invoke("focus", id),
  tile: (on) => ipcRenderer.invoke("tile", on),
  home: (id) => ipcRenderer.invoke("home", id),
  reload: (id) => ipcRenderer.invoke("reload", id),
  deliver: (payload) => ipcRenderer.invoke("deliver", payload),
  capture: (id) => ipcRenderer.invoke("capture", id),
  onStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("status", listener);
    return () => ipcRenderer.removeListener("status", listener);
  },
});
