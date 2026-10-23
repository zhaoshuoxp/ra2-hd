// Observe the canonical registrar's real reads; do not guess active pack members.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const main = '/Users/Aone/RA2remaster/ra2-hd';
const root = path.join(main, '.local');
const output = '.artifacts/m2-4/newurban-final-actors-batch98-20261021/main-active-resource-graph-v1.json';
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: main, encoding: 'utf8' }).trim();
assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: main, encoding: 'utf8' }).trim(), '');
const used = new Set();
const originalRead = fs.readFile;
fs.readFile = async function (file, ...options) {
    const result = await originalRead.call(this, file, ...options);
    if (typeof file === 'string') {
        const absolute = path.resolve(file);
        if (absolute.startsWith(root + path.sep)) used.add(absolute);
    }
    return result;
};
const { registerHdResources } = await import(path.join(main, 'desktop/hd-profile.mjs'));
const events = [];
let registered;
try { registered = await registerHdResources(root, event => events.push(event)); }
finally { fs.readFile = originalRead; }
for (const file of registered.routes.values()) {
    assert.equal(typeof file, 'string');
    assert(path.resolve(file).startsWith(root + path.sep), `Resource escaped canonical root: ${file}`);
    used.add(path.resolve(file));
}
const files = [...used].map(file => path.relative(root, file)).filter(file =>
    !/^(terrain-packs|environment-packs)\//.test(file)
    && !['terrain-selection.json', 'environment-selection.json'].includes(file)).sort();
const protectedTheaters = {};
for (const file of ['terrain-selection.json', 'environment-selection.json']) {
    const before = await originalRead(path.join(root, file));
    const current = await originalRead(path.join('.local', file));
    assert(before.equals(current), `Temperate selection differs: ${file}`);
    protectedTheaters[file] = createHash('sha256').update(current).digest('hex');
}
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: main, encoding: 'utf8' }).trim(), commit);
const result = { schema: 'm2-4-main-active-resource-graph-v1', status: 'READ_ONLY_CANONICAL_REGISTRATION_GRAPH',
    mainCommit: commit, root, files, protectedTemperateSelections: protectedTheaters,
    routes: registered.routes.size, selections: [...registered.selections.keys()], availability: registered.availability,
    events, mainModified: false,
    policy: 'Adopt current core, UI and the actual regenerated prepared inputs. Preserve task theater selections and all historical bytes through explicit recovery pins. No original archive or map transfer.' };
await fs.writeFile(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: result.status, mainCommit: commit, files: files.length,
    routes: result.routes, unavailableEvents: events.filter(e => /unavailable|rejected|failed/i.test(e.type)).length }));
