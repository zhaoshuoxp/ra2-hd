import { afterEach, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import ledger from '../../docs/campaign-art/yr-v1/authored-terrain.json';
import { activeEdition } from '../../src/editions/activeEdition';
import { Engine } from '../../src/engine/Engine';
import { TmpFile } from '../../src/data/TmpFile';
import { loadTerrainHd } from '../../src/engine/renderable/entity/map/TerrainHd';
import { retailMember, selectedPack, sha256 } from '../test-support/resources';

const originalFetch = globalThis.fetch, originalVfs = Engine.vfs;
afterEach(() => { globalThis.fetch = originalFetch; Engine.vfs = originalVfs; });
// Exercise accepted current groups once. Retired intermediate atlas revisions
// are provenance and must not remain runtime-sized test fixtures.
const authoredIds = new Set(ledger.batches.flatMap(batch => batch.addedGroups));
const theaters = [...new Map(ledger.batches.map(batch => [batch.theaterType, batch.theater])).entries()];
for (const [theaterType, theaterName] of theaters) {
    const { directory: root, manifest } = selectedPack('terrain', theaterName);
    const groups = manifest.groups.filter((group: any) => authoredIds.has(group.id));
    if (!groups.length) throw Error(`No accepted authored groups for ${theaterName}`);
    for (const group of groups) {
        const members = group.members;
        const files = members.map((member: any) => new TmpFile(retailMember('yr', member.member, member.sourceHashes.yr).file));
        const batch = { identity: `${theaterName}/${group.id}`, theaterType, addedGroups: [group.id],
            sourceSubtiles: files.reduce((count: number, file: TmpFile) => count + file.images.filter(Boolean).length, 0) };
        const fixture = (native = files) => ({
            theater: { type: batch.theaterType, tileSets: { getTile: (index: number) => ({ files: [native[index]] }),
                readMaxTileNum: () => native.length } },
            map: { tiles: { getAll: () => native.map((_, tileNum: number) => ({ tileNum })) } },
        });
        const renderer = { renderer: { capabilities: { maxTextureSize: 8192 }, initTexture: () => {} } };
        const serve = (fault?: string) => {
            Engine.vfs = {} as any;
            globalThis.fetch = (async (url: any) => {
                if (String(url).endsWith('selection.json')) {
                    const value = structuredClone(manifest);
                    if (fault === 'source') for (const group of value.groups.filter((g: any) => batch.addedGroups.includes(g.id)))
                        for (const member of group.members) member.sourceHashes.yr = '0'.repeat(64);
                    return Response.json(value);
                }
                if (fault === 'missing') return new Response('', { status: 404 });
                const payload = readFileSync(`${root}/${String(url).split('/').at(-1)}`);
                if (fault === 'corrupt') payload[0] ^= 1;
                return new Response(payload);
            }) as any;
        };

        test(`${batch.identity} preserves pinned pages and complete original source metadata`, () => {
            expect(members.length).toBeGreaterThan(0);
            expect(members.reduce((count: number, member: any) => count + member.images.length, 0)).toBe(batch.sourceSubtiles);
            expect(group.variants.map((variant: any) => variant.density).sort()).toEqual([2, 4]);
            for (const variant of group.variants)
                expect(sha256(readFileSync(`${root}/${variant.file}`))).toBe(variant.sha256);
            for (let i = 0; i < members.length; i++) {
                expect(members[i].images.length).toBe(files[i].images.filter(Boolean).length);
                expect(members[i].sourceHashes.yr).toMatch(/^[a-f0-9]{64}$/);
            }
        });

        for (const density of [2, 4] as const) test(`${batch.identity} binds complete original TMP members and releases at ${density}X`, async () => {
            serve();
            const { theater, map } = fixture(), cap = (density === 2 ? 512 : 1536) * 1024 ** 2;
            const loaded = await loadTerrainHd(map, theater, renderer, true, density, cap, () => false);
            if (activeEdition === 'yr') {
                expect(loaded.bindings.size).toBe(batch.sourceSubtiles);
                expect(loaded.report.groups.every(group => group.status === 'PUBLISHED' && group.density === density)).toBe(true);
                for (const binding of loaded.bindings.values())
                    expect([binding.rect.width, binding.rect.height]).toEqual([binding.logical.width * density, binding.logical.height * density]);
                expect(loaded.report.worldChargeBytes).toBeLessThanOrEqual(cap);
            } else expect(loaded.bindings.size).toBe(0);
            loaded.dispose(); expect(loaded.bindings.size).toBe(0); expect(loaded.report.worldChargeBytes).toBe(0);
        });

        test(`${batch.identity} preserves complete Original fallback on missing, corrupt, source and budget faults`, async () => {
            for (const fault of ['missing', 'corrupt', 'source', 'budget']) {
                serve(fault);
                const { theater, map } = fixture();
                const loaded = await loadTerrainHd(map, theater, renderer, true, 4,
                    fault === 'budget' ? 1 : 1536 * 1024 ** 2, () => false);
                expect(loaded.bindings.size).toBe(0); expect(loaded.textures).toHaveLength(0);
                expect(loaded.report.worldChargeBytes).toBe(0); loaded.dispose();
            }
        });

        if (group.members.length > 1) test(`${batch.identity} cannot publish a partial multi-member source group`, async () => {
            serve();
            const incomplete = group.members.slice(0, -1).map((member: any) => files[members.indexOf(member)]);
            const { theater, map } = fixture(incomplete);
            const loaded = await loadTerrainHd(map, theater, renderer, true, 4, 1536 * 1024 ** 2, () => false);
            expect(loaded.bindings.size).toBe(0); expect(loaded.textures).toHaveLength(0);
            expect(loaded.report.worldChargeBytes).toBe(0); loaded.dispose();
        });
    }
}
