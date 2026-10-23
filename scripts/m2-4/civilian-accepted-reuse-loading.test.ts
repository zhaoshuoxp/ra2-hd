import { expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { resolveEnvironmentFamily } from '../../src/engine/renderable/builder/EnvironmentHd';
import { environmentHdContractForTheater, isEnvironmentHdSource }
    from '../../src/engine/renderable/builder/environmentHdContract';
import { disposeHdSprite } from '../../src/engine/renderable/builder/resolveHdSprite';
import type { PowerPlantHdEntry } from '../../src/engine/renderable/builder/resolvePowerPlantHd';

const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const pixels = new Map<string, { width: number; height: number; rgba: Uint8Array }>();
const cases = [
    ['URBAN', '.artifacts/m2-4/urban-native-v2/source.json', 'CIVSF'],
    ['URBAN', '.artifacts/m2-4/urban-native-v2/source.json', 'CIVSTM'],
    ['NEWURBAN', '.artifacts/m2-4/newurban-native-v1/source.json', 'CIVSTM'],
] as const;

for (const [theater, guide, identity] of cases) {
    const contract = environmentHdContractForTheater(theater)!;
    const id = contract.identities.yr[identity];
    const root = `.local/environment-packs/${contract.selectedPack.revision}`;
    const pack = read(`${root}/manifest.json`);
    const entries: PowerPlantHdEntry[] = pack.families[id].members.map((member: any) => {
        const metadata = `${root}/${member.path}`, manifest = read(metadata);
        const native = read(guide).sources.find((source: any) => source.member === member.member);
        const descriptor = contract.sources[member.member];
        return { image: { filename: member.member }, manifest, manifestHash: member.sha256,
            source: { member: member.member, theater, sha256: native.sha256, canvas: native.canvas,
                frames: native.frames.slice(0, descriptor.bodyFrames).map((frame: any) => ({
                    nativeFrame: frame.slot, trimOrigin: frame.origin, trimSize: frame.size,
                    legacyRenderSize: frame.size.map((size: number) => size + size % 2), empty: frame.empty,
                })) },
            read: async (filename: string) => {
                const page = manifest.variants.flatMap((variant: any) => variant.pages.map((page: any) =>
                    ({ ...page, density: variant.density }))).find((page: any) =>
                    [page.base, page.data].includes(filename));
                const file = `${dirname(metadata)}/${page.density}/${page.id}/${page.base === filename ? 'base' : 'data'}.png`;
                if (!pixels.has(file)) {
                    const decoded = execFileSync('python3', ['-c',
                        'import sys,struct;from PIL import Image;im=Image.open(sys.argv[1]).convert("RGBA");sys.stdout.buffer.write(struct.pack("<II",*im.size)+im.tobytes())',
                        file], { maxBuffer: 64 * 1024 * 1024 });
                    pixels.set(file, { width: decoded.readUInt32LE(0), height: decoded.readUInt32LE(4),
                        rgba: new Uint8Array(decoded.subarray(8)) });
                }
                return pixels.get(file)!;
            } } as PowerPlantHdEntry;
    });
    for (const density of [2, 4] as const) test(`${theater} ${identity} ${density}X loads all native states and refuses incomplete families`, async () => {
        expect(entries.every(entry => isEnvironmentHdSource(entry.source))).toBe(true);
        for (const fault of ['none', 'missing-member', 'missing-page', 'corrupt-page', 'budget']) {
            const inputs = fault === 'missing-member' ? [] : entries.map(entry => ({ ...entry,
                read: fault === 'missing-page' ? async () => { throw Error('Missing page'); }
                    : fault === 'corrupt-page' ? async (file: string) => {
                        const page = await entry.read(file), rgba = page.rgba.slice();
                        rgba[100] ^= 1;
                        return { ...page, rgba };
                    } : entry.read }));
            const loaded = await resolveEnvironmentFamily(id, inputs, density,
                fault === 'budget' ? 1 : 128 * 1024 * 1024, 8192, () => {});
            expect(loaded.overrides.size).toBe(fault === 'none' ? entries.length : 0);
            if (fault === 'none') {
                expect(loaded.attempts).toEqual([]);
                expect(loaded.worldChargeBytes).toBeGreaterThan(0);
                for (const entry of entries) {
                    const sprite = loaded.overrides.get(entry.image)!;
                    expect(sprite.frames.length).toBe(entry.source.frames.length);
                    let disposed = 0;
                    sprite.pages[0].base.addEventListener('dispose', () => disposed++);
                    disposeHdSprite(sprite);
                    expect(disposed).toBe(1);
                }
            } else expect(loaded.worldChargeBytes).toBe(0);
        }
    });
}

test('NewUrban retains the earlier accepted cow instead of replacing its art with another donor', () => {
    const contract = environmentHdContractForTheater('NEWURBAN')!;
    expect(contract.identities.yr.COW).toBe('newurban-cow');
    expect(Object.keys(contract.families)).not.toContain('newurban-snow-cow');
});
