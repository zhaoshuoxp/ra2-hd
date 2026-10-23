// Clone the selected immutable baseline into a private resource root.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { registerHdResources, unitIdentities, sovietBatchRevisions } from '../../../desktop/hd-profile.mjs';
import { validateProfile } from '../../../desktop/profile.mjs';

const source = path.resolve(process.argv[2]);
const destination = path.resolve('.local');
const output = path.resolve(process.argv[3]);
assert(source !== destination);
process.env.RA2_UI_RESOURCE_ROOT = source;
const events = [], hd = await registerHdResources(source, event => events.push(event));
const native = await validateProfile(source);
const files = new Set([...hd.routes.values(), ...native.routes.values()]);
for (const name of ['power-plant-authored/owner-r3', 'soviet-power-plant-authored/owner-r3',
    ...Object.entries(sovietBatchRevisions).map(([name, revision]) => `soviet-${name}-authored/${revision}`)])
    files.add(path.join(source, 'hd-packs', name, 'family.json'));
for (const name of ['terrain', 'environment', 'ui']) {
    const file = path.join(source, `${name}-selection.json`);
    const pointer = JSON.parse(await fs.readFile(file, 'utf8'));
    files.add(file);
    files.add(path.join(source, `${name}-packs`, pointer.revision, 'manifest.json'));
}
const prepared = JSON.parse(await fs.readFile('desktop/prepared-hd-contract.json'));
files.add(path.join(source, prepared.indexPath));
files.add(path.join(source, 'prepared-hd/proofs', `${prepared.sha256}.json`));
for (const name of ['ra2-core-manifest.json', 'yr-core-manifest.json', 'upstream-support/manifest.json'])
    files.add(path.join(source, name));
// Include validated descriptors and family-relative turret inputs even when routes deduplicate them.
const catalogs = [unitIdentities];
for (const name of ['allied-building-coverage', 'soviet-building-coverage', 'yuri-building-coverage',
    'yuri-unit-contracts']) catalogs.push(JSON.parse(await fs.readFile(`desktop/${name}.json`)));
for (const catalog of catalogs) {
    for (const entry of Object.values(catalog.shp ?? catalog)) {
        if (!entry.familyPath) continue;
        const file = path.join(source, entry.familyPath);
        files.add(file);
        const family = JSON.parse(await fs.readFile(file));
        for (const turret of Object.values(family.turrets ?? {})) {
            const manifestFile = path.join(source, turret.path, 'manifest.json');
            files.add(manifestFile);
            const manifest = JSON.parse(await fs.readFile(manifestFile));
            for (const frame of manifest.headings) for (const role of ['base', 'mask'])
                files.add(path.join(source, turret.path, frame[role]));
        }
    }
}
// Prototype descriptors are separately pinned by the legacy registration routes.
for (const file of [...files]) {
    if (file.endsWith('/manifest.json') && file.includes('/hd-packs/')) {
        const family = path.join(path.dirname(file), 'family.json');
        if (await fs.stat(family).catch(() => undefined)) files.add(family);
    }
}
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const entries = [];
let added = 0, identical = 0;
for (const file of [...files].sort()) {
    const relative = path.relative(source, file);
    assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
    assert((await fs.lstat(file)).isFile(), relative);
    const bytes = await fs.readFile(file), hash = sha(bytes);
    const target = path.join(destination, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    if (await fs.lstat(target).catch(() => undefined)) {
        assert((await fs.lstat(target)).isFile() && sha(await fs.readFile(target)) === hash, relative);
        identical++;
    } else {
        await fs.copyFile(file, target, fs.constants.COPYFILE_EXCL | fs.constants.COPYFILE_FICLONE);
        assert.equal(sha(await fs.readFile(target)), hash, relative);
        added++;
    }
    entries.push({ path: relative, bytes: bytes.length, sha256: hash });
}
process.env.RA2_UI_RESOURCE_ROOT = destination;
const copied = await registerHdResources(destination);
assert.deepEqual(copied.availability, hd.availability);
await validateProfile(destination);
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, JSON.stringify({ schema: 'm2-3-baseline-clone-v1',
    policy: 'ADD_IF_ABSENT_OR_IDENTICAL', source, destination, added, identical, events, entries }, null, 2) + '\n',
    { flag: 'wx' });
console.log(JSON.stringify({ added, identical, files: entries.length, events: events.filter(e =>
    /terrain|environment|prepared/.test(e.type)), availability: copied.availability }));
