import { resourceRoot } from '../../test-support/resources';
import { beforeAll, test, expect } from 'bun:test';
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { registerHdResources, sovietUnitIdentities } from '../../../desktop/hd-profile.mjs';
import { sovietUnitHdFamilies } from '../../../src/engine/renderable/builder/sovietUnitHdFamilies';
import { resolveSovietUnitMembers } from '../../../src/engine/renderable/builder/loadSovietUnitsHd';
import { disposeHdSprite } from '../../../src/engine/renderable/builder/resolveHdSprite';
import { editionRetailTree } from '../../../src/offline/editionRetail';
import { resolveMember } from '../../../src/offline/retail';
import { ShpFile } from '../../../src/data/ShpFile';

const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const familyPath = sovietUnitIdentities.LUNR.familyPath;
let family: any, member: any, root: any, bytes: any, manifest: any, tree: any, file: any, original: any, source: any;
beforeAll(() => {
    family = JSON.parse(readFileSync(`${resourceRoot}/` + familyPath, 'utf8'));
    member = family.members[0];
    root = `${resourceRoot}/hd-packs/` + member.packId + '/' + member.revision;
    bytes = readFileSync(root + '/manifest.json');
    manifest = JSON.parse(bytes.toString());
    tree = editionRetailTree(new Map([
        ...['ra2.mix', 'language.mix', 'multi.mix'].map(name => [name, readFileSync(`${resourceRoot}/assets/ra2/` + name)] as const),
        ...['expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix']
            .map(name => [name, readFileSync(`${resourceRoot}/assets/yr/` + name)] as const),
    ]), 'yr');
    file = resolveMember(tree, 'lunr.shp').file;
    original = new ShpFile(file);
    source = { member: 'lunr.shp', sha256: hash(Buffer.from(file.getBytes())), theater: 'TEMPERATE',
        canvas: [original.width, original.height], frames: original.images.slice(0, 435).map((f: any, nativeFrame: number) => ({
            nativeFrame, trimOrigin: [f.x, f.y], trimSize: [f.width, f.height],
            legacyRenderSize: [f.width + f.width % 2, f.height + f.height % 2], empty: !f.imageData.some(Boolean),
        })) };
});
const read = async (name: string, expectedHash: string, expectedBytes: number) => {
    const bytes = readFileSync(root + '/' + name);
    expect(hash(bytes)).toBe(expectedHash); expect(bytes.length).toBe(expectedBytes);
    const png = PNG.sync.read(bytes);
    return { width: png.width, height: png.height, rgba: new Uint8Array(png.data) };
};

test('LUNR preserves all native slots and both densities with owner paint and neutral armor', async () => {
    expect(sovietUnitHdFamilies.LUNR.edition).toBe('yr');
    expect(original.numImages).toBe(870);
    expect(manifest.logical.frames).toEqual(source.frames);
    expect(hash(bytes)).toBe(sovietUnitHdFamilies.LUNR.members[0].manifestHash);
    for (const density of [2, 4]) {
        let allocated = 0, disposed = 0;
        const result = await resolveSovietUnitMembers([{ manifest, manifestHash: hash(bytes), source, read }],
            density, 128 * 1024 * 1024, 2048, textures => {
                allocated += textures.length;
                textures.forEach(t => t.addEventListener('dispose', () => disposed++));
            });
        expect(result.density).toBe(density);
        const hd = result.members.get('lunr.shp')!.override;
        expect(hd.frames.length).toBe(435);
        for (const frame of hd.frames) {
            const page = hd.pages[frame.page], base = page.base.image, data = page.data.image;
            let paint = 0, neutral = 0;
            for (let y = frame.sampleRect.y; y < frame.sampleRect.y + frame.sampleRect.height; y++) {
                for (let x = frame.sampleRect.x; x < frame.sampleRect.x + frame.sampleRect.width; x++) {
                    const i = (y * data.width + x) * 4;
                    if (data.data[i]) {
                        paint++; expect(base.data[i + 3]).toBeGreaterThan(0);
                        expect(data.data[i + 1]).toBeLessThan(16);
                    } else if (base.data[i + 3]) neutral++;
                }
            }
            expect(paint).toBeGreaterThan(0); expect(neutral).toBeGreaterThan(0);
        }
        disposeHdSprite(hd); expect(disposed).toBe(allocated);
    }
}, 60000);

test('LUNR desktop registration rejects an incomplete family without leaking routes', async () => {
    const temp = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'lunar-family-'));
    try {
        for (const name of ['lunar-infantry-authored', 'lunar-infantry-family']) {
            await fs.mkdir(path.join(temp, 'hd-packs'), { recursive: true });
            await fs.cp(`${resourceRoot}/hd-packs/` + name, path.join(temp, 'hd-packs', name), { recursive: true });
        }
        const complete = await registerHdResources(temp);
        expect(complete.selections.has('/local-hd/unit-lunr-selection.json')).toBe(true);
        for (const variant of manifest.variants)
            await fs.unlink(path.join(temp, 'hd-packs', member.packId, member.revision, variant.pages[0].base));
        const broken = await registerHdResources(temp);
        expect(broken.selections.has('/local-hd/unit-lunr-selection.json')).toBe(false);
        expect([...broken.routes.keys()].filter(r => r.startsWith('/local-hd/' + member.sha256 + '/'))).toEqual([]);
        expect(broken.availability['unit-lunr']).toBe('Original fallback');
    } finally { await fs.rm(temp, { recursive: true, force: true }); }
});
