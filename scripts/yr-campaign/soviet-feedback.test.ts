import { expect, test } from 'bun:test';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { CampaignRuntime } from '../../src/game/campaign/CampaignRuntime';
import { GameMap } from '../../src/game/GameMap';
import { Rules } from '../../src/game/rules/Rules';
import { adaptRetailRules } from '../../src/offline/retailCompatibility';
import { IniFile } from '../../src/data/IniFile';
import { requiredBytes, retailIni } from '../test-support/resources';
import { MoveTask } from '../../src/game/gameobject/task/move/MoveTask';
import { MoveResult, MoveState } from '../../src/game/gameobject/trait/MoveTrait';
import { ObjectPosition } from '../../src/game/gameobject/ObjectPosition';
import { Vector3 } from '../../src/game/math/Vector3';
import { AttackTrait } from '../../src/game/gameobject/trait/AttackTrait';
import { Infantry } from '../../src/engine/renderable/entity/Infantry';
import { SequenceType } from '../../src/game/art/SequenceType';
import { ZoneType } from '../../src/game/gameobject/unit/ZoneType';
import { StanceType } from '../../src/game/gameobject/infantry/StanceType';
import { CampaignTeams } from '../../src/game/campaign/CampaignTeams';
import { airstrikeExitTile } from '../../src/game/gameobject/trait/AirstrikeTrait';
import { EvaSpecs } from '../../src/engine/sound/EvaSpecs';
import { SideType } from '../../src/game/SideType';
import { campaignBriefingFlow } from '../../src/gui/campaign/CampaignBriefingLayout';
import { retailMember } from '../test-support/resources';
import { readFileSync } from 'node:fs';

test('original YR combat houses GDI, Nod and Special are targetable while the civilian house and released policies remain pinned', () => {
    const source = requiredBytes('campaign/yr/sov01umd/sov01umd.map').toString();
    const definition = new CampaignDefinition('yr', 'sov01umd.map', source);
    const rules = new Rules(adaptRetailRules(retailIni('yr')).rules.clone().mergeWith(new IniFile(source)));
    const make = (version: number, edition = 'yr') => {
        const host: any = { definition, launch: { edition, difficulty: 'easy', semanticsVersion: version },
            houses: new Map(), sourceQuirks: [], legacyProductionRatios: new Map(), game: { rules, addPlayer() {} } };
        CampaignRuntime.prototype.createPlayers.call(host, { createCombatant: () => ({}) });
        return host.houses;
    };
    const current = make(46), old = make(45), original = make(46, 'ra2');
    for (const name of ['GDI', 'Nod', 'Special']) {
        expect(current.get(name).isNeutral).toBe(false);
        expect(old.get(name).isNeutral).toBe(true);
        expect(original.get(name).isNeutral).toBe(true);
    }
    expect(current.get('Neutral').isNeutral).toBe(true);
});

test('the reported missing edge cell fails the movement route without moving or deleting the unit', () => {
    const tile = { rx: 161, ry: 104, z: 0, rampType: 0 };
    const tiles: any = { getByMapCoords: (x: number, y: number) => x === 161 && y === 104 ? tile : undefined };
    const occupation: any = { getBridgeOnTile: () => undefined };
    const position = new ObjectPosition(tiles, occupation); position.tile = tile; position.subCell = 1;
    expect(() => position.moveByLeptons(256, 0)).toThrow('Attempted move to a non-existent tile: [162,104]');
    const before = position.worldPosition.clone(); let released = 0;
    const move: any = { isDisabled: () => false, moveState: MoveState.Moving, velocity: new Vector3(16, 0, 0),
        unreservePathNodes: () => released++, locomotor: { tick: () => ({ distance: new Vector3(256, 0, 0), done: false }) } };
    const unit: any = { position, tile, moveTrait: move, traits: [] };
    const task: any = new MoveTask({ map: { tiles } } as any, tile as any, false);
    task.path = [{ tile }];
    expect(task.onTick(unit)).toBe(true);
    expect(position.worldPosition).toEqual(before); expect(released).toBe(1);
    expect(move.lastMoveResult).toBe(MoveResult.Fail); expect(move.moveState).toBe(MoveState.Idle);
    expect(move.velocity.length()).toBe(0);
});

