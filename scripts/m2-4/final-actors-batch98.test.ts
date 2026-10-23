import { afterAll, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { resolveEnvironmentFamily } from '../../src/engine/renderable/builder/EnvironmentHd';
import { disposeHdSprite } from '../../src/engine/renderable/builder/resolveHdSprite';
import { environmentHdContractForTheater } from '../../src/engine/renderable/builder/environmentHdContract';
import type { PowerPlantHdEntry } from '../../src/engine/renderable/builder/resolvePowerPlantHd';

const root = '.artifacts/m2-4/newurban-final-actors-batch98-20261021';
const evidenceVersion = process.env.RA2_BATCH98_TEST_VERSION ?? 'v1';
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const contract = environmentHdContractForTheater('NEWURBAN')!;
const exported = read(`${root}/dinosaur-export-v4.json`);
const folder = `.local/environment-packs/${exported.candidate.revision}`;
const pack = read(`${folder}/manifest.json`);
const sources = read(`${root}/source-v1.json`).sources;
const decoded = new Map<string, any>();
const allocations: any[] = [];
let verifiedFaults = 0;

function entries(identity: string): PowerPlantHdEntry[] {
    return pack.families[identity].members.map((member: any) => {
        const file = path.join(folder, member.path), manifest = read(file);
        const native = sources.find((source: any) => source.member === member.member);
        const count = contract.sources[member.member].bodyFrames;
        return { image: { filename: member.member }, manifest, manifestHash: member.sha256,
            source: { member: member.member, sha256: native.sha256, theater: 'NEWURBAN', canvas: native.canvas,
                frames: native.frames.slice(0, count).map((frame: any) => ({ nativeFrame: frame.slot,
                    trimOrigin: frame.origin, trimSize: frame.size,
                    legacyRenderSize: frame.size.map((n: number) => n + n % 2), empty: frame.empty })) },
            read: async (filename: string) => {
                const variants = manifest.variants.flatMap((variant: any) => variant.pages.map((page: any) => ({ ...page, density: variant.density })));
                const page = variants.find((page: any) => page.base === filename || page.data === filename);
                const png = path.join(path.dirname(file), String(page.density), page.id, page.base === filename ? 'base.png' : 'data.png');
                if (!decoded.has(png)) {
                    const bytes = execFileSync('python3', ['-c',
                        'import sys,struct;from PIL import Image;im=Image.open(sys.argv[1]).convert("RGBA");sys.stdout.buffer.write(struct.pack("<II",*im.size)+im.tobytes())', png],
                    { maxBuffer: 32 * 1024 * 1024 });
                    decoded.set(png, { width: bytes.readUInt32LE(0), height: bytes.readUInt32LE(4), rgba: new Uint8Array(bytes.subarray(8)) });
                }
                return decoded.get(png);
            } } as PowerPlantHdEntry;
    });
}

for (const identity of ['newurban-civ1', 'newurban-gafwll', 'newurban-dnoa']) {
    for (const density of [2, 4] as const) test(`${identity} ${density}X resolves all native slots and owns its full allocation`, async () => {
        const inputs = entries(identity);
        const family = await resolveEnvironmentFamily(identity, inputs, density, 256 * 1024 * 1024, 8192, () => {});
        expect(family.attempts).toEqual([]);
        expect(family.density).toBe(density);
        expect(family.overrides.size).toBe(1);
        const override = family.overrides.get(inputs[0].image)!;
        expect(override.frames.length).toBe(identity === 'newurban-civ1' ? 238 : identity === 'newurban-dnoa' ? 424 : 48);
        for (const page of identity === 'newurban-dnoa' ? [] : override.pages) {
            const owner = page.data.image as { width: number; height: number; data: Uint8Array };
            expect([owner.width, owner.height]).toEqual([1, 1]);
            expect([...owner.data]).toEqual([0, 0]);
        }
        const textures = new Set(override.pages.flatMap(page => [page.base, page.data, page.tiles?.map, page.tiles?.dataMap].filter(Boolean)));
        const bytes = [...textures].reduce((sum, texture) => sum + (texture!.image as { data: Uint8Array }).data.byteLength, 0);
        expect(family.retainedCpuBytes).toBe(bytes);
        expect(family.worldChargeBytes).toBe(family.gpuBytes + bytes);
        let disposed = 0;
        for (const texture of textures) texture!.addEventListener('dispose', () => disposed++);
        family.overrides.forEach(disposeHdSprite);
        expect(disposed).toBe(textures.size);
        allocations.push({ identity, density, gpuBytes: family.gpuBytes, retainedCpuBytes: bytes,
            worldChargeBytes: family.worldChargeBytes, slots: override.frames.length });
    });
}

test('a missing pose, foreign source, corrupt data, cancellation or insufficient budget publishes no partial family', async () => {
    for (const fault of ['pose', 'source', 'data', 'cancel', 'budget']) {
        const inputs = entries('newurban-civ1');
        if (fault === 'pose') inputs[0].manifest.variants.find((v: any) => v.density === 4).frames.pop();
        if (fault === 'source') inputs[0].source.sha256 = '0'.repeat(64);
        if (fault === 'data') {
            const original = inputs[0].read;
            inputs[0].read = async (filename: string, hash: string, bytes: number) => {
                const image = await original(filename, hash, bytes);
                if (!filename.includes('data')) return image;
                const rgba = image.rgba.slice();
                rgba[2] = 1;
                return { ...image, rgba };
            };
        }
        const family = await resolveEnvironmentFamily('newurban-civ1', inputs, 4, fault === 'budget' ? 1 : 256 * 1024 * 1024,
            8192, () => {}, () => fault === 'cancel');
        expect(family.overrides.size).toBe(0);
        expect(family.gpuBytes).toBe(0);
        expect(family.retainedCpuBytes).toBe(0);
        expect(family.attempts.length).toBeGreaterThan(0);
        verifiedFaults++;
    }
});

afterAll(() => {
    writeFileSync(`${root}/final-actors-loader-allocations-${evidenceVersion}.json`, JSON.stringify({
        status: allocations.length === 6 && verifiedFaults === 5 ? 'PASS_SELECTED_COMPLETE_FAMILY_ALLOCATIONS' : 'FAIL_INCOMPLETE_TEST_RUN',
        rows: allocations, verifiedFaults, candidate: exported.candidate,
        qualification: 'CPU resolver and complete-family failure evidence only; native Mac execution and visual review remain separate.',
        windows: 'NOT_RUN', m24Complete: false,
    }, null, 2) + '\n', { flag: 'wx' });
});
