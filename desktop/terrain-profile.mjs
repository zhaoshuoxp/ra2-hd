import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { safeFile } from './profile.mjs';
import contract from './terrain-hd-contract.json' with { type: 'json' };
import theaterContracts from './terrain-theater-hd-contracts.json' with { type: 'json' };

async function registerTerrainPack(root, record, contract, theater, pointerFile, selectionRoute) {
    const routes = new Map(), selections = new Map();
    try {
        const pointer = JSON.parse(await fs.readFile(await safeFile(root, pointerFile, { maxBytes: 4096 }), 'utf8'));
        if (pointer.schemaVersion !== 1 || pointer.revision !== contract.revision || pointer.sha256 !== contract.sha256)
            throw Error('Terrain selection identity mismatch');
        const directory = `terrain-packs/${pointer.revision}`;
        const bytes = await fs.readFile(await safeFile(root, `${directory}/manifest.json`, { maxBytes: 2 * 1024 * 1024 }));
        if (createHash('sha256').update(bytes).digest('hex') !== pointer.sha256) throw Error('Terrain manifest hash mismatch');
        const manifest = JSON.parse(bytes);
        if (manifest.schema !== 'tmp-terrain-hd-v1' || manifest.revision !== pointer.revision
            || manifest.theater !== theater) throw Error('Terrain schema mismatch');
        for (const group of manifest.groups) for (const variant of group.variants) {
            if (!/^[a-z0-9-]+\.rgba$/.test(variant.file) || ![2, 4].includes(variant.density)) throw Error('Terrain atlas path');
            // Page bytes are verified during the bounded group transaction at load.
            try { routes.set(`/local-terrain/${pointer.revision}/${variant.file}`,
                await safeFile(root, `${directory}/${variant.file}`, { bytes: variant.size[0] * variant.size[1] * 4 })); }
            catch { /* The complete affected group remains native. */ }
        }
        selections.set(selectionRoute, manifest);
        record({ type: 'terrain-registered', theater, revision: pointer.revision, sha256: pointer.sha256, scope: manifest.scope });
    } catch (error) {
        record({ type: 'terrain-original', theater, reason: String(error) });
        routes.clear(); selections.clear();
    }
    return { routes, selections };
}

export async function registerTerrainResources(root, record = () => {}) {
    const result = await registerTerrainPack(root, record, contract, 'TEMPERATE',
        'terrain-selection.json', '/local-terrain/selection.json');
    for (const [theater, selected] of Object.entries(theaterContracts)) {
        if (!['SNOW', 'URBAN', 'NEWURBAN', 'DESERT'].includes(theater)) throw Error('Unknown terrain theater contract');
        const name = theater.toLowerCase();
        const extra = await registerTerrainPack(root, record, selected, theater,
            `terrain-${name}-selection.json`, `/local-terrain/${name}/selection.json`);
        for (const [key, value] of extra.routes) result.routes.set(key, value);
        for (const [key, value] of extra.selections) result.selections.set(key, value);
    }
    return result;
}