test('world effects require an actual physical tile in addition to the continuous map rectangle', () => {
    const map: any = { mapBounds: { isWithinHardBounds: () => true },
        tiles: { getByMapCoords: (x: number, y: number) => x === 161 && y === 104 ? {} : undefined } };
    expect(GameMap.prototype.isWithinHardBounds.call(map, { x: 161.5 * 256, y: 104.5 * 256 } as any)).toBe(true);
    expect(GameMap.prototype.isWithinHardBounds.call(map, { x: 162.5 * 256, y: 50, z: 104.5 * 256 } as any)).toBe(false);
});

test('an armed hostile garrison remains an automatic target while an empty civilian structure stays protected', () => {
    const target: any = { isBuilding: () => true, rules: { civilian: true, insignificant: true, threatPosed: 0 },
        owner: { isNeutral: false }, neutralTargetOrigin: true, primaryWeapon: {}, garrisonTrait: { isOccupied: () => true } };
    const game: any = { gameOpts: { campaign: { edition: 'yr', semanticsVersion: 46,
        civilianTargetingVersion: 2, neutralStructureTargetingVersion: 1 } } };
    expect(AttackTrait.prototype.canPassiveAcquire.call({}, target, game)).toBe(true);
    target.garrisonTrait.isOccupied = () => false;
    expect(AttackTrait.prototype.canPassiveAcquire.call({}, target, game)).toBe(false);
    target.garrisonTrait.isOccupied = () => true; game.gameOpts.campaign.semanticsVersion = 45;
    expect(AttackTrait.prototype.canPassiveAcquire.call({}, target, game)).toBe(false);
});

test('the original aquatic Bront uses its native walking row and keeps actual swimming rows when present', () => {
    const original = retailIni('yr', 'art').getSection('BrontSequence')!;
    const sequences = new Map(Object.keys(SequenceType).filter(name => isNaN(Number(name)) && original.has(name))
        .map(name => [SequenceType[name as keyof typeof SequenceType], {}]));
    const host: any = { gameObject: { name: 'DNOB', rules: { isHuman: false } }, objectArt: { sequences } };
    expect(Infantry.prototype.findSequenceBy.call(host, ZoneType.Water, StanceType.None, true, false, false))
        .toBe(SequenceType.Walk);
    sequences.set(SequenceType.Swim, {});
    expect(Infantry.prototype.findSequenceBy.call(host, ZoneType.Water, StanceType.None, true, false, false))
        .toBe(SequenceType.Swim);
});

test('water animals retain their bearing instead of entering incompatible ground idle poses', () => {
    const sequences = new Map([[SequenceType.Idle1, {}], [SequenceType.Idle2, {}]]);
    const host: any = { gameObject: { rules: { isHuman: false } } };
    expect(Infantry.prototype.findIdleSequence.call(host, ZoneType.Water, StanceType.None, { sequences })).toBeUndefined();
    sequences.set(SequenceType.WetIdle1, {});
    expect(Infantry.prototype.findIdleSequence.call(host, ZoneType.Water, StanceType.None, { sequences })).toBe(SequenceType.WetIdle1);
    sequences.delete(SequenceType.WetIdle1); host.gameObject.rules.isHuman = true;
    expect([SequenceType.Idle1, SequenceType.Idle2]).toContain(
        Infantry.prototype.findIdleSequence.call(host, ZoneType.Water, StanceType.None, { sequences }));
});

