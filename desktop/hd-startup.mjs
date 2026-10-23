import { setTimeout } from 'node:timers/promises';
import { registerHdResources } from './hd-profile.mjs';

// A transient filesystem miss must not select Original for the entire session.
// Each retry performs the same path, identity and complete-family validation.
export async function registerHdResourcesWhenReady(root, record = () => {}, {
    requireComplete = false, deferPageHashes = false, register = registerHdResources, wait = setTimeout,
} = {}) {
    const delays = [250, 750, 1500];
    for (let attempt = 0; ; attempt++) {
        const events = [];
        const hd = await register(root, event => events.push(event), { deferPageHashes });
        const missing = events.filter(event => event.type === 'hd-unavailable' && event.code === 'ENOENT');
        if (missing.length && attempt < delays.length) {
            record({ type: 'hd-startup-retry', attempt: attempt + 1, delayMs: delays[attempt], failures: missing });
            await wait(delays[attempt]);
            continue;
        }
        events.forEach(record);
        if (missing.length && requireComplete) {
            throw new Error('Packaged HD resources are not ready. Keep the app and its resources together, '
                + 'wait for the files to finish becoming available, then restart. Missing families: '
                + missing.map(event => event.family).join(', '));
        }
        record({ type: 'hd-startup-ready', attempts: attempt + 1, missingFamilies: missing.map(event => event.family) });
        return hd;
    }
}
