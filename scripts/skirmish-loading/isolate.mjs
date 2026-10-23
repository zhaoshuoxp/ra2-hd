import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { validateProfile } from '../../desktop/profile.mjs';
import { registerHdResources, expectedHdAvailabilityKeys, unitIdentities, sovietBatchRevisions } from '../../desktop/hd-profile.mjs';
import allied from '../../desktop/allied-building-coverage.json' with { type: 'json' };
import soviet from '../../desktop/soviet-building-coverage.json' with { type: 'json' };
import yuri from '../../desktop/yuri-building-coverage.json' with { type: 'json' };

const sources = process.argv.slice(2).map(p => path.resolve(p));
assert(sources.length >= 1);
const destination = path.resolve('.local');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
await fs.mkdir(destination, { recursive: true });
const candidates = new Map(), metadata = new Map(), events = [];
const add = (file, root, hash) => {
    const relative = path.relative(root, file);
    assert(!relative.startsWith('..') && !path.isAbsolute(relative));
    const list = candidates.get(relative) ?? [];
    list.push({ file, hash }); candidates.set(relative, list);
};
for (const entry of [...Object.values(allied), ...Object.values(soviet), ...Object.values(yuri), ...Object.values(unitIdentities)])
    metadata.set(entry.familyPath, entry.familyHash ?? entry.hash);
for (const [name, revision] of Object.entries(sovietBatchRevisions))
    metadata.set(`hd-packs/soviet-${name}-authored/${revision}/family.json`, undefined);
for (const name of ['power-plant', 'soviet-power-plant'])
    metadata.set(`hd-packs/${name}-authored/owner-r3/family.json`, undefined);
for (const [index, root] of sources.entries()) {
    assert.notEqual(root, destination);
    const hd = await registerHdResources(root, event => events.push({ root, ...event }));
    for (const file of hd.routes.values()) add(file, root);
    if (!index) {
        const profile = await validateProfile(root);
        for (const file of profile.routes.values()) add(file, root);
        for (const file of ['ra2-core-manifest.json', 'yr-core-manifest.json', 'upstream-support/manifest.json', 'ui-selection.json'])
            add(path.join(root, file), root);
    }
    const ui = hd.selections.get('/local-ui/selection.json');
    if (ui) add(path.join(root, `ui-packs/${ui.revision}/manifest.json`), root);
    for (const [relative, hash] of metadata) {
        const file = path.join(root, relative);
        add(file, root, hash);
        try {
            const bytes = await fs.readFile(file);
            if (hash && digest(bytes) !== hash) continue;
            const family = JSON.parse(bytes);
            // Identical turret hashes share a URI, but registration requires
            // every selected family's own declared dependency paths.
            for (const binding of Object.values(family.turrets ?? {})) {
                const manifestFile = path.join(root, binding.path, 'manifest.json');
                add(manifestFile, root, binding.sha256);
                const manifest = JSON.parse(await fs.readFile(manifestFile));
                for (const frame of manifest.headings) for (const role of ['base', 'mask'])
                    add(path.join(root, binding.path, frame[role]), root, frame[`${role}Sha256`]);
            }
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
}
const inventory = [];
for (const [relative, choices] of [...candidates].sort((a, b) => a[0].localeCompare(b[0]))) {
    let selected;
    for (const candidate of choices) {
        try {
            assert.equal(await fs.realpath(candidate.file), candidate.file);
            const bytes = await fs.readFile(candidate.file), sha256 = digest(bytes);
            if (candidate.hash && candidate.hash !== sha256) continue;
            selected = { ...candidate, sha256, bytes: bytes.length }; break;
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    assert(selected, `Missing pinned resource: ${relative}`);
    const copy = path.join(destination, relative);
    await fs.mkdir(path.dirname(copy), { recursive: true });
    try { await fs.copyFile(selected.file, copy, constants.COPYFILE_EXCL | constants.COPYFILE_FICLONE); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    assert.equal(digest(await fs.readFile(copy)), selected.sha256);
    assert.notEqual((await fs.stat(copy)).ino, (await fs.stat(selected.file)).ino);
    inventory.push({ file: relative, source: selected.file, sha256: selected.sha256, bytes: selected.bytes });
}
await validateProfile(destination);
const hd = await registerHdResources(destination);
assert.deepEqual(Object.keys(hd.availability).sort(), expectedHdAvailabilityKeys());
for (const [key, value] of Object.entries(hd.availability)) {
    if (key === 'sovietUnits') continue;
    assert.equal(value.startsWith('HD available'), !['unit-sqd', 'unit-yuripr'].includes(key), `${key}: ${value}`);
}
await fs.writeFile('.artifacts/skirmish-loading/isolation.json', JSON.stringify({
    status: 'PASS_PINNED_INDEPENDENT_RESOURCE_COPY', sources, destination, independentInodes: true,
    availability: hd.availability, inventory, sourceEvents: events,
}, null, 2) + '\n');
console.log(`Verified ${inventory.length} independent selected files`);
