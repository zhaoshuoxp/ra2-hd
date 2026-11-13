import { expect, test } from 'bun:test';
import { registerEnvironmentResources } from '../../desktop/environment-profile.mjs';
import { validateCampaignResources, registerCampaignEnvironmentResources } from '../../desktop/campaign-profile.mjs';
import { registerCampaignEnvironmentAliases } from '../../desktop/campaign-environment-aliases.mjs';
import aliases from '../../desktop/campaign-environment-aliases.json';
import snow from '../../desktop/environment-snow-hd-contract.json';
import urban from '../../desktop/environment-urban-hd-contract.json';
import { environmentFamilyScopeIssue } from '../../src/engine/renderable/builder/environmentHdContract';
import { resourceRoot } from '../test-support/resources';
import path from 'node:path';

async function profile() {
    const environment = await registerEnvironmentResources(resourceRoot, () => {});
    const campaign = await validateCampaignResources(path.join(resourceRoot, 'campaign'));
    const data = { routes: new Map([...environment.routes, ...campaign.routes]), selections: new Map([...environment.selections, ...campaign.selections]) };
    await registerCampaignEnvironmentResources(data);
    return data;
}

test('complete source-qualified aliases reuse every immutable accepted 2X/4X page without publishing new payload routes', async () => {
    const data = await profile(), routes = [...data.routes], events: any[] = [];
    await registerCampaignEnvironmentAliases(data, event => events.push(event));
    expect(events.map(event => event.type)).toEqual(aliases.records.map(() => 'campaign-environment-alias-ready'));
    expect([...data.routes]).toEqual(routes);
    for (const alias of aliases.records) {
        const selected = data.selections.get(`/local-environment${alias.theater === 'TEMPERATE' ? '' : '/' + alias.theater.toLowerCase()}/selection.json`);
        const family = selected.families[alias.identity]; expect(family.familyHash).toBe(alias.familyHash);
        const specs: any[] = (alias as any).members ?? [alias];
        for (const spec of specs) {
            const memberDonors = (alias as any).sourcePolicy === 'complete-native-member-donors-v1';
            const theater = memberDonors ? spec.sourceTheater : alias.sourceTheater;
            const sourceRoute = `/local-environment${theater === 'TEMPERATE' ? '' : '/' + theater.toLowerCase()}/selection.json`;
            const source = data.selections.get(sourceRoute).families[memberDonors ? spec.sourceFamily : alias.sourceFamily];
            const donor = memberDonors ? source.members.find(member => member.member === spec.sourceMember)
                : specs.length === 1 ? source.members[0] : source.members.find(member => member.member === spec.member);
            const selected = family.members.find(member => member.member === spec.member);
            expect(selected.manifest).toBe(spec.manifest ?? donor.manifest); expect(selected.files).toEqual(donor.files);
        }
    }
    expect(aliases.records[0].sourceSamplingDifferences).toEqual([]);
    expect(aliases.records[1].sourceSamplingDifferences).toEqual([{ frame: 96, index: 254, x: 21, y: 10 }]);
});

test('a missing accepted page rejects its whole alias and retains other complete families', async () => {
    const data = await profile(), alias = aliases.records[1], events: any[] = [];
    const source = data.selections.get('/local-environment/urban/selection.json').families[alias.sourceFamily].members[0];
    data.routes.delete(Object.values(source.files)[0] as string);
    await registerCampaignEnvironmentAliases(data, event => events.push(event));
    const families = data.selections.get('/local-environment/snow/selection.json').families;
    expect(families[aliases.records[0].identity]).toBeDefined(); expect(families[alias.identity]).toBeUndefined();
    expect(events[1].type).toBe('campaign-environment-alias-original');
});

test('the German Snow flag publishes its exact authored pole and complete national animation atomically', async () => {
    const alias: any = aliases.records.find(record => record.identity === snow.identities.ra2.CAGEFGL)!;
    expect(alias.sourcePolicy).toBe('complete-native-member-donors-v1');
    expect(alias.members.map(member => member.member)).toEqual(['cagefgl.shp', 'cagefgl_a.shp']);
    expect(alias.members.map(member => member.sourceFamily)).toEqual(['campaign-sov11-carufgl-owner-v28-r1', 'environment-ctgefgl']);
    for (const corrupt of [false, true]) {
        const data = await profile(), events: any[] = [];
        const donor = data.selections.get('/local-environment/selection.json').families['environment-ctgefgl'];
        if (corrupt) data.routes.delete(Object.values(donor.members.find(member => member.member === 'ctgefgl_a.shp').files)[0] as string);
        await registerCampaignEnvironmentAliases(data, event => events.push(event));
        const family = data.selections.get('/local-environment/snow/selection.json').families[alias.identity];
        expect(events.find(event => event.identity === alias.identity)?.type)
            .toBe(corrupt ? 'campaign-environment-alias-original' : 'campaign-environment-alias-ready');
        if (corrupt) expect(family).toBeUndefined();
        else expect(family.members.map(member => member.member)).toEqual(['cagefgl.shp', 'cagefgl_a.shp']);
        expect(data.selections.get('/local-environment/snow/selection.json').families['campaign-sov11-carufgl']).toBeDefined();
    }
    const family: any = snow.families[alias.identity];
    expect(environmentFamilyScopeIssue(family, { campaign: { launch: { edition: 'ra2', mission: 'all10s.map',
        sourceSha256: 'ac0ea14ec650256a014626db7c78135bb74168ba86d4eb863d987f04b07d1593' } } })).toBeUndefined();
    expect(environmentFamilyScopeIssue(family, {})).toBeDefined();
});

