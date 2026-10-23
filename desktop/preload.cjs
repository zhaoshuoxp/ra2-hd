const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktopProfile', {
    choose: () => ipcRenderer.invoke('desktop:choose-profile'),
});

contextBridge.exposeInMainWorld('desktopDisplay', {
    get: () => ipcRenderer.invoke('desktop:display-get'),
    set: id => ipcRenderer.invoke('desktop:display-set', id),
});

contextBridge.exposeInMainWorld('desktopApp', {
    quit: () => ipcRenderer.invoke('desktop:quit'),
    preparePointer: () => ipcRenderer.invoke('desktop:prepare-pointer'),
    restorePointer: position => ipcRenderer.invoke('desktop:restore-pointer', position),
});
