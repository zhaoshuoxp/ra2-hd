import { app } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { distributionCandidates, discoverDistributionResources, registerDistributionResources } from './distribution-layout.mjs';

const icon = fileURLToPath(new URL('./icons/app-icon.png', import.meta.url));
app.on('browser-window-created', (_, window) => {
    if (process.platform !== 'darwin') window.setIcon(icon);
});
app.whenReady().then(() => { if (process.platform === 'darwin') app.dock.setIcon(icon); });

const userData = process.env.RA2_DESKTOP_USER_DATA ?? path.join(app.getPath('appData'), 'Red Alert 2 HD');
process.env.RA2_DESKTOP_USER_DATA = userData;
process.env.RA2_DESKTOP_NO_DISCOVERY = '1';
const resources = await discoverDistributionResources(distributionCandidates(process.resourcesPath, userData));
if (resources) {
    process.env.RA2_UI_RESOURCE_ROOT = resources;
    await registerDistributionResources(userData, resources);
}
await import('./main.mjs');
