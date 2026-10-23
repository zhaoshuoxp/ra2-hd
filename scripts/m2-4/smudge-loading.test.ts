import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { PNG } from 'pngjs';
import { resolveEnvironmentFamily } from '../../src/engine/renderable/builder/EnvironmentHd';
import { disposeHdSprite } from '../../src/engine/renderable/builder/resolveHdSprite';
import type { PowerPlantHdEntry } from '../../src/engine/renderable/builder/resolvePowerPlantHd';

const theater = process.env.M24_SMUDGE_THEATER ?? 'SNOW';
expect(['SNOW', 'URBAN', 'NEWURBAN', 'DESERT']).toContain(theater);
const pointer = JSON.parse(readFileSync(`.local/environment-${theater.toLowerCase()}-selection.json`, 'utf8'));
const root = path.join('.local/environment-packs', pointer.revision);
const pack = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const native = JSON.parse(readFileSync(process.env.M24_SMUDGE_NATIVE
    ?? '.artifacts/m2-4/snow-native-smudges-batch16-v1/source.json', 'utf8'));

function entryFor(family: string): PowerPlantHdEntry {
    const member = pack.families[family].members[0];
    const file = path.join(root, member.path);
    const manifest = JSON.parse(readFileSync(file, 'utf8'));
    const source = native.sources.find((row: any) => row.member === member.member);
    return { image: { filename: member.member }, manifest, manifestHash: member.sha256,
        source: { member: source.member, sha256: source.sha256, theater, canvas: source.canvas,
            frames: source.frames.map((frame: any) => ({ nativeFrame: frame.slot, trimOrigin: frame.origin,
                trimSize: frame.size, legacyRenderSize: frame.size.map((n: number) => n + n % 2), empty: frame.empty })) },
        read: async (name, hash, size) => {
            const match = /^(2|4)-(p\d+)-(base|data)\.png$/.exec(name)!;
            const bytes = readFileSync(path.join(path.dirname(file), match[1], match[2], match[3] + '.png'));
            expect(bytes.length).toBe(size);
            expect(createHash('sha256').update(bytes).digest('hex')).toBe(hash);
            const png = PNG.sync.read(bytes);
            return { width: png.width, height: png.height, rgba: new Uint8Array(png.data) };
        } };
}

const families = theater === 'SNOW' ? ['snow-burnt01', 'snow-crater01']
    : native.sources.map((row: any) => theater.toLowerCase() + '-' + row.member.split('.')[0]);
for (const family of families) for (const density of [2, 4] as const) {
    test(`${family} ${density}X keeps the native empty slot and rejects incomplete families`, async () => {
        const entry = entryFor(family);
        expect(entry.source.frames[1].empty).toBe(true);
        expect(entry.source.frames[1].trimSize).toEqual([0, 0]);
        let uploads = 0, disposals = 0;
        const loaded = await resolveEnvironmentFamily(family, [entry], density, 32 * 1024 * 1024, 2048,
            textures => { uploads += textures.length;
                textures.forEach(texture => texture.addEventListener('dispose', () => disposals++)); });
        expect(loaded.attempts).toEqual([]);
        expect(loaded.overrides.size).toBe(1);
        const frames = loaded.overrides.get(entry.image)!.frames;
        expect(frames.length).toBe(2);
        expect(frames[1].sampleRect.width).toBe(0);
        expect(frames[1].sampleRect.height).toBe(0);
        loaded.overrides.forEach(disposeHdSprite);
        expect(disposals).toBe(uploads);
        for (const [inputs, budget] of [
            [[], 32 * 1024 * 1024],
            [[{ ...entry, manifest: { ...entry.manifest, logical: {} } }], 32 * 1024 * 1024],
            [[{ ...entry, read: async () => { throw Error('page hash mismatch or missing file'); } }], 32 * 1024 * 1024],
            [[entry], 1],
        ] as [PowerPlantHdEntry[], number][]) {
            const rejected = await resolveEnvironmentFamily(family, inputs, density, budget, 2048,
                () => { throw Error('An invalid family must never publish textures'); });
            expect(rejected.overrides.size).toBe(0);
            expect(rejected.worldChargeBytes).toBe(0);
        }
    });
}
