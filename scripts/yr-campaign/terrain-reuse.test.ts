import { afterEach, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import ledger from '../../docs/campaign-art/yr-v1/terrain-reused-families.json';
import { Engine } from '../../src/engine/Engine';
import { TmpFile } from '../../src/data/TmpFile';
import { loadTerrainHd } from '../../src/engine/renderable/entity/map/TerrainHd';
import { registerTerrainResources } from '../../desktop/terrain-profile.mjs';
import { retailMember, sha256 } from '../test-support/resources';

const root = `.local/terrain-packs/${ledger.selectedPack.revision}`;
const manifest = JSON.parse(readFileSync(`${root}/manifest.json`, 'utf8'));
const groups = manifest.groups.filter((group: any) => ledger.addedGroups.includes(group.id));
const members = groups.flatMap((group: any) => group.members);
const files = members.map((member: any) => new TmpFile(retailMember('yr', member.member, member.sourceHashes.yr).file));
const theater = { type: 16, tileSets: { getTile: (index: number) => ({ files: [files[index]] }),
    readMaxTileNum: () => files.length } };
const map = { tiles: { getAll: () => files.map((_: unknown, tileNum: number) => ({ tileNum })) } };
const renderer = { renderer: { capabilities: { maxTextureSize: 8192 }, initTexture: () => {} } };
const originalFetch = globalThis.fetch, originalVfs = Engine.vfs;
afterEach(() => { globalThis.fetch = originalFetch; Engine.vfs = originalVfs; });
const serve = () => {
    Engine.vfs = {} as any;
    globalThis.fetch = (async (url: any) => new Response(readFileSync(
        `${root}/${String(url).endsWith('selection.json') ? 'manifest.json' : String(url).split('/').at(-1)}`))) as any;
};

test('the selected Desert reuse preserves every prior group and accepted donor crop', async () => {
    // Retain only the pinned provenance metadata, not the obsolete atlas payload.
    const bytes = readFileSync(new URL('./fixtures/desert-prior-manifest.json', import.meta.url));
    const prior = JSON.parse(bytes.toString());
    expect(sha256(bytes)).toBe(ledger.priorSelection.sha256);
    expect(sha256(readFileSync(`${root}/manifest.json`))).toBe(ledger.selectedPack.sha256);
    expect(manifest.groups.slice(0, ledger.preservedPriorGroups)).toEqual(prior.groups);
    expect(groups).toHaveLength(3); expect(members).toHaveLength(5);
    expect(ledger.newArtwork).toBe(0); expect(ledger.replacedAcceptedPayloads).toBe(0);
    for (const proof of ledger.members) for (const density of [2, 4]) {
        const group = groups.find((group: any) => group.members.some((member: any) => member.member === proof.member));
        const variant = group.variants.find((variant: any) => variant.density === density);
        const bytes = readFileSync(`${root}/${variant.file}`); expect(sha256(bytes)).toBe(variant.sha256);
        let offset = 0;
        for (const member of group.members) { if (member.member === proof.member) break; offset += member.images.length; }
        for (const frame of proof.densityFrames.filter(frame => frame.density === density)) {
            const [x, y, width, height] = variant.rects[offset + frame.subTile], crop = Buffer.alloc(width * height * 4);
            for (let row = 0; row < height; row++) bytes.copy(crop, row * width * 4,
                ((y + row) * variant.size[0] + x) * 4, ((y + row) * variant.size[0] + x + width) * 4);
            expect(sha256(crop)).toBe(frame.pixelsSha256);
        }
    }
    const registered = await registerTerrainResources('.local');
    expect(registered.selections.get('/local-terrain/desert/selection.json')).toEqual(manifest);
});

for (const density of [2, 4] as const) test(`the complete Desert donor groups bind and release all 25 original subtiles at ${density}X`, async () => {
    serve();
    const cap = (density === 2 ? 512 : 1536) * 1024 * 1024;
    const loaded = await loadTerrainHd(map, theater, renderer, true, density, cap, () => false);
    expect(loaded.report.groups).toHaveLength(3);
    expect(loaded.report.groups.every(group => group.status === 'PUBLISHED')).toBe(true);
    expect(loaded.bindings.size).toBe(25); expect(loaded.textures).toHaveLength(3);
    expect(loaded.report.density).toBe(density); expect(loaded.report.worldChargeBytes).toBeLessThanOrEqual(cap);
    loaded.dispose(); expect(loaded.bindings.size).toBe(0); expect(loaded.report.worldChargeBytes).toBe(0);
});

test('missing, corrupt and over-budget Desert groups retain complete Original fallback', async () => {
    Engine.vfs = {} as any;
    for (const fault of ['missing', 'corrupt', 'budget']) {
        globalThis.fetch = (async (url: any) => {
            if (String(url).endsWith('selection.json')) return Response.json(manifest);
            if (fault === 'missing') return new Response('', { status: 404 });
            const bytes = readFileSync(`${root}/${String(url).split('/').at(-1)}`);
            if (fault === 'corrupt') bytes[0] ^= 1;
            return new Response(bytes);
        }) as any;
        const loaded = await loadTerrainHd(map, theater, renderer, true, 4,
            fault === 'budget' ? 1 : 1536 * 1024 * 1024, () => false);
        expect(loaded.bindings.size).toBe(0); expect(loaded.textures).toHaveLength(0);
        expect(loaded.report.worldChargeBytes).toBe(0); loaded.dispose();
    }
});
