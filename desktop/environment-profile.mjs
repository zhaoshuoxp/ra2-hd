import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { safeFile } from './profile.mjs';
import contract from './environment-hd-contract.json' with { type: 'json' };
import snowContract from './environment-snow-hd-contract.json' with { type: 'json' };
import urbanContract from './environment-urban-hd-contract.json' with { type: 'json' };
import newurbanContract from './environment-newurban-hd-contract.json' with { type: 'json' };
import desertContract from './environment-desert-hd-contract.json' with { type: 'json' };

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export async function registerEnvironmentPack(root, record, contract, pointerFile, selectionRoute) {
    const routes = new Map(), selections = new Map();
    if (!contract.selectedPack) return { routes, selections };
    try {
        const pointer = JSON.parse(await fs.readFile(await safeFile(root, pointerFile,
            { maxBytes: 4096 }), 'utf8'));
        if (!same(pointer, contract.selectedPack) || !/^[a-z0-9-]+$/.test(pointer.revision))
            throw Error('Environment selection identity mismatch');
        const directory = `environment-packs/${pointer.revision}`;
        const bytes = await fs.readFile(await safeFile(root, `${directory}/manifest.json`, { maxBytes: 2 * 1024 * 1024 }));
        if (digest(bytes) !== pointer.sha256) throw Error('Environment pack hash mismatch');
        const manifest = JSON.parse(bytes);
        const identities = Object.keys(manifest.families ?? {});
        if (manifest.schema !== 'environment-shp-pack-v1' || manifest.theater !== contract.theater
            || !identities.length || identities.some(identity => !contract.families[identity]))
            throw Error('Environment complete catalog mismatch');
        const registered = {};
        for (const identity of identities) {
            const declared = contract.families[identity];
            const family = manifest.families[identity];
            if (family.familyHash !== declared.familyHash
                || !same(family.members.map(m => m.member).sort(), declared.members))
                throw Error('Environment family identity mismatch');
            const members = [];
            for (const member of family.members) {
                if (!/^[a-f0-9]{64}$/.test(member.sha256)
                    || !/^members\/[a-z0-9_-]+\/manifest\.json$/.test(member.path))
                    throw Error('Environment member path');
                const file = await safeFile(root, `${directory}/${member.path}`, { maxBytes: 2 * 1024 * 1024 });
                const bytes = await fs.readFile(file);
                if (digest(bytes) !== member.sha256) throw Error('Environment member manifest hash');
                const hd = JSON.parse(bytes);
                const native = declared.sourceOverrides?.[member.member] ?? contract.sources[member.member];
                if (!native || hd.source?.member !== member.member || hd.source?.sha256 !== native.sha256)
                    throw Error('Environment native source identity');
                const prefix = `/local-environment/${pointer.sha256}/${member.sha256}/`;
                routes.set(prefix + 'manifest.json', file);
                const files = {}, folder = member.path.slice(0, -'manifest.json'.length);
                for (const variant of hd.variants) for (const page of variant.pages) {
                    if (![2, 4].includes(variant.density) || !/^[a-zA-Z0-9_-]+$/.test(page.id))
                        throw Error('Environment page identity');
                    for (const role of ['base', 'data']) {
                        if (!/^[a-zA-Z0-9_-]+\.png$/.test(page[role]) || files[page[role]])
                            throw Error('Environment page filename');
                        const route = `${prefix}${variant.density}/${page.id}/${role}.png`;
                        files[page[role]] = route;
                        // Missing pages retain the complete family's native fallback.
                        // Runtime verifies SHA and metadata before any publication.
                        try { routes.set(route, await safeFile(root,
                            `${directory}/${folder}${variant.density}/${page.id}/${role}.png`,
                            { bytes: page[`${role}Bytes`], maxBytes: 32 * 1024 * 1024 })); }
                        catch { /* Family transaction validates optional page availability. */ }
                    }
                }
                members.push({ member: member.member, sha256: member.sha256,
                    manifest: prefix + 'manifest.json', files });
            }
            registered[identity] = { familyHash: family.familyHash, members };
        }
        selections.set(selectionRoute, { ...manifest, families: registered });
        record({ type: 'environment-registered', theater: contract.theater, revision: pointer.revision, sha256: pointer.sha256 });
    } catch (error) {
        routes.clear(); selections.clear();
        record({ type: 'environment-original', theater: contract.theater, reason: String(error) });
    }
    return { routes, selections };
}

export async function registerEnvironmentResources(root, record = () => {}) {
    const result = await registerEnvironmentPack(root, record, contract,
        'environment-selection.json', '/local-environment/selection.json');
    for (const contract of [snowContract, urbanContract, newurbanContract, desertContract]) {
        const theater = contract.theater.toLowerCase();
        const extra = await registerEnvironmentPack(root, record, contract,
            `environment-${theater}-selection.json`, `/local-environment/${theater}/selection.json`);
        for (const [key, value] of extra.routes) result.routes.set(key, value);
        for (const [key, value] of extra.selections) result.selections.set(key, value);
    }
    return result;
}
