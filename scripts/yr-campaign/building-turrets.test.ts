import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { Engine } from '../../src/engine/Engine';
import { loadBuildingTurretHd } from '../../src/engine/renderable/building/BuildingTurretHd';
import { EnvironmentHd, resolveEnvironmentFamily } from '../../src/engine/renderable/builder/EnvironmentHd';
import { environmentHdContractForTheater, environmentMemberSource, environmentFamilyScopeIssue }
    from '../../src/engine/renderable/builder/environmentHdContract';
import { registerEnvironmentResources } from '../../desktop/environment-profile.mjs';
import { validateCampaignResources, registerCampaignEnvironmentResources, registerCampaignEnvironmentTurrets }
    from '../../desktop/campaign-profile.mjs';
import { nativeShpSource, retailMember, sha256 } from '../test-support/resources';
import registration from '../../docs/campaign-art/yr-v1/building-turrets-registration-r1.json';

const registered = (async () => {
    const environment = await registerEnvironmentResources('.local'), campaign = await validateCampaignResources('.local/campaign');
    const profile = { routes: new Map([...environment.routes, ...campaign.routes]),
        selections: new Map([...environment.selections, ...campaign.selections]) };
    const records: any[] = [];
    await registerCampaignEnvironmentResources(profile, record => records.push(record));
    return { profile, records };
})();
const route = (theater: string) => `/local-environment/${theater.toLowerCase()}/selection.json`;

test('both complete turret variants pin eight headings, original VXL/HVA, theater, palette and campaign map', async () => {
    const { profile, records } = await registered;
    for (const item of registration.families) {
        const contract = environmentHdContractForTheater(item.theater)!;
        const attachment = contract.turretAttachments![item.environmentFamily];
        const selected = profile.selections.get(route(item.theater)).families[item.environmentFamily];
        expect(records.some(record => record.type === 'campaign-environment-turret-registered'
            && record.identity === item.environmentFamily)).toBe(true);
        expect(item.copiedAcceptedPngFiles).toBe(0); expect(item.replacedAcceptedPayloads).toBe(0);
        for (const [member, hash] of Object.entries(attachment.sources)) expect(retailMember('yr', member).sha256).toBe(hash);
        expect(retailMember('yr', attachment.palette.member).sha256).toBe(attachment.palette.sha256);
        for (const source of (attachment.sourceScope as any).campaignSources) {
            const family = { ...contract.families[item.environmentFamily], sourceScope: attachment.sourceScope };
            expect(environmentFamilyScopeIssue(family, { campaign: { launch: { ...source, sourceSha256: source.sha256 } } }))
                .toBeUndefined();
            for (const change of [{ edition: 'ra2' }, { mission: 'sov01umd.map' }, { sourceSha256: '0'.repeat(64) }])
                expect(environmentFamilyScopeIssue(family, { campaign: { launch: { ...source,
                    sourceSha256: source.sha256, ...change } } })).toBeDefined();
        }
        for (const density of [2, 4] as const) {
            const hash = attachment.variants[density].sha256;
            expect(selected.turrets[density].sha256).toBe(hash);
            const prefix = `/local-hd/${hash}/turret/`, bytes = readFileSync(profile.routes.get(prefix + 'manifest.json'));
            expect(sha256(bytes)).toBe(hash);
            const manifest = JSON.parse(bytes.toString());
            expect(manifest.density).toBe(density); expect(manifest.headings).toHaveLength(8);
            for (const [index, heading] of manifest.headings.entries()) {
                expect(heading.heading).toBe(index * 45); expect(heading.upsampledArtwork).toBe(false);
                expect(heading.independentMasterCapacity).toBeGreaterThanOrEqual(1);
                const base = readFileSync(profile.routes.get(prefix + heading.base));
                const mask = readFileSync(profile.routes.get(prefix + heading.mask));
                expect(sha256(base)).toBe(heading.baseSha256); expect(sha256(mask)).toBe(heading.maskSha256);
                const image = PNG.sync.read(base);
                expect([image.width, image.height]).toEqual(manifest.canvas.map((value: number) => value * density));
                expect(mask.length).toBe(image.width * image.height);
                expect(mask.every(value => value === 0 || value === 255)).toBe(true);
                expect(mask.some(Boolean)).toBe(item.identity === 'CAOUTP');
            }
        }
        if (item.identity === 'CAOUTP') {
            const original = await registerEnvironmentResources('.local');
            const donor = original.selections.get(route('SNOW')).families['snow-caoutp'];
            expect(selected.members).toEqual(donor.members); expect(selected.familyHash).toBe(donor.familyHash);
        }
    }
}, 60000);