test('completed YR story highlights release their character for the next source team while active guard missions and older journals retain membership', () => {
    const source = requiredBytes('campaign/yr/sov03umd/sov03umd.map').toString();
    const definition = new CampaignDefinition('yr', 'sov03umd.map', source);
    const type = '0879E52C', spec = definition.teams.get(type)!;
    expect(definition.scripts.get(spec.script)!.instructions.at(-1)?.opcode).toBe(50);
    const owner = { isAi: true }, released: any[] = [];
    const host: any = { definition, semanticsVersion: 47, require: () => spec,
        house: () => owner, finish: (team: any) => released.push(team), game: {} };
    const team: any = { type, owner, line: definition.scripts.get(spec.script)!.instructions.length,
        phase: 'active', members: [], tasks: [] };
    (CampaignTeams.prototype as any).tickScript.call(host, team, 100);
    expect(released).toEqual([team]);
    released.length = 0; host.semanticsVersion = 46;
    (CampaignTeams.prototype as any).tickScript.call(host, team, 100);
    expect(team.phase).toBe('holding'); expect(released).toHaveLength(0);
    host.semanticsVersion = 47;
    const guard = { ...spec, script: 'guard' }; host.require = () => guard;
    definition.scripts.set('guard', { id: 'guard', name: 'Native continuing guard', instructions: [
        { section: 'guard', key: '0', opcode: 11, params: ['1'], raw: '11,1' }] });
    team.line = 1; team.phase = 'active';
    (CampaignTeams.prototype as any).tickScript.call(host, team, 100);
    expect(team.phase).toBe('holding'); expect(released).toHaveLength(0);
});

test('new YR Boris strikes return beyond their actual ingress edge while old campaign routes remain exact', () => {
    const entry = { rx: 100, ry: 0 }, target = { rx: 100, ry: 60 }, legacy = { rx: 100, ry: 66 };
    const game: any = { gameOpts: { campaign: { edition: 'yr', semanticsVersion: 47 } },
        map: { tiles: { getPlaceholderTile: (rx: number, ry: number) => ({ rx, ry }) } } };
    expect(airstrikeExitTile(game, entry, target, legacy)).toEqual({ rx: 100, ry: -8 });
    game.gameOpts.campaign.semanticsVersion = 46;
    expect(airstrikeExitTile(game, entry, target, legacy)).toBe(legacy);
    game.gameOpts.campaign = { edition: 'ra2', semanticsVersion: 47 };
    expect(airstrikeExitTile(game, entry, target, legacy)).toBe(legacy);
});

test('every original Soviet campaign speech reference has three localized captions and each loading projection permits wider safe upper lines', () => {
    const eva = new IniFile(retailMember('yr', 'evamd.ini').file.readAsString());
    const specs = new EvaSpecs(SideType.Nod).readIni(eva), dialogs = eva.getSection('DialogList')!;
    const languages = ['en-US', 'zh-CN', 'zh-TW'].map(language => ({ language,
        labels: JSON.parse(readFileSync(`public/res/locale/${language}.json`, 'utf8')) }));
    const names = ['sov01umd', 'sov02smd', 'sov03umd', 'sov04dmd', 'sov05umd', 'sov06lmd', 'sov07tmd'];
    const unique = new Set<string>();
    for (const stem of names) {
        const definition = new CampaignDefinition('yr', stem + '.map', requiredBytes(`campaign/yr/${stem}/${stem}.map`).toString());
        for (const trigger of definition.triggers.values()) for (const action of trigger.actions.filter(a => a.opcode === 21)) {
            const token = action.params[1], id = specs.getSpec(token) ? token : String(dialogs.entries.get(token));
            expect(specs.getSpec(id)?.sound).toBeTruthy(); unique.add(id);
            for (const { language, labels } of languages) {
                const caption = labels[`hd:speech:${id}`.toLowerCase()];
                expect(typeof caption).toBe('string'); expect(caption.length).toBeGreaterThan(1);
                expect(caption).not.toMatch(/[\u0080-\u009f]/);
                if (language !== 'en-US') expect(caption).toMatch(/[\u3400-\u9fff]/);
            }
        }
        const spec = JSON.parse(requiredBytes(`campaign/yr/${stem}/interface-hd.json`).toString());
        const flow = campaignBriefingFlow(spec.loading.layout.projection)!;
        expect(flow.width).toBe(319); expect(flow.shape).toContain('polygon(');
    }
    expect(unique.size).toBe(119);
    expect(campaignBriefingFlow('invalid')).toBeUndefined();
});
