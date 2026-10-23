// Compare the integrated registration and pre-existing files against the saved main snapshot.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { registerHdResources } from '../../../desktop/hd-profile.mjs';

const root = process.cwd(), output = '.artifacts/yuri-cameos-main-integration-v1';
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const before = await read(output + '/pre-merge/registration.json');
const snapshot = await read(output + '/pre-merge/snapshot.json');
const events = [], hd = await registerHdResources(root + '/.local', event => events.push(event));
// JSON snapshots omit undefined object properties; compare the protocol representation.
const normalize = value => JSON.parse(JSON.stringify(value));
assert.deepEqual(hd.availability, before.availability);
for (const [key, value] of before.selections)
    if (!key.startsWith('/local-ui/')) assert.deepEqual(normalize(hd.selections.get(key)), value, key);
for (const [route, file] of before.routes)
    if (!route.startsWith('/local-ui/')) assert.equal(hd.routes.get(route), file, route);
let preserved = 0;
for (const item of snapshot.preservedInventory) {
    if (item.file === '.local/ui-selection.json') continue;
    const file = path.join(root, item.file), stat = await fs.lstat(file, { bigint: true });
    assert.equal(Number(stat.size), item.bytes, item.file);
    assert.equal(Number(stat.mtimeNs), item.mtimeNs, item.file);
    assert.equal(Number(stat.mode), item.mode, item.file);
    if (item.symlink !== undefined) assert.equal(await fs.readlink(file), item.symlink, item.file);
    if (item.sha256) assert.equal(createHash('sha256').update(await fs.readFile(file)).digest('hex'), item.sha256, item.file);
    preserved++;
}
const ui = hd.selections.get('/local-ui/selection.json');
assert.equal(ui.revision, 'yuri-cameos-e-main-v1'); assert.equal(ui.assets.length, 474);
const report = { status: 'PASS_C_WORLD_REGISTRATION_AND_EXISTING_RESOURCES_PRESERVED',
    preservedEntries: preserved, changedExistingFiles: ['.local/ui-selection.json'],
    routes: hd.routes.size, uiEntries: ui.assets.length, availability: hd.availability,
    selections: [...hd.selections], events, worldRoutesPreserved: true,
    preservationMethod: 'Exact pre-existing metadata and JSON hashes; immutable world files are never written. Native archives are not broadly rehashed.' };
await fs.writeFile(output + '/registration-after.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, preservedEntries: preserved, routes: hd.routes.size, uiEntries: ui.assets.length }));
