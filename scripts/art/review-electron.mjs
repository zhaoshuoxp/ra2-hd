// Use an isolated profile for offline review validation without a browser download.
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const profile = path.resolve(process.argv.at(-1));
if (path.basename(profile) !== 'test-profile') throw Error('Expected an isolated review test profile');
fs.mkdirSync(profile, { recursive: true });
app.setPath('userData', profile);
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');
app.on('window-all-closed', () => {});
app.whenReady().then(() => {});
