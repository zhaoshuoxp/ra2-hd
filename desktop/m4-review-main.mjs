import { app } from 'electron';
import path from 'node:path';

process.env.RA2_DESKTOP_USER_DATA ??= path.join(app.getPath('appData'), 'RA2 HD M4.1 Review 20261112');
process.env.RA2_CAMPAIGN_RESOURCE_ROOT = path.join(process.resourcesPath, 'GameResources/campaign');
process.env.RA2_CAMPAIGN_FROZEN_TERRAIN = '0';
await import('./distribution-main.mjs');
