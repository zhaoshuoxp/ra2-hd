import { afterAll, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { resolveEnvironmentFamily } from '../../src/engine/renderable/builder/EnvironmentHd';
import { disposeHdSprite } from '../../src/engine/renderable/builder/resolveHdSprite';
import { environmentHdContractForTheater } from '../../src/engine/renderable/builder/environmentHdContract';
import type { PowerPlantHdEntry } from '../../src/engine/renderable/builder/resolvePowerPlantHd';

const root = '.artifacts/m2-4/newurban-remaining-actors-batch97-20261021';
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const version = process.env.RA2_BATCH97_VERSION ?? 'v3';
const exported = read(`${root}/export-and-preservation-${version}.json`);
const sources = read(`${root}/source-v1.json`).sources;
const contract = environmentHdContractForTheater('NEWURBAN')!;
const packRoot = `.local/environment-packs/${contract.selectedPack.revision}`;
const pack = read(`${packRoot}/manifest.json`);
const results: any[] = [];
const decoded = new Map<string, any>();
expect(contract.selectedPack).toEqual(exported.candidate);

function entries(identity: string): PowerPlantHdEntry[] {
    return pack.families[identity].members.map((member: any) => {
        const file = path.join(packRoot, member.path), manifest = read(file);
        const source = sources.find((s: any) => s.member === member.member);
        const count = contract.sources[member.member].bodyFrames;
        return { image: { filename: member.member }, manifest, manifestHash: member.sha256,
            source: { member: member.member, sha256: source.sha256, theater: 'NEWURBAN', canvas: source.canvas,
                frames: source.frames.slice(0, count).map((frame: any) => ({ nativeFrame: frame.slot,
                    trimOrigin: frame.origin, trimSize: frame.size,
                    legacyRenderSize: frame.size.map((n: number) => n + n % 2), empty: frame.empty })) },
            read: async (filename: string) => {
                const page = manifest.variants.flatMap((v: any) => v.pages.map((p: any) => ({ ...p, density: v.density })))
                    .find((p: any) => p.base === filename || p.data === filename);
                const png = path.join(path.dirname(file), String(page.density), page.id,
                    page.base === filename ? 'base.png' : 'data.png');
                if (!decoded.has(png)) {
                    const data = execFileSync('python3', ['-c',
                        'import sys,struct;from PIL import Image;im=Image.open(sys.argv[1]).convert("RGBA");sys.stdout.buffer.write(struct.pack("<II",*im.size)+im.tobytes())', png],
                    { maxBuffer: 64 * 1024 * 1024 });
                    decoded.set(png, { width: data.readUInt32LE(0), height: data.readUInt32LE(4),
                        rgba: new Uint8Array(data.subarray(8)) });
                }
                return decoded.get(png);
            } } as PowerPlantHdEntry;
    });
}

for (const identity of [...new Set<string>(exported.records.map((r: any) => r.family))]) {
    for (const density of [2, 4] as const) test(`${identity} ${density}X validates complete native slots and releases every allocation`, async () => {
        const inputs = entries(identity);
        const loaded = await resolveEnvironmentFamily(identity, inputs, density, 256 * 1024 * 1024, 8192, () => {});
        expect(loaded.attempts).toEqual([]);
        expect(loaded.overrides.size).toBe(inputs.length);
        expect(loaded.density).toBe(density);
        expect(loaded.retainedCpuBytes).toBeGreaterThan(0);
        expect(loaded.worldChargeBytes).toBe(loaded.gpuBytes + loaded.retainedCpuBytes);
        for (const entry of inputs) {
            const sprite = loaded.overrides.get(entry.image)!;
            expect(sprite.frames.length).toBe(entry.source.frames.length);
            const textures = new Set(sprite.pages.flatMap(p => [p.base, p.data, p.tiles?.map, p.tiles?.dataMap]).filter(Boolean));
            let releases = 0;
            textures.forEach(texture => texture!.addEventListener('dispose', () => releases++));
            disposeHdSprite(sprite);
            expect(releases).toBe(textures.size);
        }
        results.push({ identity, density, gpuBytes: loaded.gpuBytes, retainedCpuBytes: loaded.retainedCpuBytes,
            worldChargeBytes: loaded.worldChargeBytes, members: inputs.map(e => e.source.member) });
    });
}

test('Secret Lab cannot publish a partial or corrupt linked loop and respects cancellation and budget', async () => {
    const identity = 'newurban-caslab';
    const normal = entries(identity);
    expect(normal.length).toBe(2);
    for (const fault of ['missing-linked', 'incomplete-loop', 'invalid-ownership', 'budget', 'cancelled']) {
        const inputs = normal.map(entry => ({ ...entry, manifest: structuredClone(entry.manifest) }));
        if (fault === 'missing-linked') inputs.pop();
        if (fault === 'incomplete-loop') inputs[1].manifest.variants.find((v: any) => v.density === 4).frames.pop();
        if (fault === 'invalid-ownership') inputs[1].read = async filename => {
            const value = await normal[1].read(filename), rgba = value.rgba.slice();
            if (filename.includes('data')) rgba[1] = 255;
            return { ...value, rgba };
        };
        const loaded = await resolveEnvironmentFamily(identity, inputs, 4,
            fault === 'budget' ? 1 : 256 * 1024 * 1024, 8192, () => {}, () => fault === 'cancelled');
        expect(loaded.overrides.size).toBe(0);
        expect(loaded.worldChargeBytes).toBe(0);
        expect(loaded.retainedCpuBytes).toBe(0);
        expect(loaded.attempts.length).toBe(1);
    }
});

afterAll(() => {
    writeFileSync(`${root}/loader-allocations-${version}.json`, JSON.stringify({
        status: results.length === 26 ? 'PASS_26_SOURCE_FAMILY_DENSITY_ALLOCATIONS' : 'INCOMPLETE',
        qualification: 'CPU resolver evidence only; native packaged Mac accounting and original simulation remain separate.',
        rows: results, candidate: exported.candidate, windows: 'NOT_RUN', m24Complete: false,
    }, null, 2) + '\n', { flag: 'wx' });
});
