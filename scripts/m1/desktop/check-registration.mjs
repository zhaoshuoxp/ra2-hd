import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { registerHdResources } from '../../../desktop/hd-profile.mjs';
import { createHandler } from '../../../desktop/protocol.mjs';
const output = path.resolve(`.artifacts/m1-5/registration-${Date.now()}`);
await fs.mkdir(output, { recursive: true });
const root = path.join(output, 'profile with spaces');
const names = ['conscript-authored', 'power-plant-authored', 'power-plant-authored-body', 'power-plant-authored-active', 'power-plant-authored-buildup', 'rhino-authored'];
for (const name of names) await fs.cp(path.resolve('.local/hd-packs', name, '1'), path.join(root, 'hd-packs', name, '1'), { recursive: true });
const results = [];
async function check(label) {
    const logs = [], hd = await registerHdResources(root, row => logs.push(row));
    const handler = createHandler({ appRoot: output, appFiles: new Set(), getProfile: () => ({ root, ...hd }), getError: () => '' });
    for (const [route, file] of hd.routes) {
        const response = await handler(new Request(`ra2://game${route}`));
        assert.equal(response.status, 200);
        assert.deepEqual(Buffer.from(await response.arrayBuffer()), await fs.readFile(file));
        if (route.endsWith('.png')) assert.equal(response.headers.get('Content-Type'), 'image/png');
    }
    results.push({ label, availability: hd.availability, routeCount: hd.routes.size, logs });
    return hd;
}
let hd = await check('complete');
assert(Object.values(hd.availability).every(v => v === 'HD available'));
const activeDir = path.join(root, 'hd-packs/power-plant-authored-active/1');
const manifest = JSON.parse(await fs.readFile(path.join(activeDir, 'manifest.json')));
await fs.writeFile(path.join(activeDir, manifest.variants.find(v => v.density === 4).pages[0].base), 'corrupt test copy');
hd = await check('corrupt-building-4x');
assert.equal(hd.availability.powerPlant, 'HD available at 2x');
assert.equal(hd.availability.conscript, 'HD available');
await fs.unlink(path.join(activeDir, manifest.variants.find(v => v.density === 2).pages[0].base));
hd = await check('missing-building-2x');
assert.equal(hd.availability.powerPlant, 'Original fallback');
assert.equal(hd.availability.rhino, 'HD available');
const mask = path.join(root, 'hd-packs/rhino-authored/1/turret-315.mask');
await fs.unlink(mask);
await fs.symlink(path.resolve('.local/hd-packs/rhino-authored/1/turret-315.mask'), mask);
hd = await check('rhino-symlink-escape');
assert.equal(hd.availability.rhino, 'Original fallback');
assert.equal([...hd.routes].filter(([route]) => route.startsWith('/local-rhino/')).length, 0);
assert.equal(hd.availability.conscript, 'HD available');
await fs.writeFile(path.join(root, 'hd-packs/conscript-authored/1/manifest.json'), '{}');
hd = await check('unrecognized-conscript');
assert.equal(hd.availability.conscript, 'Original fallback');
await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ status: 'PASS', results }, null, 2) + '\n');
console.log(output);
