import { app, BrowserWindow } from 'electron';
let window;
app.whenReady().then(async () => {
    window = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true } });
    await window.loadURL('about:blank');
});
