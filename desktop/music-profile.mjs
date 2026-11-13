import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import contract from './music-contract.json' with { type: 'json' };
import yrContract from './music-yr-contract.json' with { type: 'json' };
import { safeFile } from './profile.mjs';

export async function registerMusicResources(profile, record = () => {}, edition = 'ra2') {
    if (!['ra2', 'yr'].includes(edition)) throw Error('Unsupported original music edition');
    const selected = edition === 'yr' ? yrContract : contract;
    try {
        const manifestPath = await safeFile(profile.root, `music/${edition}/manifest.json`, { maxBytes: 65536 });
        const bytes = await fs.readFile(manifestPath);
        if (createHash('sha256').update(bytes).digest('hex') !== selected.manifestSha256) throw Error('Original music manifest identity mismatch');
        const manifest = JSON.parse(bytes), routes = new Map();
        if (manifest.edition !== edition || selected.edition !== edition) throw Error('Original music edition mismatch');
        for (const entry of selected.files) {
            if (!/^[a-z0-9-]+\.mp3$/.test(entry.name)) throw Error('Unsafe music filename');
            const file = await safeFile(profile.root, `music/${edition}/` + entry.name, { bytes: entry.bytes });
            if (createHash('sha256').update(await fs.readFile(file)).digest('hex') !== entry.sha256) throw Error(`Original music integrity failure: ${entry.name}`);
            const route = `/local-music/${edition}/` + entry.name;
            if (profile.routes.has(route) && profile.routes.get(route) !== file) throw Error('Conflicting original music route');
            routes.set(route, file);
        }
        for (const [route, file] of routes) profile.routes.set(route, file);
        profile.selections.set(`/local-music/${edition}/manifest.json`, manifest);
        record({ type: 'original-music-ready', edition, tracks: routes.size });
        return true;
    } catch (error) {
        record({ type: 'original-music-unavailable', edition, message: error.message });
        return false;
    }
}
