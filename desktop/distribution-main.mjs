import { app } from 'electron';
import path from 'node:path';
import { distributionCandidates, discoverDistributionResources, registerDistributionResources } from './distribution-layout.mjs';

const userData = process.env.RA2_DESKTOP_USER_DATA ?? path.join(app.getPath('appData'), 'Red Alert 2 HD');
process.env.RA2_DESKTOP_USER_DATA = userData;
process.env.RA2_DESKTOP_NO_DISCOVERY = '1';
const resources = await discoverDistributionResources(distributionCandidates(process.resourcesPath, userData));
if (resources) {
    process.env.RA2_UI_RESOURCE_ROOT = resources;
    await registerDistributionResources(userData, resources);
}
await import('./main.mjs');