async function fixture(density: 2 | 4) {
    const { profile } = await registered, identity = 'yr-task-newurban-caeast02-v1';
    const contract = environmentHdContractForTheater('NEWURBAN')!;
    const attachment = contract.turretAttachments![identity];
    const selected = profile.selections.get(route('NEWURBAN')).families[identity];
    const entries = selected.members.map((member: any) => {
        const native = environmentMemberSource(contract, identity, member.member)!;
        const { source } = nativeShpSource('yr', member.member, native.sha256, native.bodyFrames, 'NEWURBAN');
        return { image: { filename: member.member }, source, manifestHash: member.sha256,
            manifest: JSON.parse(readFileSync(profile.routes.get(member.manifest), 'utf8')),
            read: async (filename: string) => {
                const image = PNG.sync.read(readFileSync(profile.routes.get(member.files[filename])));
                return { width: image.width, height: image.height, rgba: new Uint8Array(image.data) };
            } };
    });
    const bytes = new Map(Object.keys(attachment.sources).concat(attachment.palette.member)
        .map(member => [member, Uint8Array.from(retailMember('yr', member).file.getBytes())]));
    const original = { fetch: globalThis.fetch, bitmap: globalThis.createImageBitmap, vfs: Engine.vfs };
    let closed = 0, decoded = 0;
    globalThis.fetch = (async url => {
        const file = profile.routes.get(String(url)); return file ? new Response(readFileSync(file)) : new Response('', { status: 404 });
    }) as typeof fetch;
    globalThis.createImageBitmap = (async blob => {
        const image = PNG.sync.read(Buffer.from(await (blob as Blob).arrayBuffer())); decoded++;
        return { width: image.width, height: image.height, close() { closed++; } } as ImageBitmap;
    }) as typeof createImageBitmap;
    Engine.vfs = { openFile: (name: string) => ({ getBytes: () => bytes.get(name)! }) } as any;
    const load = () => loadBuildingTurretHd(selected.turrets[density], 'CAEAST02', density,
        { theater: 'NEWURBAN', sources: attachment.sources, palette: attachment.palette });
    return { identity, entries, attachment: { gpuBytes: 8 * 80 * 80 * density * density * 5 + 4,
        workingBytes: attachment.variants[density].workingBytes, load }, bytes,
        counts: () => ({ decoded, closed }), restore() {
            globalThis.fetch = original.fetch; globalThis.createImageBitmap = original.bitmap; Engine.vfs = original.vfs;
        } };
}

for (const density of [2, 4] as const) test(`complete pedestal and turret publish, account retained memory and release together at ${density}X`, async () => {
    const f = await fixture(density);
    try {
        let uploaded = 0;
        const loaded = await resolveEnvironmentFamily(f.identity, f.entries, density, 100 * 1024 ** 2, 8192,
            textures => { uploaded += textures.length; }, () => false, f.attachment);
        expect(loaded.attempts).toEqual([]); expect(loaded.overrides.size).toBe(1);
        expect(loaded.turret?.parts.size).toBe(8); expect(uploaded).toBeGreaterThanOrEqual(19);
        expect(loaded.retainedCpuBytes).toBeGreaterThan(loaded.turret!.gpuBytes);
        expect(loaded.worldChargeBytes).toBe(loaded.gpuBytes + loaded.retainedCpuBytes);
        expect(loaded.loadingPeakBytes).toBeGreaterThan(loaded.worldChargeBytes);
        const match = new EnvironmentHd();
        loaded.overrides.forEach((override, image) => match.overrides.set(image, override));
        match.turrets.set('CAEAST02', loaded.turret!); match.turrets.set('alias', loaded.turret!);
        Object.assign(match.report, loaded); match.dispose(); match.dispose();
        expect(f.counts()).toEqual({ decoded: 8, closed: 8 }); expect(loaded.turret!.disposed).toBe(true);
        expect(match.overrides.size).toBe(0); expect(match.turrets.size).toBe(0); expect(match.report.worldChargeBytes).toBe(0);
    } finally { f.restore(); }
});

