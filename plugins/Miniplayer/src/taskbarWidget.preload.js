const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  onTaskbarWidgetUpdate: (callback) =>
    ipcRenderer.on("miniplayer.taskbar.update", (_, data) => callback(data)),
});
