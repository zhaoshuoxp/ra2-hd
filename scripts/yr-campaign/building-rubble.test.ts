import { expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PNG } from 'pngjs';
import ledger from '../../docs/campaign-art/yr-v1/building-rubble.json';
import taskBuildings from '../../docs/campaign-art/yr-v1/task-buildings.json';
import { validateCampaignResources, registerCampaignEnvironmentResources } from '../../desktop/campaign-profile.mjs';
import { registerEnvironmentResources } from '../../desktop/environment-profile.mjs';
import { registerCampaignEnvironmentAliases } from '../../desktop/campaign-environment-aliases.mjs';
import { environmentHdContractForTheater, environmentMemberSource, environmentFamilyScopeIssue }
    from '../../src/engine/renderable/builder/environmentHdContract';
import { resolveEnvironmentFamily } from '../../src/engine/renderable/builder/EnvironmentHd';
import { disposeHdSprite } from '../../src/engine/renderable/builder/resolveHdSprite';
import { nativeShpSource, sha256 } from '../test-support/resources';

const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const registered = (async () => {
    const environment = await registerEnvironmentResources('.local');
    const campaign = await validateCampaignResources('.local/campaign');
    const profile = { routes: new Map([...environment.routes, ...campaign.routes]),
        selections: new Map([...environment.selections, ...campaign.selections]) };
    await registerCampaignEnvironmentResources(profile); await registerCampaignEnvironmentAliases(profile);
    return profile;
})();

const cropHash = (image: PNG, rect: number[]) => {
    const [x, y, width, height] = rect, bytes = Buffer.alloc(width * height * 4);
    for (let row = 0; row < height; row++) image.data.copy(bytes, row * width * 4,
        ((y + row) * image.width + x) * 4, ((y + row) * image.width + x + width) * 4);
    return sha256(bytes);
};

