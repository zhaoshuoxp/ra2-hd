import { expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { resourceRoot } from '../test-support/resources';
import { registerHdResources, sovietUnitIdentities } from '../../desktop/hd-profile.mjs';
import { sovietUnitHdFamilies } from '../../src/engine/renderable/builder/sovietUnitHdFamilies';
import { resolveSovietUnitMembers } from '../../src/engine/renderable/builder/loadSovietUnitsHd';
import { disposeHdSprite } from '../../src/engine/renderable/builder/resolveHdSprite';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';
import { ShpFile } from '../../src/data/ShpFile';

const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const tree = editionRetailTree(new Map([
    ...['ra2.mix', 'language.mix', 'multi.mix'].map(name => [name, readFileSync(`${resourceRoot}/assets/ra2/${name}`)] as const),
    ...['expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix']
        .map(name => [name, readFileSync(`${resourceRoot}/assets/yr/${name}`)] as const),
]), 'yr');

for (const identity of ['ARND', 'STLN'] as const) {
    const contract = sovietUnitHdFamilies[identity], member = contract.members[0];
    const familyFile = path.join(resourceRoot, sovietUnitIdentities[identity].familyPath);
    const family = JSON.parse(readFileSync(familyFile, 'utf8'));
    const pack = path.join(resourceRoot, 'hd-packs', family.members[0].packId, family.members[0].revision);
    const metadata = readFileSync(path.join(pack, 'manifest.json')), manifest = JSON.parse(metadata.toString());
    const file = resolveMember(tree, member.member).file, original = new ShpFile(file);
    const source = { member: member.member, sha256: hash(Buffer.from(file.getBytes())), theater: 'TEMPERATE',
        canvas: [original.width, original.height], frames: original.images.slice(0, member.frames).map((frame: any, nativeFrame: number) => ({
            nativeFrame, trimOrigin: [frame.x, frame.y], trimSize: [frame.width, frame.height],
            legacyRenderSize: [frame.width + frame.width % 2, frame.height + frame.height % 2], empty: !frame.imageData.some(Boolean),
        })) };
    const read = async (name: string, expectedHash: string, expectedBytes: number) => {
        const bytes = readFileSync(path.join(pack, name));
        expect(hash(bytes)).toBe(expectedHash); expect(bytes.length).toBe(expectedBytes);
        const png = PNG.sync.read(bytes);
        return { width: png.width, height: png.height, rgba: new Uint8Array(png.data) };
    };
    test(`${identity} complete original body and shadow geometry supports both densities, native owner regions and release`, async () => {
        expect(hash(readFileSync(familyFile))).toBe(contract.familyHash);
        expect(hash(metadata)).toBe(member.manifestHash);
        expect(source.sha256).toBe(member.sourceHash);
        expect(original.numImages).toBe(member.totalFrames);
        expect(manifest.logical.frames).toEqual(source.frames);
        for (const density of [2, 4]) {
            let allocated = 0, disposed = 0;
            const result = await resolveSovietUnitMembers([{ image: original, manifest,
                manifestHash: member.manifestHash, source, read }], density, 512 * 1024 * 1024, 2048, textures => {
                allocated += textures.length;
                textures.forEach(texture => texture.addEventListener('dispose', () => disposed++));
            });
            expect(result.density).toBe(density);
            const hd = result.members.get(member.member)!.override;
            expect(hd.frames.length).toBe(member.frames);
            for (const [slot, frame] of hd.frames.entries()) {
                const page = hd.pages[frame.page], base = page.base.image, data = page.data.image;
                const nativeOwner = original.images[slot].imageData.some((value: number) => value >= 16 && value <= 31);
                let paint = 0, neutral = 0, invalidPaint = 0;
                for (let y = frame.sampleRect.y; y < frame.sampleRect.y + frame.sampleRect.height; y++) {
                    for (let x = frame.sampleRect.x; x < frame.sampleRect.x + frame.sampleRect.width; x++) {
                        const i = (y * data.width + x) * 4;
                        if (data.data[i]) {
                            paint++;
                            if (!base.data[i + 3] || data.data[i + 1] >= 16) invalidPaint++;
                        } else if (base.data[i + 3]) neutral++;
                    }
                }
                expect(paint > 0).toBe(nativeOwner);
                expect(invalidPaint).toBe(0); expect(neutral).toBeGreaterThan(0);
            }
            disposeHdSprite(hd); expect(disposed).toBe(allocated);
        }
        const exhausted = await resolveSovietUnitMembers([{ image: original, manifest,
            manifestHash: member.manifestHash, source, read }], 4, 0, 2048, () => { throw Error('No upload is permitted'); });
        expect(exhausted.members.size).toBe(0); expect(exhausted.gpuBytes).toBe(0);
        expect(exhausted.density).toBe(1);
    }, 60000);

    test(`${identity} missing native-density payloads remove the entire desktop family and its routes`, async () => {
        const temporary = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'yr-hero-family-'));
        try {
            await fs.mkdir(path.join(temporary, 'hd-packs'));
            const names = [family.members[0].packId, family.members[0].packId + '-family'];
            for (const name of names)
                await fs.cp(path.join(resourceRoot, 'hd-packs', name), path.join(temporary, 'hd-packs', name), { recursive: true });
            expect((await registerHdResources(temporary)).selections.has(`/local-hd/unit-${identity.toLowerCase()}-selection.json`)).toBe(true);
            for (const variant of manifest.variants)
                await fs.unlink(path.join(temporary, 'hd-packs', family.members[0].packId, family.members[0].revision, variant.pages[0].base));
            const broken = await registerHdResources(temporary);
            expect(broken.selections.has(`/local-hd/unit-${identity.toLowerCase()}-selection.json`)).toBe(false);
            expect([...broken.routes.keys()].filter(route => route.startsWith(`/local-hd/${member.manifestHash}/`))).toEqual([]);
        } finally { await fs.rm(temporary, { recursive: true, force: true }); }
    });
}
