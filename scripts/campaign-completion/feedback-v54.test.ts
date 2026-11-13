import { expect, test } from 'bun:test';
import { findSequence } from '../../src/game/gameobject/infantry/sequenceMap';
import { StanceType } from '../../src/game/gameobject/infantry/StanceType';
import { ZoneType } from '../../src/game/gameobject/unit/ZoneType';
import { SequenceType } from '../../src/game/art/SequenceType';
import { WorldAnimationClock } from '../../src/engine/WorldAnimationClock';
import { Animation } from '../../src/engine/Animation';
import { AttackTrait } from '../../src/game/gameobject/trait/AttackTrait';
import { CampaignAi, campaignOpeningGrace } from '../../src/game/campaign/CampaignAi';
import { recoverSourceBaseActivation } from '../../src/game/campaign/CampaignBaseActivation';
import { CampaignTriggerMachine } from '../../src/game/campaign/CampaignTriggerMachine';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { parseMix } from '../../src/offline/retail';
import { requiredBytes } from '../test-support/resources';
import { ParasiteableTrait } from '../../src/game/gameobject/trait/ParasiteableTrait';
import { NotifyTick } from '../../src/game/gameobject/trait/interface/NotifyTick';
import { ROCKING_TICKS } from '../../src/game/gameobject/Vehicle';

const original = new CampaignDefinition('ra2', 'all10s.map', new TextDecoder().decode(
    parseMix(requiredBytes('assets/ra2/maps01.mix')).openFile('all10s.map').getBytes()));

test('airborne SEALs retain their parachute over water and select wet animation only after landing', () => {
    const sequences = [SequenceType.Paradrop, SequenceType.Swim, SequenceType.Tread, SequenceType.Ready];
    for (const moving of [false, true]) {
        expect(findSequence(ZoneType.Water, StanceType.Paradrop, moving, false, false, sequences)).toBe(SequenceType.Paradrop);
        expect(findSequence(ZoneType.Ground, StanceType.Paradrop, moving, false, false, sequences)).toBe(SequenceType.Paradrop);
    }
    expect(findSequence(ZoneType.Water, StanceType.None, true, false, false, sequences)).toBe(SequenceType.Swim);
    expect(findSequence(ZoneType.Water, StanceType.None, false, false, false, sequences)).toBe(SequenceType.Tread);
});

test('a cinematic pause freezes actual animation frames and resumes without consuming the movie interval', () => {
    const clock = new WorldAnimationClock(), animation = new Animation({ start: 0, end: 100, loopStart: 0,
        loopEnd: 100, loopCount: -1, rate: 10, reverse: false } as any, { value: 1 } as any);
    animation.start(clock.update(1000, false)); animation.update(clock.update(1300, false));
    const frame = animation.getCurrentFrame(); expect(frame).toBe(3);
    for (const timestamp of [1400, 5000, 30000]) animation.update(clock.update(timestamp, true));
    expect(animation.getCurrentFrame()).toBe(frame);
    animation.update(clock.update(30100, false)); expect(animation.getCurrentFrame()).toBe(frame + 1);
});

test('hostile scenario civilians remain targetable when unarmed or insignificant; neutral passersby and old policies stay pinned', () => {
    const unit: any = { name: 'CIV1', owner: { isNeutral: false }, rules: { civilian: true, insignificant: true,
        threatPosed: 0 }, isBuilding: () => false };
    const acquire = (version?: number) => AttackTrait.prototype.canPassiveAcquire(unit,
        { gameOpts: { campaign: { civilianTargetingVersion: version } }, rules: { general: { paradrop: {} } } });
    expect(acquire()).toBe(false); expect(acquire(1)).toBe(false); expect(acquire(2)).toBe(true);
    unit.owner.isNeutral = true; expect(acquire(2)).toBe(false);
});

