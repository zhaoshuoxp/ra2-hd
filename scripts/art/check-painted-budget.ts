// Resolve candidate pages through the normal runtime without changing selectors.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const [familyFile, decodedRoot, output] = process.argv.slice(2);
assert(familyFile && decodedRoot && output);
const edition = process.argv.find(value => value.startsWith('--edition='))?.slice(10) ?? 'yr';
assert(edition === 'ra2' || edition === 'yr');
(globalThis as any).location = { search: `?edition=${edition}` };
const { resolveHdSprite, disposeHdSprite } = await import('../../src/engine/renderable/builder/resolveHdSprite');
const family = JSON.parse(await fs.readFile(familyFile, 'utf8'));
const rows: any[] = [];
for (const density of [2, 4]) {
    let gpuBytes = 0;
    for (const binding of family.members) {
        const root = path.join('.local/hd-packs', binding.packId, binding.revision);
        const bytes = await fs.readFile(path.join(root, 'manifest.json'));
        assert.equal(createHash('sha256').update(bytes).digest('hex'), binding.sha256);
        const manifest = JSON.parse(bytes.toString());
        const source = { ...manifest.source, canvas: manifest.logical.canvas, frames: manifest.logical.frames };
        const read = async (file: string, sha: string, length: number) => {
            const png = await fs.readFile(path.join(root, file));
            assert.equal(png.length, length);
            assert.equal(createHash('sha256').update(png).digest('hex'), sha);
            const raw = await fs.readFile(path.join(decodedRoot, sha + '.rgba'));
            const width = raw.readUInt32LE(0), height = raw.readUInt32LE(4);
            assert.equal(raw.length, 8 + width * height * 4);
            return { width, height, rgba: new Uint8Array(raw.buffer, raw.byteOffset + 8, raw.length - 8) };
        };
        const result = await resolveHdSprite(manifest, binding.sha256, source, density, 2048, read, () => {}, false, true);
        assert(result.override, JSON.stringify({ member: binding.member, density, attempts: result.attempts }));
        gpuBytes += result.gpuBytes;
        rows.push({ member: binding.member, density, gpuBytes: result.gpuBytes, pages: result.override.pages.length,
            actualDensity: result.density, identity: result.override.identity, fallback: false });
        disposeHdSprite(result.override);
        Bun.gc(true);
    }
    const limitMiB = family.family === 'NAYARD' ? 128 : 64;
    assert(gpuBytes <= limitMiB * 1024 * 1024, `${family.family}/${density}: ${gpuBytes} exceeds ${limitMiB} MiB`);
    rows.push({ family: family.family, density, gpuBytes, limitMiB });
}
await fs.writeFile(output, JSON.stringify({ status: 'PASS_NORMAL_RESOLVER_AND_UNCHANGED_FAMILY_BUDGET', edition, rows }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(rows.filter(row => row.family)));
