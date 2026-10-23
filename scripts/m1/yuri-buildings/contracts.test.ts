import { resourceRoot, nativeShpSource } from '../../test-support/resources';
import { afterAll, expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import catalog from '../../../desktop/yuri-building-coverage.json';

// Load edition-dependent catalogs only after selecting the test document's
// edition. Run this file in its own Bun process, like the runtime document.
const edition = process.env.C_TEST_EDITION === 'ra2' ? 'ra2' : 'yr';
const previousLocation = globalThis.location;
afterAll(() => { (globalThis as any).location = previousLocation; });
(globalThis as any).location = { search: `?edition=${edition}` };
const { activeEdition } = await import('../../../src/editions/activeEdition');
const { buildingCoverage, matchesBuildingCoverage } = await import('../../../src/engine/renderable/builder/sovietBuildingCoverage');
const { resolvePowerPlantHd, disposePowerPlantHd } = await import('../../../src/engine/renderable/builder/resolvePowerPlantHd');
const { alliedBuildingDemand } = await import('../../../src/engine/renderable/builder/alliedBuildingDemand');
const { TheaterType } = await import('../../../src/engine/TheaterType');
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const decoded = new Map<string, { width: number; height: number; rgba: Uint8Array }>();
const requestedFamilies = process.env.C_TEST_FAMILIES?.split(',').filter(Boolean);
const pageDefinitions = Object.values(catalog).filter(d => !requestedFamilies || requestedFamilies.includes(d.family));
if (requestedFamilies && !pageDefinitions.length) throw Error('No selected family matches C_TEST_FAMILIES');

async function entries(definition: typeof catalog[keyof typeof catalog]) {
    const familyBytes = await fs.readFile(path.join(resourceRoot, definition.familyPath));
    expect(sha(familyBytes)).toBe(definition.familyHash);
    const family = JSON.parse(familyBytes.toString());
    return Promise.all(family.members.map(async (binding: any) => {
        const manifestPath = path.join(`${resourceRoot}/hd-packs`, binding.packId, binding.revision, 'manifest.json');
        const bytes = await fs.readFile(manifestPath);
        expect(sha(bytes)).toBe(binding.sha256);
        const manifest = JSON.parse(bytes.toString());
        const member = definition.members.find(m => m.member === binding.member);
        if (!member) throw Error(`Undeclared member: ${binding.member}`);
        const { image, source } = nativeShpSource('yr', member.member, member.sha256, member.frames, member.theater);
        expect(source.canvas).toEqual(member.canvas);
        expect(manifest.logical.frames).toEqual(source.frames);
        return { image, source, manifest, manifestHash: sha(bytes),
            read: async (file: string) => {
                const resolved = path.join(path.dirname(manifestPath), file);
                if (!decoded.has(resolved)) {
                    const png = PNG.sync.read(await fs.readFile(resolved));
                    decoded.set(resolved, { width: png.width, height: png.height, rgba: new Uint8Array(png.data) });
                }
                return decoded.get(resolved)!;
            } };
    }));
}

test('new Yuri selections are edition scoped and use the existing shared demand queue', () => {
    expect(activeEdition).toBe(edition);
    for (const definition of Object.values(catalog)) {
        const selected = buildingCoverage(definition.family, definition.theater);
        expect(selected?.selection === definition.selection).toBe(edition === 'yr');
        if (edition === 'yr') expect(selected?.members).toEqual(definition.members);
    }
    const demand = alliedBuildingDemand({} as any, { type: TheaterType.Temperate }, {}, true, () => false, 4);
    expect(demand.identities.has('GAFWLL')).toBe(edition === 'yr');
    expect(demand.identities.has('GACNST')).toBe(true);
});

test('actual new immutable pages resolve at both densities with exact native slots', async () => {
    for (const definition of pageDefinitions) {
        const values = await entries(definition);
        expect(matchesBuildingCoverage(definition.family, values.map(e => e.source))).toBe(edition === 'yr');
        for (const density of [2, 4]) {
            let uploads = 0;
            const loaded = await resolvePowerPlantHd(values, density, 2048, () => uploads++, definition.family as any,
                density === 2 ? 256 * 1024 * 1024 : 1280 * 1024 * 1024, true);
            expect(loaded.report.density, JSON.stringify({ family: definition.family, theater: definition.theater, ...loaded.report })).toBe(edition === 'yr' ? density : 1);
            expect(loaded.overrides.size).toBe(edition === 'yr' ? definition.members.length : 0);
            expect(uploads).toBe(edition === 'yr' ? 1 : 0);
            if (edition === 'yr') {
                expect(loaded.report.gpuBytes).toBeGreaterThan(0);
                for (const entry of values) expect(loaded.overrides.get(entry.image)?.frames.length).toBe(entry.source.frames.length);
            }
            disposePowerPlantHd(loaded);
            expect(loaded.overrides.size).toBe(0);
        }
    }
}, 120000);

test('a broken required member/source/page or unavailable shared budget publishes no new family', async () => {
    const definition = pageDefinitions[0];
    for (const failure of ['member', 'source', 'page', 'budget']) {
        const values = await entries(definition);
        if (failure === 'member') values.pop();
        if (failure === 'source') values[0].source.sha256 = '0'.repeat(64);
        if (failure === 'page') values.at(-1)!.read = async () => { throw Error('Controlled required-page failure'); };
        let uploads = 0;
        const loaded = await resolvePowerPlantHd(values, 4, 2048, () => uploads++, definition.family as any,
            failure === 'budget' ? 0 : 1280 * 1024 * 1024, true);
        expect(loaded.report.density).toBe(1);
        expect(loaded.report.gpuBytes).toBe(0);
        expect(loaded.overrides.size).toBe(0);
        expect(uploads).toBe(0);
    }
});
