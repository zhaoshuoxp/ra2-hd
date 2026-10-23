import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { validateProfile } from '../../desktop/profile.mjs';
import { registerHdResources, expectedHdAvailabilityKeys } from '../../desktop/hd-profile.mjs';

const root = process.cwd(), local = path.join(root, '.local');
const history = path.resolve('../project-history/m2-complete-20261022');
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
assert.equal(execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(), 'main');
execFileSync('git', ['diff', '--quiet', 'fbaac0f5', '--', 'src', 'desktop', 'public', 'package.json', 'bun.lock']);
execFileSync('git', ['merge-base', '--is-ancestor', 'ce852200', 'HEAD']);
const profile = await validateProfile(local);
assert.equal(profile.selections.get('/local-assets/yr/manifest.json').files.length, 7);
process.env.RA2_UI_RESOURCE_ROOT = local;
const events = [];
const hd = await registerHdResources(local, event => events.push(event));
assert.deepEqual(Object.keys(hd.availability).sort(), expectedHdAvailabilityKeys());
for (const [name, value] of Object.entries(hd.availability)) {
    if (name === 'sovietUnits') continue;
    assert.equal(value.startsWith('HD available'), !['unit-sqd', 'unit-yuripr'].includes(name), name);
}
for (const file of hd.routes.values()) {
    assert(file.startsWith(local + path.sep)); assert.equal(await fs.realpath(file), file);
}
const accepted = await read('../project-history/m2-4-final-20261022/Final/SOURCE-AND-RESOURCES.json');
for (const [route, selected] of Object.entries(accepted.selectedTheaters))
    assert.equal(hd.selections.get(route).revision, selected.revision);
const prepared = events.find(event => event.type === 'prepared-hd-registered');
assert.equal(prepared.index, accepted.preparedContract.sha256);
assert.equal(prepared.members, 448); assert.equal(prepared.pages, 1189);
const protection = await read(path.join(history, 'Canonical-Resources-Before.json'));
for (const [relative, expected] of Object.entries(protection.files)) {
    const info = await fs.stat(path.join(root, relative), { bigint: true });
    assert.deepEqual({ bytes: String(info.size), inode: String(info.ino), mtimeNs: String(info.mtimeNs) }, expected, relative);
}
const report = { status: 'PASS_CANONICAL_MAIN_REGISTRATION_AND_UNCHANGED_ACTIVE_RESOURCES',
    sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    runtimeSourceHead: 'fbaac0f53fc6f0a93b570d8fcf26b2658e68a69b',
    resourceRoot: local, resourcePins: Object.keys(protection.files).length,
    routes: hd.routes.size, selections: hd.selections.size, selectedTheaterLayers: 10,
    originalArchivePins: 7, prepared, allRegisteredPathsInsideCanonicalLocal: true,
    returnedWindowsSourceAncestryPreserved: true, windows: 'NOT_RUN_ON_THIS_MAC' };
await fs.writeFile(path.join(history, 'Post-Cleanup-Registration.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
