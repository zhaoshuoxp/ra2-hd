import { app, BrowserWindow } from 'electron';
import path from 'node:path';
const review = process.argv.find(argument => argument.endsWith('.html'));
if (!review || !path.isAbsolute(review)) throw Error('An absolute offline review path is required');
const profile = process.argv.find(argument => argument.startsWith('--review-profile='))?.split('=').slice(1).join('=');
app.setPath('userData', profile ?? path.join(path.dirname(review), 'M2.2-Direction-Review-Profile'));
app.whenReady().then(async () => {
    const window = new BrowserWindow({ width: 1440, height: 1100,
        webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false } });
    await window.loadFile(review);
}).catch(error => { console.error(error); app.quit(); });
app.on('window-all-closed', () => app.quit());
