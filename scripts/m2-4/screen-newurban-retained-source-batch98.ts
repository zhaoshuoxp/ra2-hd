// Measure lossless retained CPU compression on the exact published Rush Hour textures.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { deflateSync, inflateSync } from 'fflate';
import { resolveEnvironmentFamily } from '../../src/engine/renderable/builder/EnvironmentHd';
import { disposeHdSprite } from '../../src/engine/renderable/builder/resolveHdSprite';
import { environmentHdContractForTheater } from '../../src/engine/renderable/builder/environmentHdContract';
import type { PowerPlantHdEntry } from '../../src/engine/renderable/builder/resolvePowerPlantHd';

const root = '.artifacts/m2-4/newurban-final-actors-batch98-20261021';
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const baseline = read('.artifacts/m2-4/newurban-remaining-actors-batch97-20261021/native-4x-v1/report.json');
const native = baseline.maps.find((row: any) => row.map === 'rushhr.map').allocationAfter;
const contract = environmentHdContractForTheater('NEWURBAN')!;
const folder = `.local/environment-packs/${contract.selectedPack.revision}`;
const pack = read(`${folder}/manifest.json`);
const rows: any[] = [];
for (const [identity, binding] of Object.entries<any>(native.environment.families)) {
    if (binding.density !== 4) continue;
    const decoded = new Map<string, any>();
    const entries: PowerPlantHdEntry[] = pack.families[identity].members.map((member: any) => {
        const file = path.join(folder, member.path), manifest = read(file);
        return { image: {}, manifest, manifestHash: member.sha256,
            source: { ...manifest.source, canvas: manifest.logical.canvas, frames: manifest.logical.frames },
            read: async (filename: string) => {
                const variant = manifest.variants.find((v: any) => v.density === 4);
                const page = variant.pages.find((p: any) => p.base === filename || p.data === filename);
                const png = path.join(path.dirname(file), '4', page.id, page.base === filename ? 'base.png' : 'data.png');
                if (!decoded.has(png)) {
                    const bytes = execFileSync('python3', ['-c',
                        'import sys,struct;from PIL import Image;im=Image.open(sys.argv[1]).convert("RGBA");sys.stdout.buffer.write(struct.pack("<II",*im.size)+im.tobytes())', png],
                    { maxBuffer: 32 * 1024 * 1024 });
                    decoded.set(png, { width: bytes.readUInt32LE(0), height: bytes.readUInt32LE(4), rgba: new Uint8Array(bytes.subarray(8)) });
                }
                return decoded.get(png);
            } } as PowerPlantHdEntry;
    });
    const family = await resolveEnvironmentFamily(identity, entries, 4, 1280 * 1024 * 1024, 8192, () => {});
    if (family.overrides.size !== entries.length) throw Error(JSON.stringify({ identity, attempts: family.attempts }));
    const textures = [...new Set([...family.overrides.values()].flatMap(override => override.pages.flatMap(page =>
        [page.base, page.data, page.tiles?.map, page.tiles?.dataMap].filter(Boolean))))];
    const textureRows = textures.map(texture => {
        const pixels = (texture!.image as { data: Uint8Array }).data;
        const started = performance.now();
        const compressed = deflateSync(pixels, { level: 1 });
        const encodedMs = performance.now() - started;
        const restored = inflateSync(compressed);
        if (sha(restored) !== sha(pixels)) throw Error('source-roundtrip-mismatch');
        return { originalBytes: pixels.byteLength, encodedBytes: compressed.byteLength,
            retainedBytes: Math.min(compressed.byteLength, pixels.byteLength), encodedMs,
            sha256: sha(pixels), format: texture!.format };
    });
    rows.push({ identity, gpuBytes: family.gpuBytes, rawRetainedCpuBytes: family.retainedCpuBytes,
        compressedRetainedCpuBytes: textureRows.reduce((sum, row) => sum + row.retainedBytes, 0), textures: textureRows });
    family.overrides.forEach(disposeHdSprite);
    decoded.clear();
}
const sum = (key: string) => rows.reduce((total, row) => total + row[key], 0);
const output = { status: 'READ_ONLY_EXACT_PUBLISHED_TEXTURE_COMPRESSION_SCREEN', rows,
    selectedPack: contract.selectedPack, nativeEnvironmentBytes: native.environment.retainedCpuBytes,
    rawCpuBytes: sum('rawRetainedCpuBytes'), compressedCpuBytes: sum('compressedRetainedCpuBytes'),
    possibleCpuSaving: sum('rawRetainedCpuBytes') - sum('compressedRetainedCpuBytes'),
    qualification: 'Sizing and round-trip evidence only. No runtime, resource selection, budget or image changes.', m24Complete: false };
writeFileSync(`${root}/retained-source-compression-screen-v1.json`, JSON.stringify(output, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: output.status, families: rows.length, raw: output.rawCpuBytes,
    compressed: output.compressedCpuBytes, saving: output.possibleCpuSaving }));