test.each([
    ['Soviet', 'CARUFGL', 'campaign-snow-carufgl-owner-v28-r1', 'carufgl', 'urban-ctrufgl', 'curufgl_a.shp'],
    ['US', 'CAUSFGL', 'campaign-sov07-causfgl-owner-v28-r1', 'causfgl', 'urban-ctusfgl', 'cuusfgl_a.shp'],
])('the %s Snow flag retains its pole donor and publishes the accepted full animation atomically',
async (_label, root, identity, member, donorIdentity, donorMember) => {
    expect(snow.identities.ra2[root]).toBe(identity);
    const alias: any = aliases.records.find(record => record.identity === identity)!;
    expect(alias.members.map(part => part.member)).toEqual([member + '.shp', member + '_a.shp']);
    expect(alias.members.map(member => member.sourceFamily)).toEqual(['campaign-sov11-carufgl-owner-v28-r1', donorIdentity]);
    for (const corrupt of [false, true]) {
        const data = await profile();
        if (corrupt) {
            const donor = data.selections.get('/local-environment/urban/selection.json').families[donorIdentity];
            const animation = donor.members.find(member => member.member === donorMember);
            data.routes.delete(Object.values(animation.files)[0] as string);
        }
        await registerCampaignEnvironmentAliases(data);
        const selected = data.selections.get('/local-environment/snow/selection.json').families;
        expect(!!selected[identity]).toBe(!corrupt);
        expect(selected['campaign-sov11-carufgl']).toBeDefined();
        if (!corrupt) expect(selected[identity].members.map(part => part.member)).toEqual([member + '.shp', member + '_a.shp']);
    }
    expect(snow.families[identity].sourceScope.campaignSources.map(source => source.mission))
        .toEqual(root === 'CARUFGL' ? ['sov11s.map', 'all05s.map'] : ['sov07s.map']);
    expect(environmentFamilyScopeIssue(snow.families[identity], {})).toBeDefined();
});

test('Allied05 scenery extensions admit only its original Snow source while preserving earlier missions', () => {
    for (const name of ['CARUFGL', 'CAGEFGL', 'CAMSC11']) {
        const family = snow.families[snow.identities.ra2[name]];
        const launch = { edition: 'ra2', mission: 'all05s.map',
            sourceSha256: 'd09cebddc1f4009098dfa48b18bf4022e6e4d00801f1ca8efd99917f185bb225' };
        expect(environmentFamilyScopeIssue(family, { campaign: { launch } })).toBeUndefined();
        expect(environmentFamilyScopeIssue(family, { campaign: { launch: { ...launch, edition: 'yr' } } })).toBeDefined();
        expect(environmentFamilyScopeIssue(family, { campaign: { launch: { ...launch, sourceSha256: '0'.repeat(64) } } })).toBeDefined();
        expect(environmentFamilyScopeIssue(family, {})).toBeDefined();
    }
});

test('a missing Temperate page rejects the complete bounded alias and preserves unrelated formal families', async () => {
    const data = await profile(), alias = aliases.records.find(record => record.identity === 'campaign-all07-civ2')!;
    const selection = data.selections.get('/local-environment/selection.json');
    const donor = selection.families[alias.sourceFamily].members[0], events: any[] = [];
    data.routes.delete(Object.values(donor.files)[0] as string);
    await registerCampaignEnvironmentAliases(data, event => events.push(event));
    const families = data.selections.get('/local-environment/selection.json').families;
    expect(families[alias.identity]).toBeUndefined(); expect(families[alias.sourceFamily]).toBeDefined();
    expect(events.find(event => event.identity === alias.identity)?.type).toBe('campaign-environment-alias-original');
    expect(events.some(event => event.type === 'campaign-environment-alias-ready')).toBe(true);
});

