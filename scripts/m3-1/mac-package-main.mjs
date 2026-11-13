// Installed beside the frozen desktop modules by package-mac.mjs.
import { app } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';

const metadata = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
const title = metadata.productName ?? 'Red Alert 2 HD M3.1 Campaign';
const resources = path.join(process.resourcesPath, 'GameResources');
process.env.RA2_DESKTOP_USER_DATA ??= path.join(app.getPath('appData'), 'RA2 HD M3.1 Campaign Test 20261023');
process.env.RA2_DESKTOP_NO_DISCOVERY = '1';
process.env.RA2_UI_RESOURCE_ROOT = resources;
process.env.RA2_CAMPAIGN_RESOURCE_ROOT = path.join(resources, 'campaign');
process.env.RA2_CAMPAIGN_FROZEN_TERRAIN = '1';
app.on('browser-window-created', (_, window) => {
    window.setTitle(title);
    window.on('page-title-updated', event => { event.preventDefault(); window.setTitle(title); });
});
await import('./distribution-main.mjs');
app.setName(title);
