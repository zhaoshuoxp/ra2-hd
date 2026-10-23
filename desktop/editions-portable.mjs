import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundledDirectory } from './bundled-layout.mjs';
import { ensurePortableRegistration } from './portable-registration.mjs';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.RA2_DESKTOP_USER_DATA ??= bundledDirectory(appRoot, 'Review-Profile');
process.env.RA2_UI_RESOURCE_ROOT ??= bundledDirectory(appRoot, 'RA2-HD-UI-Resources');
await ensurePortableRegistration(process.env.RA2_DESKTOP_USER_DATA,
    bundledDirectory(appRoot, 'RA2-HD-Editions-Resources'));
process.env.RA2_DESKTOP_NO_DISCOVERY ??= '1';
await import('./main.mjs');