test('campaign aliases require the exact mission and map hash without broadening legacy first-mission scope', () => {
    const family: any = snow.families[aliases.records[0].identity], source = family.sourceScope.campaignSources[0];
    const context: any = { campaign: { launch: { edition: 'ra2', mission: source.mission, sourceSha256: source.sha256 } } };
    expect(environmentFamilyScopeIssue(family, context)).toBeUndefined();
    for (const admitted of family.sourceScope.campaignSources) {
        context.campaign.launch = { edition: 'ra2', mission: admitted.mission, sourceSha256: admitted.sha256 };
        expect(environmentFamilyScopeIssue(family, context)).toBeUndefined();
    }
    context.campaign.launch.mission = 'sov03u.map'; expect(environmentFamilyScopeIssue(family, context)).toBe('campaign-map-source-scope-mismatch');
    context.campaign.launch.mission = source.mission; context.campaign.launch.sourceSha256 = '0'.repeat(64);
    expect(environmentFamilyScopeIssue(family, context)).toBe('campaign-map-source-scope-mismatch');
    const legacy: any = { sourceScope: { campaignSourceSha256s: [source.sha256] } };
    context.campaign.launch.sourceSha256 = source.sha256;
    expect(environmentFamilyScopeIssue(legacy, context)).toBe('campaign-map-source-scope-mismatch');
});

test('the ninth civilian alias shares complete Urban metadata and preserves the accepted YR family scope', async () => {
    const data = await profile(), source = data.selections.get('/local-environment/urban/selection.json').families['urban-civa'];
    const alias = aliases.records.find(record => record.identity === 'campaign-sov09-civa')!;
    expect(alias.sourceTheater).toBe('URBAN'); expect(alias.manifest).toBeUndefined();
    await registerCampaignEnvironmentAliases(data);
    const family = data.selections.get('/local-environment/urban/selection.json').families[alias.identity];
    expect(family.members).toEqual(source.members); expect(urban.families['urban-civa'].editions).toEqual(['yr']);
    const context: any = { campaign: { launch: { edition: 'ra2', mission: 'sov09u.map',
        sourceSha256: 'ef2dd5c5280d20f5759c02cebf860111280dc0f091c322f21b42eeae6b53c8b6' } } };
    expect(environmentFamilyScopeIssue(urban.families[alias.identity], context)).toBeUndefined();
    expect(environmentFamilyScopeIssue(urban.families[alias.identity], {})).toBeDefined();
    context.campaign.launch.mission = 'sov08u.map'; expect(environmentFamilyScopeIssue(urban.families[alias.identity], context)).toBeDefined();
});

test('the fourth amplifier atomically aliases body and animation while leaving the accepted YR donor unrestricted', async () => {
    const data = await profile(), alias: any = aliases.records.find(record => record.identity === 'campaign-all04-napsya')!;
    expect(alias.members.map((member: any) => member.member)).toEqual(['nupsya.shp', 'nupsya_a.shp']);
    const selected = data.selections.get('/local-environment/urban/selection.json'), donor = selected.families['urban-napsya'];
    expect(selected.families[alias.identity]).toBeUndefined(); await registerCampaignEnvironmentAliases(data);
    expect(data.selections.get('/local-environment/urban/selection.json').families[alias.identity].members).toEqual(donor.members);
    expect(urban.families['urban-napsya'].editions).toEqual(['yr']);
    expect(environmentFamilyScopeIssue(urban.families['urban-napsya'], {})).toBeUndefined();
    const bounded: any = urban.families[alias.identity];
    expect(bounded.editions).toEqual(['ra2']); expect(environmentFamilyScopeIssue(bounded, {})).toBeDefined();
    const launch: any = { edition: 'ra2', mission: 'all04u.map',
        sourceSha256: '09e52db16946a330c032e988679ef61ff7745670ddad5e9bfcf96f916d18d093' };
    expect(environmentFamilyScopeIssue(bounded, { campaign: { launch } })).toBeUndefined();
    launch.mission = 'all03u.map'; expect(environmentFamilyScopeIssue(bounded, { campaign: { launch } })).toBeDefined();
});

test('a substituted second amplifier component page rejects the whole new family and preserves unrelated complete aliases', async () => {
    const data = await profile(), alias: any = aliases.records.find(record => record.identity === 'campaign-all04-napsya')!;
    const source = data.selections.get('/local-environment/urban/selection.json').families['urban-napsya'].members[1];
    const routes = Object.values(source.files) as string[]; expect(routes.length).toBeGreaterThan(1);
    data.routes.set(routes[0], data.routes.get(routes[1]));
    const events: any[] = []; await registerCampaignEnvironmentAliases(data, event => events.push(event));
    const families = data.selections.get('/local-environment/urban/selection.json').families;
    expect(families[alias.identity]).toBeUndefined(); expect(families['campaign-all04-camiam02']).toBeDefined();
    expect(events.find(event => event.identity === alias.identity).type).toBe('campaign-environment-alias-original');
});
