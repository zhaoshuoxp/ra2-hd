import { expect, test } from 'bun:test';
import { campaignUnitHdDemand, environmentMapDemand, prewarmCampaignUnits } from '../../src/engine/renderable/builder/environmentMapDemand';
import { UnitHdDemand } from '../../src/engine/renderable/builder/UnitHdDemand';

function fixture(paradrop = 'no') {
    const objects = [{ name: 'CAWA2A' }];
    const game: any = { getWorld: () => ({ getAllObjects: () => objects }), map: { tiles: { getAll: () => [] } },
        rules: { getIni: () => ({ getSection: () => undefined }), general: { paradrop: { paradropPlane: 'PDPLANE' } } },
        campaign: { definition: { taskForces: new Map([['later', { units: [{ type: 'CIVBBP' }, { type: 'E2' }, { type: 'CIVBBP' }] }]]),
            teams: new Map([['transport', { properties: { Droppod: paradrop } }]]) } } };
    return { game, objects };
}

test('campaign arrival assets are demanded before their original scripted spawn', () => {
    const { game, objects } = fixture();
    expect([...environmentMapDemand(game, {})].sort()).toEqual(['CAWA2A', 'CIVBBP', 'E2']);
    expect(objects).toEqual([{ name: 'CAWA2A' }]);
});

test('implicit paradrop aircraft follow the original rule and team declaration', () => {
    for (const value of ['yes', 'YES', 'true', '1']) {
        const { game } = fixture(value); game.rules.general.paradrop.paradropPlane = 'CUSTOM_PLANE';
        expect([...campaignUnitHdDemand(game)].sort()).toEqual(['CIVBBP', 'CUSTOM_PLANE', 'E2']);
    }
    expect(campaignUnitHdDemand(fixture().game).has('PDPLANE')).toBe(false);
});

test('ordinary skirmishes keep their initial demand without reserving campaign families', () => {
    const { game } = fixture('yes'); delete game.campaign;
    expect([...campaignUnitHdDemand(game)]).toEqual([]);
    expect([...environmentMapDemand(game, {})]).toEqual(['CAWA2A']);
});

test('new campaign predictions yield their cache priority while actual units retain first-render leases', () => {
    for (const version of [21, 22]) {
        const { game, objects } = fixture();
        game.campaign.launch = { semanticsVersion: version };
        objects.splice(0, 1, { name: 'E2', isUnit: () => true } as any);
        const calls: string[] = [], retained: (() => void)[] = [];
        prewarmCampaignUnits(game, { prewarm: name => { calls.push('live:' + name); return () => {}; },
            prefetch: name => { calls.push('future:' + name); return () => {}; } }, release => retained.push(release));
        expect(calls).toEqual(['live:E2', (version === 22 ? 'future:' : 'live:') + 'CIVBBP']);
        expect(retained).toHaveLength(2);
    }
});

test('skirmish warmup and an older demand provider retain the existing actual-unit path', () => {
    const { game, objects } = fixture();
    objects.splice(0, 1, { name: 'E2', isUnit: () => true } as any); delete game.campaign;
    const calls: string[] = [];
    prewarmCampaignUnits(game, { prewarm: name => { calls.push(name); return () => {}; } }, () => {});
    expect(calls).toEqual(['E2']);
});

test('new campaign startup caches yield to a real late family within the unchanged allocation', async () => {
    for (const version of [24, 25]) {
        const { game, objects } = fixture();
        game.campaign.launch = { semanticsVersion: version };
        objects.splice(0, 1, { name: 'E2', isUnit: () => true } as any);
        const retained: (() => void)[] = [], released: string[] = [];
        const image = { filename: 'SREF' }, family = (name: string) => ({ members: new Map([[name,
            { image, override: { identity: name, frames: [], pages: [] } }]]) });
        const demand = new UnitHdDemand(new Set(['E2', 'CIVBBP', 'SREF']), 8, async (name, budget) => budget >= 8
            ? { ...family(name), density: 4, gpuBytes: 8, attempts: [] }
            : { members: new Map(), density: 1, gpuBytes: 0, attempts: [{ reason: 'combined-budget' }] },
            value => released.push([...value.members.keys()][0]));
        prewarmCampaignUnits(game, { prewarm: name => demand.prewarm(name), prefetch: name => demand.preview(name) },
            release => retained.push(release));
        await demand.idle();
        let shown: string | undefined;
        const leave = demand.bind('SREF', image, value => { shown = value?.identity; });
        await demand.idle();
        if (version === 25) {
            expect(shown).toBe('SREF'); expect(demand.report.families.SREF.density).toBe(4);
            expect(released).toEqual(['E2']);
            demand.preview('E2'); await demand.idle();
            expect(shown).toBe('SREF'); expect(released).toEqual(['E2']);
        } else {
            expect(shown).toBeUndefined(); expect(demand.report.families.SREF.status).toBe('BUDGET_FALLBACK');
            expect(released).toEqual([]);
        }
        expect(demand.report.peakBytes).toBeLessThanOrEqual(8);
        leave(); retained.forEach(release => release()); demand.dispose(); await demand.idle();
        expect(demand.report.gpuBytes).toBe(0);
    }
});
