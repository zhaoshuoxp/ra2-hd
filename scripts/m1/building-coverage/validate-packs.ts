import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import catalog from '../../../desktop/soviet-building-coverage.json';
import { resolvePowerPlantHd, disposePowerPlantHd, type BuildingHdFamily } from '../../../src/engine/renderable/builder/resolvePowerPlantHd';
import { registerHdResources } from '../../../desktop/hd-profile.mjs';

const root = '.artifacts/m1-6c';
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const report: any = { status: 'RUNNING', cases: [], failures: [] };
const target = `${root}/${process.argv[2] ?? 'pack-validation-v1.json'}`;
for (const [key, definition] of Object.entries(catalog)) {
    try {
        const familyBytes = readFileSync(`.local/${definition.familyPath}`);
        assert.equal(hash(familyBytes), definition.familyHash);
        const family = JSON.parse(familyBytes.toString());
        const entries = family.members.map((binding: any, index: number) => {
            const expected = definition.members[index];
            const source = JSON.parse(readFileSync(`${root}/source-v2/members/${expected.sha256}.json`, 'utf8'));
            const directory = `.local/hd-packs/${binding.packId}/${binding.revision}`;
            const bytes = readFileSync(`${directory}/manifest.json`);
            assert.equal(hash(bytes), binding.sha256);
            return { image: {}, manifest: JSON.parse(bytes.toString()), manifestHash: binding.sha256,
                source: { member: expected.member, theater: expected.theater, sha256: expected.sha256,
                    canvas: source.canvas, frames: source.frames.slice(0, expected.frames).map((f: any, nativeFrame: number) => ({
                        nativeFrame, trimOrigin: [f.x, f.y], trimSize: [f.width, f.height],
                        legacyRenderSize: [f.width + f.width % 2, f.height + f.height % 2], empty: f.empty })) },
                read: async (name: string, expectedHash: string, size: number) => {
                    const data = readFileSync(`${directory}/${name}`);
                    assert.equal(data.length, size); assert.equal(hash(data), expectedHash);
                    const png = PNG.sync.read(data);
                    return { width: png.width, height: png.height, rgba: new Uint8Array(png.data) };
                } };
        });
        let allocated = 0, disposed = 0;
        const loaded = await resolvePowerPlantHd(entries, definition.density, 2048, textures => {
            allocated += textures.length;
            textures.forEach(t => t.addEventListener('dispose', () => disposed++));
        }, definition.family as BuildingHdFamily, 64 * 1024 * 1024, true);
        const result: any = { key, ...loaded.report, members: loaded.overrides.size };
        report.cases.push(result);
        disposePowerPlantHd(loaded);
        assert.equal(disposed, allocated, 'Every uploaded texture must be disposed');
        assert.equal(result.density, definition.density, JSON.stringify(result));
        assert.equal(result.members, definition.members.length);
        if (['nabnkr-snow', 'naindp-temperate', 'napowr-newurban'].includes(key)) {
            const checks = [];
            for (const mode of ['missing-member', 'source-mismatch', 'corrupt-member', 'over-budget']) {
                const candidate = entries.map(e => ({ ...e, source: { ...e.source } }));
                if (mode === 'missing-member') candidate.pop();
                if (mode === 'source-mismatch') candidate[0].source.sha256 = '0'.repeat(64);
                if (mode === 'corrupt-member') candidate.at(-1)!.read = async () => { throw Error('controlled corrupt member'); };
                let uploads = 0;
                const rejected = await resolvePowerPlantHd(candidate, definition.density, 2048, () => uploads++,
                    definition.family as BuildingHdFamily, mode === 'over-budget' ? result.gpuBytes - 1 : 64 * 1024 * 1024, true);
                assert.equal(rejected.overrides.size, 0, mode); assert.equal(uploads, 0, mode);
                checks.push({ mode, attempts: rejected.report.attempts });
                disposePowerPlantHd(rejected);
            }
            result.fallback = checks;
        }
        console.log(key, result.gpuBytes, 'PASS');
    } catch (error) {
        report.failures.push({ key, error: String(error) });
        console.log(key, String(error));
    }
    writeFileSync(target, JSON.stringify(report, null, 2));
}
const registered = await registerHdResources(process.cwd() + '/.local');
for (const entry of Object.values(catalog)) {
    assert(registered.availability[entry.selection].startsWith('HD available'), entry.selection);
}
report.registration = 'PASS_ALL_ADDITIONS';
report.status = report.failures.length ? 'FAIL' : 'PASS_COMPLETE_CONTRACTS_POOLED_ALLOCATION_AND_DISPOSAL';
writeFileSync(target, JSON.stringify(report, null, 2));
if (report.failures.length) process.exitCode = 1;
