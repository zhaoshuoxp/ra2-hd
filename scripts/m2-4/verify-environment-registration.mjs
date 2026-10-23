// Verify the actual desktop registration graph before native package checks.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const [root, output] = process.argv.slice(2);
assert(root && output, 'Usage: verify-environment-registration.mjs <resources> <new-report>');
const desktop = process.argv.find(value => value.startsWith('--desktop='))?.slice(10);
const moduleUrl = desktop ? pathToFileURL(path.resolve(desktop, 'environment-profile.mjs'))
    : new URL('../../desktop/environment-profile.mjs', import.meta.url);
const { registerEnvironmentResources } = await import(moduleUrl.href);
const records = [];
const result = await registerEnvironmentResources(path.resolve(root), row => records.push(row));
const rows = [];
for (const [route, selection] of result.selections) {
    const theater = selection.theater.toLowerCase();
    const file = theater === 'temperate' ? 'environment-selection.json' : `environment-${theater}-selection.json`;
    const pointer = JSON.parse(await fs.readFile(path.join(root, file), 'utf8'));
    assert.equal(pointer.revision, selection.revision);
    assert.equal(route, theater === 'temperate' ? '/local-environment/selection.json'
        : `/local-environment/${theater}/selection.json`);
    let members = 0, pages = 0;
    for (const family of Object.values(selection.families)) for (const member of family.members) {
        members++;
        assert(result.routes.has(member.manifest));
        const manifest = JSON.parse(await fs.readFile(result.routes.get(member.manifest), 'utf8'));
        for (const variant of manifest.variants) for (const page of variant.pages) for (const role of ['base', 'data']) {
            const route = member.files[page[role]], file = result.routes.get(route);
            assert(file, `Unregistered page: ${member.member} ${variant.density} ${role}`);
            const bytes = await fs.readFile(file);
            assert.equal(bytes.length, page[`${role}Bytes`]);
            assert.equal(createHash('sha256').update(bytes).digest('hex'), page[`${role}Sha256`]);
            pages++;
        }
    }
    rows.push({ theater: selection.theater, pointer, families: Object.keys(selection.families).length, members, pages });
}
const desktopRoot = desktop ? path.resolve(desktop) : path.resolve('desktop');
const expectedTheaters = [];
for (const theater of ['temperate', 'snow', 'urban', 'newurban', 'desert']) {
    const file = path.join(desktopRoot, theater === 'temperate'
        ? 'environment-hd-contract.json' : `environment-${theater}-hd-contract.json`);
    let bytes;
    try { bytes = await fs.readFile(file); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (JSON.parse(bytes).selectedPack) expectedTheaters.push(theater.toUpperCase());
}
assert.deepEqual(rows.map(row => row.theater).sort(), expectedTheaters.sort(), JSON.stringify(records));
assert(!records.some(row => row.type === 'environment-original'), JSON.stringify(records));
assert(rows.find(row => row.theater === 'SNOW').families >= 50);
await fs.writeFile(output, JSON.stringify({ status: 'PASS_ACTUAL_DESKTOP_REGISTRATION_ALL_SELECTED_FAMILIES_AND_PAYLOADS',
    desktopModule: moduleUrl.href, records, rows }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(rows));