test('fresh finale grace is ninety, sixty or thirty seconds and leaves legacy launches exact', () => {
    expect(campaignOpeningGrace({ difficulty: 'normal' })).toBe(0);
    for (const [difficulty, seconds] of [['easy', 90], ['normal', 60], ['hard', 30]] as const)
        expect(campaignOpeningGrace({ openingGraceVersion: 1, difficulty })).toBe(seconds * 15);
});

test('finale grace holds the first ready attack without rescheduling source AI selection or defense', () => {
    const owner = { name: 'AI', isAi: true }, created: number[] = [], trigger = { id: 'T', team: 'TEAM' };
    const host: any = { production: new Set(), aiEnabled: new Set(),
        create: () => created.push(tick), finish() {} };
    let tick = 4000;
    const ai: any = Object.assign(Object.create(CampaignAi.prototype), {
        definition: { houses: new Map([['AI', { id: 'AI' }]]), aiTriggers: new Map([['T', trigger]]),
            ini: { getSection: () => ({ getNumber: () => 100 }) } },
        house: () => owner, host, game: { gameOpts: { campaign: { difficulty: 'normal', openingGraceVersion: 1 } },
            generateRandomInt: () => 1 }, next: new Map(), openingReady: new Map(), weights: new Map([['T', 5000]]),
        outcomes: new Map(), enemies: new Map(), anger: new Map(), trace: [],
        listValue: (key: string) => key === 'TeamDelays' ? 100 : 10, ownedTeams: () => [],
        eligible: () => true, belowMaximum: () => true,
    });
    ai.update(tick); expect(created).toEqual([]);
    host.production.add(owner); host.aiEnabled.add(owner);
    tick = 5000; ai.update(tick); expect(created).toEqual([5000]);
    expect(ai.snapshot().openingReady).toBeUndefined();
    expect(ai.openingAttackDeadline(owner, 5400)).toBe(6300);
    expect(ai.openingAttackDeadline(owner, 5500)).toBe(6300);
    expect(ai.snapshot().openingReady).toEqual([['AI', 6300]]);
    tick = 5100; ai.update(tick); expect(created).toEqual([5000, 5100]);
});

test('late original MCV activation retains its source timer/actions after parallel cleanup; early starts do not repeat', () => {
    const starts = ['08DC9190', '08DC95C0', '08DCA960'], enables = ['0A46D390', '0A468930', '0A4685D0'];
    const fallbacks = ['0AD3822C', '0AD3EBBC', '0AD3E9AC'];
    for (const deployments of [[3000, 3100, 3200], [3431, 3603, 3389]]) {
        const production: string[] = [], owners = [1, 2, 3].map(n => ({ name: `BadGuy${n} House`, defeated: false,
            buildings: new Set([{ isSpawned: true, isDestroyed: false, rules: { constructionYard: true } }]) }));
        const house = (key: string | number) => owners[typeof key === 'number' ? key - 15 : Number(key.match(/\d/)?.[0]) - 1];
        const machine = new CampaignTriggerMachine(original, 'normal', { targets: () => ['original-placeholder'], randomInt: () => 0,
            condition: (_, trigger) => enables.includes(trigger.id) && machine.tick >= deployments[enables.indexOf(trigger.id)],
            action: action => { if (action.opcode === 3) production.push(action.params[1]); } }, 15, false, 24);
        for (const id of machine.states.keys()) machine.setEnabled(id, enables.includes(id) || fallbacks.includes(id));
        const recovered: string[] = [];
        for (let tick = 0; tick < 5000; tick++) {
            recovered.push(...recoverSourceBaseActivation(original, machine, house)); machine.update();
        }
        expect(production.sort()).toEqual(['15', '16', '17']);
        expect(starts.map(id => machine.states.get(id)!.fired)).toEqual([1, 1, 1]);
        expect(recovered.length).toBe(deployments[0] === 3000 ? 0 : 3);
    }
});

