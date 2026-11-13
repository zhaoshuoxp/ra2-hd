import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { CampaignTeams } from '../../src/game/campaign/CampaignTeams';
import { Rules } from '../../src/game/rules/Rules';
import { WarpedOutTrait } from '../../src/game/gameobject/trait/WarpedOutTrait';
import { NotifyTick } from '../../src/game/gameobject/trait/interface/NotifyTick';
import { adaptRetailRules } from '../../src/offline/retailCompatibility';
import { retailIni } from '../test-support/resources';

test('YR44 uses the original General WarpIn for the real Allied07 MCV and keeps its 180-tick phase', () => {
    const bytes = readFileSync('.local/campaign/yr/all07smd/all07smd.map');
    const source = new CampaignDefinition('yr', 'all07smd.map', bytes.toString(), undefined,
        { semanticsVersion: 44, sourceSha256: createHash('sha256').update(bytes).digest('hex') });
    const rules = new Rules(adaptRetailRules(retailIni('yr')).rules.mergeWith(source.ini));
    expect(rules.getIni().getSection('General')!.getString('WarpIn')).toBe('WARPIN');
    expect(rules.getIni().getSection('AudioVisual')?.getString('WarpIn')).toBeFalsy();
    expect(rules.getIni().getSection('General')!.getNumber('ChronoReinfDelay')).toBe(180);
    expect(rules.animationNames.has('WARPIN')).toBe(true);
    const spec = source.teams.get('0964C97C')!;
    expect(source.taskForces.get(spec.taskForce)!.units).toEqual([{ count: 1, type: 'AMCV' }]);
    for (const [edition, version] of [['yr', 43], ['ra2', 44], ['yr', 44]] as const) {
        const effects: any[] = [], scripts: number[] = [], owner = { name: 'Americans' };
        const tile = { rx: 88, ry: 125 }, rule = { name: 'AMCV', size: 1 };
        const game: any = { currentTick: 500, map: { getTileAtWaypoint: () => tile }, rules,
            gameOpts: { campaign: { edition, semanticsVersion: version } },
            campaign: { restoring: false, noteSourceTeamTag() {} },
            traits: { filter: () => [] }, events: { dispatch: (event: any) => effects.push(event) } };
        const unit: any = { id: 1, name: 'AMCV', owner, tile, rules: rule, isSpawned: true,
            isInfantry: () => false, position: {}, traits: { filter: () => [] },
            unitOrderTrait: { clearOrders() {}, cancelAllTasks() {} } };
        unit.warpedOutTrait = new WarpedOutTrait(unit);
        game.world = { getAllObjects: () => [] };
        const manager: any = new CampaignTeams(source, game, () => owner, () => {}, version);
        manager.rules = () => rule; manager.spawn = () => unit;
        manager.sourceAi.update = () => {}; manager.tickScript = (_team: any, tick: number) => scripts.push(tick);
        const create = () => manager.create(spec.id, true, 0, undefined, undefined, true);
        if (edition !== 'yr' || version < 44) {
            expect(create).toThrow('Original chrono arrival animation is missing');
            continue;
        }
        const team = create();
        expect(team.phase).toBe('phasing'); expect(team.waitUntil).toBe(680);
        expect(unit.warpedOutTrait.isActive()).toBe(true);
        expect(effects.map(event => event.name).filter(Boolean)).toEqual(['WARPIN']);
        for (game.currentTick = 501; game.currentTick < 680; game.currentTick++) {
            unit.warpedOutTrait[NotifyTick.onTick](unit, game); manager.update(game.currentTick);
        }
        expect(scripts).toEqual([]);
        unit.warpedOutTrait[NotifyTick.onTick](unit, game); manager.update(680);
        expect(unit.warpedOutTrait.isActive()).toBe(false); expect(team.phase).toBe('active');
        expect(scripts).toEqual([680]);
    }
});
