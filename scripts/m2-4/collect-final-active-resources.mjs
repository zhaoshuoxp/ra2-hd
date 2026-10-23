// Record actual registration reads and routes for additive transfer and independent packaging.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { validateProfile } from '../../desktop/profile.mjs';
import { registerHdResources } from '../../desktop/hd-profile.mjs';

const [output] = process.argv.slice(2);
assert(output);
const root = path.resolve('.local');
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
assert.equal(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(), '');
assert(!process.env.RA2_UI_RESOURCE_ROOT, 'Collect the selected sibling UI root');
const used = new Set(), originalRead = fs.readFile, events = [];
fs.readFile = async function (file, ...args) {
    const result = await originalRead.call(this, file, ...args);
    if (typeof file === 'string' && path.resolve(file).startsWith(root + path.sep)) used.add(path.resolve(file));
    return result;
};
let profile, registered;
try {
    profile = await validateProfile(root);
    registered = await registerHdResources(root, event => events.push(event));
} finally { fs.readFile = originalRead; }
assert.equal(profile.manifest.files.length, 3);
assert.equal(profile.selections.get('/local-assets/yr/manifest.json')?.files.length, 7);
for (const file of [...profile.routes.values(), ...registered.routes.values()]) used.add(path.resolve(file));
const files = [];
for (const file of [...used].sort()) {
    assert(file.startsWith(root + path.sep));
    assert.equal(await fs.realpath(file), file, 'Active dependencies must be real local files');
    const before = await fs.stat(file), hash = createHash('sha256');
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    const after = await fs.stat(file);
    assert.equal(before.size, after.size);
    assert.equal(before.mtimeMs, after.mtimeMs);
    files.push({ file: path.relative(root, file), sha256: hash.digest('hex'), bytes: before.size });
}
const selections = {};
for (const [route, selection] of registered.selections)
    if (/^\/local-(terrain|environment)\/(?:\w+\/)?selection\.json$/.test(route))
        selections[route] = { revision: selection.revision, families: Object.keys(selection.families ?? {}).length,
            groups: selection.groups?.length ?? 0 };
assert.equal(Object.keys(selections).length, 10);
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), head);
const receipt = { schema: 'm2-4-final-active-resources-v1', status: 'PASS_ACTUAL_REGISTRATION_GRAPH',
    root, sourceHead: head, files, fileCount: files.length, bytes: files.reduce((n, r) => n + r.bytes, 0),
    selections, routes: registered.routes.size, availability: registered.availability, events,
    expectedOriginalPolicies: ['unit-sqd', 'unit-yuripr'], windows: 'NOT_RUN_ON_THIS_MAC' };
await fs.writeFile(output, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: receipt.status, files: files.length, bytes: receipt.bytes, selections }));
