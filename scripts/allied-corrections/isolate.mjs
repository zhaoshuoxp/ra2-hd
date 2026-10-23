// Read selected immutable resources using this branch's committed catalogs.
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { validateProfile } from '../../desktop/profile.mjs';
import { registerHdResources, unitIdentities, sovietBatchRevisions } from '../../desktop/hd-profile.mjs';
import allied from '../../desktop/allied-building-coverage.json' with { type: 'json' };
import soviet from '../../desktop/soviet-building-coverage.json' with { type: 'json' };

const source = '/Users/Aone/RA2remaster/ra2-hd/.local';
const destination = path.resolve('.local');
assert.notEqual(destination, source);
const profile = await validateProfile(source);
const events = [];
const hd = await registerHdResources(source, event => events.push(event));
const files = new Set([...profile.routes.values(), ...hd.routes.values()].map(file => path.relative(source, file)));
for (const file of ['ra2-core-manifest.json', 'yr-core-manifest.json', 'upstream-support/manifest.json', 'ui-selection.json']) files.add(file);
files.add(`ui-packs/${hd.selections.get('/local-ui/selection.json').revision}/manifest.json`);
for (const entry of [...Object.values(allied), ...Object.values(soviet), ...Object.values(unitIdentities)]) files.add(entry.familyPath);
for (const [name, revision] of Object.entries(sovietBatchRevisions)) files.add(`hd-packs/soviet-${name}-authored/${revision}/family.json`);
for (const name of ['power-plant', 'soviet-power-plant']) files.add(`hd-packs/${name}-authored/owner-r3/family.json`);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
await fs.mkdir(destination, { recursive: true });
const inventory = [];
for (const file of [...files].sort()) {
    assert(!file.startsWith('..') && !path.isAbsolute(file));
    const original = path.join(source, file), copy = path.join(destination, file);
    assert.equal(await fs.realpath(original), original);
    await fs.mkdir(path.dirname(copy), { recursive: true });
    try { await fs.copyFile(original, copy, constants.COPYFILE_EXCL | constants.COPYFILE_FICLONE); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    const hash = digest(await fs.readFile(original));
    assert.equal(digest(await fs.readFile(copy)), hash);
    assert.notEqual((await fs.stat(original)).ino, (await fs.stat(copy)).ino);
    inventory.push({ file, sha256: hash, bytes: (await fs.stat(copy)).size });
}
const copied = await registerHdResources(destination);
assert.deepEqual(copied.availability, hd.availability);
assert.deepEqual([...copied.selections], [...hd.selections]);
await validateProfile(destination);
await fs.writeFile('.artifacts/allied-corrections/isolation.json', JSON.stringify({
    base: 'ee35fcf04de2d24c1bce2ee7497e4156483b21f1', source, destination,
    independentInodes: true, events, availability: hd.availability, inventory,
}, null, 2) + '\n');
console.log(`Verified ${inventory.length} independently copied selected files`);