for (const item of [...ledger.families, ...taskBuildings.families]) {
    const resources = () => registered.then(profile => {
        const contract = environmentHdContractForTheater(item.theater)!;
        const family = contract.families[item.family];
        const suffix = item.theater === 'TEMPERATE' ? '' : '/' + item.theater.toLowerCase();
        const selected = (profile.selections.get(`/local-environment${suffix}/selection.json`) as any).families[item.family];
        expect(selected.familyHash).toBe(family.familyHash);
        const entries = selected.members.map((member: any) => {
            const descriptor = environmentMemberSource(contract, item.family, member.member)!;
            const { source } = nativeShpSource('yr', member.member, descriptor.sha256, descriptor.bodyFrames, item.theater);
            const bytes = readFileSync(profile.routes.get(member.manifest)!);
            expect(sha256(bytes)).toBe(member.sha256);
            return { image: { filename: member.member }, source, manifestHash: member.sha256,
                manifest: JSON.parse(bytes.toString()), selection: member,
                read: async (name: string, hash: string, size: number) => {
                    const bytes = readFileSync(profile.routes.get(member.files[name])!);
                    expect(sha256(bytes)).toBe(hash); expect(bytes.length).toBe(size);
                    const png = PNG.sync.read(bytes);
                    return { width: png.width, height: png.height, rgba: new Uint8Array(png.data) };
                } };
        });
        return { profile, family, entries };
    });

    test(`${item.theater}/${item.identity} pins original geometry, accepted pixels and complete family scopes`, async () => {
        const { profile, family, entries } = await resources();
        const pages = new Map<string, PNG>();
        const pixels = (file: string) => {
            if (!pages.has(file)) pages.set(file, PNG.sync.read(readFileSync(file)));
            return pages.get(file)!;
        };
        const recipes = item.recipes.map(read);
        const receipt = read(item.registration);
        expect(receipt.acceptedPayloadsReplaced).toBe(0);
        expect(receipt.sourceVerification.counts.preservedAcceptedDensityFrames).toBe(item.preservedAcceptedDensityFrames);
        for (const entry of entries) {
            expect(entry.manifest.logical.canvas).toEqual(entry.source.canvas);
            expect(entry.manifest.logical.frames).toEqual(entry.source.frames);
        }
        for (const recipe of recipes) if (recipe.acceptedBase) {
            const donor = recipe.acceptedBase;
            const accepted = read(donor.manifestFile), entry = entries[0];
            expect(sha256(readFileSync(donor.manifestFile))).toBe(donor.manifestSha256);
            expect(accepted.logical).toEqual(entry.manifest.logical);
            expect(receipt.sourceVerification.counts.preservedAcceptedBaseDensityFrames).toBe(6);
            for (const variant of entry.manifest.variants) {
                const prior = accepted.variants.find((row: any) => row.density === variant.density);
                for (const page of variant.pages) {
                    const before = prior.pages.find((row: any) => row.id === page.id);
                    expect(page.baseSha256).toBe(before.baseSha256);
                    expect(sha256(readFileSync(profile.routes.get(entry.selection.files[page.base])!)))
                        .toBe(before.baseSha256);
                    expect(page.dataSha256).not.toBe(before.dataSha256);
                }
            }
        }
        for (const recipe of recipes) for (const [name, donor] of Object.entries(recipe.acceptedNativeBodyFrames ?? {}) as any) {
            const entry = entries.find((entry: any) => entry.image.filename === name)!;
            if (item.identity === 'CASLAB') {
                // Retired donor atlases were compared at registration. Pin the
                // current payload to that receipt and retain native-slot proof.
                const proofBytes = readFileSync(donor.proofFile);
                expect(sha256(proofBytes)).toBe(donor.proofSha256);
                const sourceProof = JSON.parse(proofBytes.toString()).rows
                    .find((row: any) => row.member === name);
                expect(sourceProof.sourceSha256).toBe(entry.source.sha256);
                expect(entry.source.sha256).toBe(recipe.sourceSha256);
                expect(entry.manifest.logical.frames).toEqual(entry.source.frames);
                for (const slot of donor.slots) {
                    const row = sourceProof.slots.find((row: any) => row.slot === slot);
                    expect(row.status).toBe('ELIGIBLE_EXACT_RENDERED_BODY_DONOR');
                    expect(row.sameGeometry).toBe(true);
                    expect(row.differingRenderedPixels).toBe(0);
                    expect(row.differingOwnerPixels).toBe(0);
                    expect(row.differingAlphaPixels).toBe(0);
                }
                for (const variant of entry.manifest.variants) for (const page of variant.pages) {
                    for (const role of ['base', 'data']) {
                        const route = entry.selection.files[page[role]];
                        const acceptedFile = receipt.files.find((file: any) => file.name === page[role]);
                        expect(acceptedFile).toBeDefined();
                        expect(page[role + 'Sha256']).toBe(acceptedFile.sha256);
                        expect(sha256(readFileSync(profile.routes.get(route)!))).toBe(acceptedFile.sha256);
                    }
                }
                continue;
            }
            // Accepted donors remain authoring evidence after a newer family
            // changes the selected runtime routes.
            const bytes = readFileSync(donor.manifestFile);
            expect(sha256(bytes)).toBe(donor.manifestSha256);
            const accepted = JSON.parse(bytes.toString()), donorRoot = dirname(donor.manifestFile);
            expect(entry.source.sha256).toBe(recipe.sourceSha256);
            expect(entry.manifest.logical.frames).toEqual(entry.source.frames);
            for (const variant of entry.manifest.variants) {
                const previous = accepted.variants.find((row: any) => row.density === variant.density);
                for (const slot of donor.slots) {
                    const frame = variant.frames[slot], prior = previous.frames[slot];
                    const page = variant.pages.find((row: any) => row.id === frame.page);
                    const priorPage = previous.pages.find((row: any) => row.id === prior.page);
                    for (const role of ['base', 'data']) {
                        const actual = pixels(profile.routes.get(entry.selection.files[page[role]])!);
                        const flat = join(donorRoot, priorPage[role]);
                        const priorFile = existsSync(flat) ? flat
                            : join(donorRoot, String(variant.density), priorPage.id, role+'.png');
                        expect(sha256(readFileSync(priorFile))).toBe(priorPage[role+'Sha256']);
                        const before = pixels(priorFile);
                        expect(cropHash(actual, frame.sampleRect)).toBe(cropHash(before, prior.sampleRect));
                    }
                }
            }
        }
        for (const source of family.sourceScope!.campaignSources!) {
            expect(environmentFamilyScopeIssue(family, { campaign: { launch: {
                ...source, sourceSha256: source.sha256 } } })).toBeUndefined();
            expect(environmentFamilyScopeIssue(family, { campaign: { launch: {
                ...source, edition: 'ra2', sourceSha256: source.sha256 } } })).toBeDefined();
        }
    }, 60000);

    for (const density of [2, 4] as const) test(`${item.theater}/${item.identity} complete ${density}X binding, fallback and release`, async () => {
        const { entries } = await resources(), cap = (density === 2 ? 512 : 1536) * 1024 * 1024;
        let uploaded = 0, released = 0;
        const loaded = await resolveEnvironmentFamily(item.family, entries, density, cap, 8192, textures => {
            uploaded += textures.length; textures.forEach(texture => texture.addEventListener('dispose', () => released++));
        });
        expect(loaded.attempts).toEqual([]); expect(loaded.density).toBe(density);
        expect(loaded.overrides.size).toBe(entries.length); expect(loaded.loadingPeakBytes).toBeLessThanOrEqual(cap);
        loaded.overrides.forEach(disposeHdSprite); expect(released).toBe(uploaded);
        for (const brokenIndex of entries.keys()) {
            const broken = entries.map((entry: any, index: number) => index !== brokenIndex ? entry
                : { ...entry, read: async () => { throw Error('Missing complete building page'); } });
            const fallback = await resolveEnvironmentFamily(item.family, broken, density, cap, 8192,
                () => { throw Error('An incomplete source family cannot upload'); });
            expect(fallback.overrides.size).toBe(0); expect(fallback.worldChargeBytes).toBe(0);
        }
    }, 60000);
}
