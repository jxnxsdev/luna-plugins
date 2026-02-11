const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onMiniplayerUpdate: (callback) => ipcRenderer.on('miniplayer.update', (_, data) => callback(data))
});

contextBridge.exposeInMainWorld('sendIPC', (channel, data) => {
  ipcRenderer.send(channel, data);
});