test('neutral-origin and technology buildings stay excluded from unsolicited acquisition after occupation', () => {
    const unit: any = { name: 'CAOUTP', neutralTargetOrigin: true, owner: { isNeutral: false },
        rules: { needsEngineer: true, civilian: false, insignificant: false, threatPosed: 40, techLevel: -1, owner: [] },
        isBuilding: () => true };
    const game: any = { gameOpts: { neutralStructureTargetingVersion: 1 }, rules: { general: { paradrop: {} } } };
    expect(AttackTrait.prototype.canPassiveAcquire(unit, game)).toBe(false);
    unit.owner.isNeutral = true; expect(AttackTrait.prototype.canPassiveAcquire(unit, game)).toBe(false);
    unit.owner.isNeutral = false; game.gameOpts = { campaign: { neutralStructureTargetingVersion: 1 } };
    expect(AttackTrait.prototype.canPassiveAcquire(unit, game)).toBe(false);
    game.gameOpts = {}; expect(AttackTrait.prototype.canPassiveAcquire(unit, game)).toBe(true);
    unit.name = 'NACNST'; unit.neutralTargetOrigin = false;
    Object.assign(unit.rules, { needsEngineer: false, techLevel: 10, owner: ['Russians'] });
    game.gameOpts = { neutralStructureTargetingVersion: 1 };
    expect(AttackTrait.prototype.canPassiveAcquire(unit, game)).toBe(true);
});

test('organic parasite damage waits for each complete rocking cycle; legacy and mechanical cadence remain pinned', () => {
    const run = (version?: number, organic = true) => {
        const ticks: number[] = [], game: any = { currentTick: 0, gameOpts: { parasiteCadenceVersion: version } };
        const target: any = { isDestroyed: false, isCrashing: false, isVehicle: () => false };
        const parasite = { rules: { organic }, owner: {} }, weapon = { rules: { damage: 15 }, getCooldownTicks: () => 10,
            warhead: { rules: {}, computeDamage: (damage: number) => damage,
                inflictDamage: () => ticks.push(game.currentTick) } };
        const trait = new ParasiteableTrait(target); trait.infest(parasite, weapon, game);
        for (; game.currentTick < 80; game.currentTick++) trait[NotifyTick.onTick](target, game);
        return ticks;
    };
    expect(run(1)).toEqual([ROCKING_TICKS + 2, 2 * (ROCKING_TICKS + 2) + 1]);
    expect(run()).toHaveLength(80);
    expect(run(1, false)).toEqual([0, 11, 22, 33, 44, 55, 66, 77]);
});

test('neutral-structure protection permits damage retaliation and long-range attribution can provoke a bounded response', () => {
    const defender: any = { rules: { canRetaliate: true }, primaryWeapon: {}, sight: 6,
        isBuilding: () => false, unitOrderTrait: { hasTasks: () => false } };
    const target: any = { neutralTargetOrigin: true, rules: { needsEngineer: true }, primaryWeapon: { range: 10 },
        isBuilding: () => true, isInfantry: () => false, isVehicle: () => false };
    const game: any = { gameOpts: { campaign: { neutralStructureTargetingVersion: 1, retaliationVersion: 1 } },
        areFriendly: () => false, isValidTarget: () => true };
    const trait: any = { selectWeaponVersus: () => ({ range: 5 }), rangeHelper: { tileDistance: () => 8 } };
    const hit = { rules: {} };
    expect(AttackTrait.prototype.shouldRetaliate.call(trait, defender, game, 10, target, hit)).toBe(true);
    game.gameOpts.campaign.retaliationVersion = undefined;
    expect(AttackTrait.prototype.shouldRetaliate.call(trait, defender, game, 10, target, hit)).toBe(false);
    trait.rangeHelper.tileDistance = () => 4;
    expect(AttackTrait.prototype.shouldRetaliate.call(trait, defender, game, 10, target, hit)).toBe(true);
});
