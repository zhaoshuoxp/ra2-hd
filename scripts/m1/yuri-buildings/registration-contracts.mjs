import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import catalog from '../../../desktop/yuri-building-coverage.json' with { type: 'json' };
import { registerHdResources } from '../../../desktop/hd-profile.mjs';

const output = path.resolve(process.argv[2]);
await fs.mkdir(output); // Never replace another run or an accepted resource.
const fixtures = [];
for (const broken of [null, 'turret', 'tile-map']) {
    const root = path.join(output, broken ? 'missing-required-' + broken : 'complete');
    const linked = new Set();
    let omitted;
    async function link(relative) {
        if (linked.has(relative)) return;
        linked.add(relative);
        if ((broken === 'turret' && relative.includes('yuri-coverage-yaggun-temperate/') && relative.endsWith('/turrets/4/90.png'))
            || (broken === 'tile-map' && relative.includes('yuri-coverage-yagrnd-temperate-yggrnd-b/') && relative.endsWith('/4x-p0-map.png'))) {
            omitted = relative;
            return;
        }
        const target = path.join(root, relative);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.link(path.resolve('.local', relative), target);
    }
    for (const entry of Object.values(catalog)) {
        await link(entry.familyPath);
        const family = JSON.parse(await fs.readFile(path.join('.local', entry.familyPath)));
        for (const binding of family.members) {
            const prefix = `hd-packs/${binding.packId}/${binding.revision}/`;
            await link(prefix + 'manifest.json');
            const manifest = JSON.parse(await fs.readFile(path.join('.local', prefix, 'manifest.json')));
            for (const variant of manifest.variants) for (const page of variant.pages)
                for (const role of variant.storage ? ['base', 'data', 'map'] : ['base', 'data']) await link(prefix + page[role]);
        }
        for (const binding of Object.values(family.turrets ?? {})) {
            await link(binding.path + 'manifest.json');
            const manifest = JSON.parse(await fs.readFile(path.join('.local', binding.path, 'manifest.json')));
            for (const frame of manifest.headings) for (const role of ['base', 'mask']) await link(binding.path + frame[role]);
        }
    }
    const events = [];
    const result = await registerHdResources(root, event => events.push(event));
    const rows = [];
    for (const entry of Object.values(catalog)) {
        const shouldLoad = !(broken === 'turret' && entry.family === 'YAGGUN' && entry.theater === 'TEMPERATE');
        const selection = result.selections.get(`/local-hd/${entry.selection}-selection.json`);
        assert.equal(!!selection, shouldLoad, entry.selection);
        assert.equal(result.availability[entry.selection], !shouldLoad ? 'Original fallback' : broken === 'tile-map' && entry.family === 'YAGRND' && entry.theater === 'TEMPERATE' ? 'HD available at 2x' : 'HD available');
        if (selection?.turrets) for (const density of [2, 4]) {
            const prefix = `/local-hd/${selection.turrets[density].sha256}/turret/`;
            assert.equal([...result.routes.keys()].filter(key => key.startsWith(prefix)).length, 17);
        }
        rows.push({ identity: entry.family, theater: entry.theater, selected: !!selection });
    }
    if (broken) {
        assert.ok(omitted);
        if (broken === 'tile-map') {
            assert.equal(result.availability['yuri-yagrnd-temperate'], 'HD available at 2x');
            assert.equal([...result.routes.values()].includes(path.join(root, omitted)), false);
            fixtures.push({ root, omitted, rows, routeCount: result.routes.size, scope: 'Explicit whole-family 2x fallback; no 4x claim for incomplete tile map' });
            continue;
        }
        const failedKey = broken === 'turret' ? 'yuri-yaggun-temperate' : 'yuri-yagrnd-temperate';
        const failed = events.find(event => event.type === 'hd-unavailable' && event.family === failedKey);
        assert.ok(failed);
        const binding = JSON.parse(await fs.readFile(path.join('.local', catalog[failedKey].familyPath)));
        for (const member of binding.members)
            assert.equal([...result.routes.keys()].some(key => key.startsWith(`/local-hd/${member.sha256}/`)), false);
        // Component hashes are legitimately shared with the intact snow family.
        // The failed family publishes no SHP routes; every shared route must point
        // to a real, validated peer file rather than the omitted fixture file.
        for (const file of result.routes.values()) await fs.access(file);
        assert.equal([...result.routes.values()].includes(path.join(root, omitted)), false);
    }
    fixtures.push({ root, omitted, rows, routeCount: result.routes.size,
        scope: 'Task-owned resource fixture; absent accepted packs are intentional and not recertified' });
}
const report = { status: 'PASS_TASK_C_REGISTRATION_AND_REQUIRED_COMPONENT_ATOMICITY', fixtures };
await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(report.status);
