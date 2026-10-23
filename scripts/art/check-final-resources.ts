// Verify final selected artwork through the normal resolver without history caches.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';

const [edition, output] = process.argv.slice(2);
assert(['ra2', 'yr'].includes(edition) && output);
(globalThis as any).location = { search: `?edition=${edition}` };
const { resolveHdSprite, disposeHdSprite } = await import('../../src/engine/renderable/builder/resolveHdSprite');
const inventory = JSON.parse(await fs.readFile('desktop/buildup-art-final.json', 'utf8'));
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const records = inventory.records.filter((record: any) =>
    (record.editions.includes('ra2') ? 'ra2' : 'yr') === edition);
const results = [];
for (const record of records) {
    const bytes = await fs.readFile(path.join('.local', record.familyPath));
    assert.equal(digest(bytes), record.familySha256);
    const family = JSON.parse(bytes.toString());
    for (const density of [2, 4]) {
        let gpuBytes = 0;
        const members = [];
        for (const binding of family.members) {
            const root = path.join('.local/hd-packs', binding.packId, binding.revision);
            const bytes = await fs.readFile(path.join(root, 'manifest.json'));
            assert.equal(digest(bytes), binding.sha256);
            const manifest = JSON.parse(bytes.toString());
            const source = binding.member === record.member.member ? record.nativeSource
                : { ...manifest.source, canvas: manifest.logical.canvas, frames: manifest.logical.frames };
            const read = async (name: string, hash: string, length: number) => {
                const bytes = await fs.readFile(path.join(root, name));
                assert.equal(bytes.length, length);
                assert.equal(digest(bytes), hash);
                const png = PNG.sync.read(bytes);
                return { width: png.width, height: png.height, rgba: new Uint8Array(png.data) };
            };
            const result = await resolveHdSprite(manifest, binding.sha256, source, density, 2048,
                read, () => {}, false, true);
            assert(result.override, JSON.stringify({ key: record.key, member: binding.member,
                density, attempts: result.attempts }));
            assert.equal(result.density, density);
            gpuBytes += result.gpuBytes;
            members.push({ member: binding.member, density: result.density, gpuBytes: result.gpuBytes });
            disposeHdSprite(result.override);
            Bun.gc(true);
        }
        const limitMiB = family.family === 'NAYARD' ? 128 : 64;
        assert(gpuBytes <= limitMiB * 1024 * 1024, `${record.key}/${density} family budget exceeded`);
        results.push({ key: record.key, density, gpuBytes, limitMiB, members });
    }
    console.log(record.key, '2X/4X normal resolver and family budget PASS');
}
await fs.writeFile(output, JSON.stringify({ status: 'PASS_FINAL_RESOURCE_RESOLUTION_AND_FAMILY_BUDGETS',
    edition, records: records.length, densityChecks: results.length, results }, null, 2) + '\n', { flag: 'wx' });
