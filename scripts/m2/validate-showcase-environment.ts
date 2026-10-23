import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';
import { PNG } from 'pngjs';
import { resolveEnvironmentFamily } from '../../src/engine/renderable/builder/EnvironmentHd';
import { disposeHdSprite } from '../../src/engine/renderable/builder/resolveHdSprite';
import { environmentHdContractForTheater } from '../../src/engine/renderable/builder/environmentHdContract';

const [revision, output] = process.argv.slice(2);
const root = path.resolve('.local/environment-packs', revision);
const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const theater = process.argv.find(arg => arg.startsWith('--theater='))?.slice(10) ?? 'TEMPERATE';
const contractPath = process.argv.find(arg => arg.startsWith('--contract='))?.slice(11);
const environmentHdContract = contractPath
    ? JSON.parse(readFileSync(contractPath, 'utf8')) : environmentHdContractForTheater(theater);
assert(environmentHdContract?.theater === theater && manifest.theater === theater,
    'Explicit theater contract mismatch');
if (contractPath) {
    const current = environmentHdContractForTheater(theater)!;
    // The shared loader reads these declarations in process memory. Test a pinned
    // additive candidate without changing the desktop file or selection pointer.
    for (const key of ['families', 'sources'] as const) {
        for (const [name, declared] of Object.entries(current[key])) {
            assert.deepEqual(environmentHdContract[key][name], declared,
                `Candidate validation must preserve current ${key}: ${name}`);
        }
        Object.assign(current[key], environmentHdContract[key]);
    }
}
const preparedRoot = process.argv.find(arg => arg.startsWith('--prepared='))?.slice(11)
    ?? '.artifacts/m2-2/prepared-native-v2';
const prepared = JSON.parse(readFileSync(path.join(preparedRoot, 'source.json'), 'utf8'));
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const report: any = { schema: 'm2-2-environment-pack-validation-v1', status: 'RUNNING', revision, theater,
    families: [], totals: {}, runtimeAcceptance: false,
    candidateContractFixture: contractPath ? { file: contractPath,
        sha256: digest(readFileSync(contractPath)), scope: 'Additive declarations in validation process memory only' } : undefined };
const requested = process.argv.find(arg => arg.startsWith('--families='))?.slice(11).split(',');
if (requested) assert(requested.every(name => manifest.families[name]), 'Unknown focused family');
for (const density of [2, 4] as const) {
    let totalGpu = 0, totalCpu = 0;
    for (const [identity, family] of Object.entries(manifest.families) as [string, any][]) {
        if (requested && !requested.includes(identity)) continue;
        const declared = environmentHdContract.families[identity];
        assert.equal(family.familyHash, declared.familyHash);
        assert.deepEqual(family.members.map((member: any) => member.member).sort(), declared.members);
        const entries = family.members.map((member: any) => {
            const file = path.join(root, member.path), bytes = readFileSync(file);
            assert.equal(digest(bytes), member.sha256);
            const hd = JSON.parse(bytes.toString());
            const source = prepared.sources.find((source: any) => source.member === member.member);
            return { image: { filename: member.member }, manifest: hd, manifestHash: member.sha256,
                source: { member: member.member, theater, sha256: source.sha256,
                    canvas: source.canvas, frames: source.frames.slice(0, declared
                        ? environmentHdContract.sources[member.member].bodyFrames : 0).map((frame: any) => ({
                            nativeFrame: frame.slot, trimOrigin: frame.origin, trimSize: frame.size,
                            legacyRenderSize: frame.size.map((value: number) => value + value % 2), empty: frame.empty })) },
                read: async (name: string, hash: string, size: number) => {
                    const match = /^(2|4)-(p\d+)-(base|data)\.png$/.exec(name);
                    assert(match, `Unexpected page path ${name}`);
                    const bytes = readFileSync(path.join(path.dirname(file), match[1], match[2], match[3] + '.png'));
                    assert.equal(bytes.length, size); assert.equal(digest(bytes), hash);
                    const png = PNG.sync.read(bytes);
                    return { width: png.width, height: png.height, rgba: new Uint8Array(png.data) };
                } };
        });
        let uploaded = 0, disposed = 0;
        const loaded = await resolveEnvironmentFamily(identity, entries, density, (density === 2 ? 512 : 1280) * 1024 * 1024,
            2048, textures => { uploaded += textures.length;
                textures.forEach(texture => texture.addEventListener('dispose', () => disposed++)); });
        assert.equal(loaded.overrides.size, declared.members.length, JSON.stringify(loaded));
        totalGpu += loaded.gpuBytes; totalCpu += loaded.retainedCpuBytes;
        report.families.push({ identity, density, members: loaded.overrides.size, gpuBytes: loaded.gpuBytes,
            retainedCpuBytes: loaded.retainedCpuBytes, worldChargeBytes: loaded.worldChargeBytes });
        loaded.overrides.forEach(disposeHdSprite);
        assert.equal(disposed, uploaded, 'Every allocated texture must be released');
        const rejected = await resolveEnvironmentFamily(identity, entries, density, 1, 2048,
            () => { throw Error('An over-budget family must not upload'); });
        assert.equal(rejected.overrides.size, 0);
    }
    report.totals[density] = { gpuBytes: totalGpu, retainedCpuBytes: totalCpu,
        worldChargeBytes: totalGpu + totalCpu };
}
report.status = 'PASS_COMPLETE_FAMILIES_DENSITIES_ALLOCATION_FALLBACK_DISPOSAL';
writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: report.status, families: requested?.length ?? Object.keys(manifest.families).length, totals: report.totals }));
