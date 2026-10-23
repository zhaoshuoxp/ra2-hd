import { app, BrowserWindow } from 'electron';
import path from 'node:path';
const reviewFile = process.argv.find(arg => arg.endsWith('.html'));
if (!reviewFile || !path.isAbsolute(reviewFile)) throw Error('An absolute local review page is required');
app.setPath('userData', path.join(path.dirname(reviewFile), 'M2.1-Review-Browser-Profile'));
app.whenReady().then(async () => {
    const window = new BrowserWindow({ width: 1440, height: 1080, webPreferences: {
        contextIsolation: true, sandbox: true, nodeIntegration: false,
    } });
    await window.loadFile(reviewFile);
}).catch(error => { console.error(error); app.quit(); });
app.on('window-all-closed', () => app.quit());
