import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { validateProfile } from '../../desktop/profile.mjs';
import { registerHdResources, expectedHdAvailabilityKeys } from '../../desktop/hd-profile.mjs';

const root = process.cwd(), local = path.join(root, '.local');
const history = path.resolve('../project-history/m2-4-final-20261022');
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const cleanup = await read(path.join(history, 'Final-Cleanup.json'));
assert.equal(cleanup.status, 'COMPLETE_SCOPED_DIRECT_RETIREMENT');
execFileSync('git', ['diff', '--quiet', cleanup.mainHead, '--', 'src', 'public', 'desktop', 'index.html']);
await assert.rejects(fs.access(path.resolve('../ra2-hd-m2-4-theaters')));
const profile = await validateProfile(local);
assert.equal(profile.manifest.files.length, 3);
assert.equal(profile.selections.get('/local-assets/yr/manifest.json').files.length, 7);
const previousUiRoot = process.env.RA2_UI_RESOURCE_ROOT;
process.env.RA2_UI_RESOURCE_ROOT = local;
const events = [];
let registered;
try { registered = await registerHdResources(local, event => events.push(event)); }
finally {
    if (previousUiRoot === undefined) delete process.env.RA2_UI_RESOURCE_ROOT;
    else process.env.RA2_UI_RESOURCE_ROOT = previousUiRoot;
}
assert.deepEqual(Object.keys(registered.availability).sort(), expectedHdAvailabilityKeys());
for (const [name, value] of Object.entries(registered.availability)) {
    if (name === 'sovietUnits') continue;
    assert.equal(value.startsWith('HD available'), !['unit-sqd', 'unit-yuripr'].includes(name), name);
}
for (const file of registered.routes.values()) {
    assert(file.startsWith(local + path.sep));
    assert.equal(await fs.realpath(file), file);
}
const current = await read(path.join(history, 'Final/SOURCE-AND-RESOURCES.json'));
for (const [route, expected] of Object.entries(current.selectedTheaters))
    assert.equal(registered.selections.get(route).revision, expected.revision);
const prepared = events.find(event => event.type === 'prepared-hd-registered');
assert.equal(prepared.index, current.preparedContract.sha256);
assert.equal(prepared.members, 448); assert.equal(prepared.pages, 1189);
const previous = await read('docs/m2-4-final-delivery-20261021.json');
for (const source of previous.sourceArchives) {
    const file = path.join(local, 'assets', source.name.includes('md') ? 'yr' : 'ra2', source.name);
    const data = await fs.readFile(file);
    assert.equal(data.length, source.bytes);
    assert.equal(createHash('sha256').update(data).digest('hex'), source.sha256);
}
const report = { status: 'PASS_CANONICAL_REGISTRATION_AFTER_TASK_AND_INTERMEDIATE_RETIREMENT',
    currentSource: root, resourceRoot: local, routes: registered.routes.size,
    selections: registered.selections.size, selectedTheaterLayers: Object.keys(current.selectedTheaters).length,
    prepared, originalArchivePins: 7, allRegisteredPathsInsideCanonicalLocal: true,
    allRegisteredPathsIndependentOfRetiredTask: true, acceptedSourceRuntimeUnchanged: true,
    originalPolicies: ['unit-sqd', 'unit-yuripr'], windows: 'NOT_RUN_ON_THIS_MAC' };
await fs.writeFile(path.join(history, 'Post-Retirement-Registration.json'), JSON.stringify(report, null, 2) + '\n');
cleanup.sourceResourceRegistration = report.status;
cleanup.postRetirementRoutes = report.routes;
cleanup.postRetirementPreparedMembers = 448;
cleanup.postRetirementPreparedPages = 1189;
await fs.writeFile(path.join(history, 'Final-Cleanup.json'), JSON.stringify(cleanup, null, 2) + '\n');
console.log(JSON.stringify(report));
