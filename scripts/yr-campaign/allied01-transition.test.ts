import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { IniFile } from '../../src/data/IniFile';
import { Rules } from '../../src/game/rules/Rules';
import { ObjectType } from '../../src/engine/type/ObjectType';
import { Production } from '../../src/game/player/production/Production';
import { SellTrait } from '../../src/game/trait/SellTrait';
import { Terrain } from '../../src/game/map/Terrain';
import { Graph } from '../../src/util/Graph';
import { adaptRetailRules } from '../../src/offline/retailCompatibility';
import { retailIni } from '../test-support/resources';

test('the original Allied01 plan constructs its non-sidebar replacement while human and legacy technology remain pinned', () => {
    const source = new IniFile(readFileSync('.local/campaign/yr/all01umd/all01umd.map', 'utf8'));
    const rules = new Rules(adaptRetailRules(retailIni('yr')).rules.clone().mergeWith(source));
    const replacement = rules.getBuilding('YAPPPT');
    expect(source.getSection('Confederation')!.getString('000')).toBe('YAPPPT,46,69');
    expect([replacement.techLevel, replacement.cost, replacement.prerequisite]).toEqual([-1, 0, []]);
    const player: any = { isAi: true, campaignSemanticsVersion: 40, country: { name: 'Confederation' } };
    const host: any = { player, gameOpts: { superWeapons: true, campaign: { edition: 'yr', semanticsVersion: 40 } },
        maxTechLevel: 2, hasSecretProduction: () => false, hasFactoryFor: () => true,
        meetsPrerequisites: () => false, meetsStolenTech: () => true };
    const available = (node = true) => Production.prototype.isAvailableForProduction.call(host, replacement, node);
    expect(available()).toBe(true); expect(available(false)).toBe(false);
    player.isAi = false; expect(available()).toBe(false); player.isAi = true;
    host.hasFactoryFor = () => false; expect(available()).toBe(false); host.hasFactoryFor = () => true;
    for (const [edition, version] of [['yr', 39], ['ra2', 40], ['skirmish', 40]] as const) {
        host.gameOpts.campaign = { edition, semanticsVersion: version }; expect(available()).toBe(false);
    }
    expect(replacement.type).toBe(ObjectType.Building);
    expect(source.getSection('YAPPET')!.getNumber('Cost')).toBe(0);
});

test('zero-cost original buildings complete sale and dispatch its event without granting a refund', () => {
    const owner = { credits: 123 }, calls: string[] = [];
    const target: any = { owner, rules: { cost: 0, unsellable: false }, isBuilding: () => true,
        traits: { filter: () => [] }, dispose: () => calls.push('disposed') };
    const game: any = { gameOpts: { campaign: { edition: 'yr', semanticsVersion: 40 } },
        getConstructionWorker: () => ({ unplace: (_target: any, done: () => void) => { calls.push('unplaced'); done(); } }),
        events: { dispatch: () => calls.push('sold') } };
    const sell = new SellTrait(game, { refundPercent: .5 });
    sell.sell(target); expect(calls).toEqual(['unplaced', 'sold', 'disposed']); expect(owner.credits).toBe(123);
    calls.length = 0; target.rules.unsellable = true; sell.sell(target); expect(calls).toEqual([]);
    target.rules.unsellable = false;
    for (const [edition, version] of [['yr', 39], ['ra2', 40], ['skirmish', 40]] as const) {
        game.gameOpts.campaign = { edition, semanticsVersion: version }; sell.sell(target); expect(calls).toEqual([]);
    }
});

test('a subcell path at the physical map edge uses existing cells without cutting through an absent corner', () => {
    const a = { id: 'a', rx: 157, ry: 93 }, b = { id: 'b', rx: 156, ry: 92 }, c = { id: 'c', rx: 156, ry: 93 };
    const cells = [a, b, c], graph = new Graph<any>();
    const nodes = cells.map(tile => graph.addNode(tile.id, { tile, islandId: 1 }));
    nodes[0].addLink(nodes[1]); nodes[0].addLink(nodes[2]); nodes[2].addLink(nodes[1]);
    const terrain: any = Object.create(Terrain.prototype);
    Object.assign(terrain, { tiles: { getByMapCoords: (x: number, y: number) => cells.find(cell => cell.rx === x && cell.ry === y) },
        exactIslandGraphs: new WeakSet(), computePassabilityGraph: () => graph, getIslandIdMap: () => ({ get: () => 1 }) });
    const path = (avoidMissingCorners: boolean) => terrain.computePath(0, true, a, false, b, false,
        { avoidMissingCorners, bestEffort: false }).map((node: any) => node.tile.id);
    expect(path(false)).toEqual(['b', 'a']); expect(path(true)).toEqual(['b', 'c', 'a']);
    nodes[0].removeLink(nodes[2]); expect(path(true)).toEqual([]);
    expect(path(false)).toEqual(['b', 'a']);
});