test('missing turret, corrupt source, missing direction, budget refusal, cancellation and upload failure leave the entire actor Original', async () => {
    const f = await fixture(2);
    try {
        let uploads = 0, calls = 0, stopped = false;
        const resolve = (attachment = f.attachment, budget = 100 * 1024 ** 2, upload = () => { uploads++; }) =>
            resolveEnvironmentFamily(f.identity, f.entries, 2, budget, 8192, upload, () => stopped, attachment);
        const absent = await resolveEnvironmentFamily(f.identity, f.entries, 2, 100 * 1024 ** 2, 8192, () => { uploads++; });
        expect(absent.attempts[0].reason).toBe('missing-environment-turret'); expect(absent.overrides.size).toBe(0);
        const tooLarge = await resolve({ ...f.attachment, gpuBytes: 100 * 1024 ** 2,
            load: async () => { calls++; return f.attachment.load(); } });
        expect(tooLarge.overrides.size).toBe(0); expect(calls).toBe(0); expect(f.counts().decoded).toBe(0);
        const original = f.bytes.get('cahead.vxl')!; f.bytes.set('cahead.vxl', new Uint8Array([1]));
        const badSource = await resolve(); expect(badSource.overrides.size).toBe(0); expect(badSource.worldChargeBytes).toBe(0);
        f.bytes.set('cahead.vxl', original);
        const fetch = globalThis.fetch;
        globalThis.fetch = ((url, options) => String(url).endsWith('/135.png')
            ? Promise.resolve(new Response('', { status: 404 })) : fetch(url, options)) as typeof fetch;
        const missing = await resolve(); expect(missing.overrides.size).toBe(0); expect(missing.turret).toBeUndefined();
        expect(f.counts()).toEqual({ decoded: 3, closed: 3 }); globalThis.fetch = fetch;
        const cancelled = await resolve({ ...f.attachment, load: async () => {
            const loaded = await f.attachment.load(); stopped = true; return loaded;
        } });
        expect(cancelled.overrides.size).toBe(0); expect(cancelled.worldChargeBytes).toBe(0); stopped = false;
        const failed = await resolve(f.attachment, 100 * 1024 ** 2, () => { throw Error('test-upload-failed'); });
        expect(failed.overrides.size).toBe(0); expect(failed.worldChargeBytes).toBe(0); expect(uploads).toBe(0);
        expect(f.counts().closed).toBe(f.counts().decoded);
    } finally { f.restore(); }
});

test('desktop refuses incomplete turret directions before publishing either density binding or routes', async () => {
    const { profile } = await registered;
    const broken = { routes: new Map(profile.routes), selections: new Map(profile.selections) };
    const currentBundles: string[] = [];
    for (const item of registration.families) {
        const key = route(item.theater), selected = profile.selections.get(key), body = selected.families[item.environmentFamily];
        const { turrets, ...original } = body;
        broken.selections.set(key, { ...selected, families: { ...selected.families, [item.environmentFamily]: original } });
        const attachment = environmentHdContractForTheater(item.theater)!.turretAttachments![item.environmentFamily];
        const [bundleRoute, bundle] = [...profile.routes]
            .filter(([url]) => /\/environment-turret-[a-z0-9-]+\.json$/.test(url))
            .map(([url, file]) => [url, JSON.parse(readFileSync(file, 'utf8'))] as const)
            .find(([, value]) => value.identity === item.environmentFamily
                && value.variants[4].sha256 === attachment.variants[4].sha256)!;
        currentBundles.push(bundleRoute);
        const prefix = bundleRoute.slice(0, bundleRoute.lastIndexOf('/') + 1);
        broken.routes.delete(prefix + bundle.variants[4].files['270.png']);
        for (const variant of Object.values(attachment.variants)) for (const file of ['manifest.json',
            ...Array.from({ length: 8 }, (_, i) => [`${i * 45}.png`, `${i * 45}.mask`]).flat()])
            broken.routes.delete(`/local-hd/${variant.sha256}/turret/${file}`);
    }
    const records: any[] = [];
    await registerCampaignEnvironmentTurrets(broken, record => records.push(record));
    for (const item of registration.families) {
        expect(broken.selections.get(route(item.theater)).families[item.environmentFamily].turrets).toBeUndefined();
        const attachment = environmentHdContractForTheater(item.theater)!.turretAttachments![item.environmentFamily];
        for (const variant of Object.values(attachment.variants))
            expect(broken.routes.has(`/local-hd/${variant.sha256}/turret/manifest.json`)).toBe(false);
    }
    expect(records.filter(record => record.type === 'campaign-environment-turret-original'
        && currentBundles.includes(record.bundle))).toHaveLength(2);
});
