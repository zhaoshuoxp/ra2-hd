import { expect, test } from 'bun:test';
import { IniFile } from '../../src/data/IniFile';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { originalCampaignAiSha256, verifyOriginalCampaignAi } from '../../src/data/campaign/CampaignAiLibrary';
import { CampaignAi } from '../../src/game/campaign/CampaignAi';
import { CampaignTeams } from '../../src/game/campaign/CampaignTeams';
import { SuperWeaponStatus } from '../../src/game/SuperWeapon';
import { SuperWeaponType } from '../../src/game/type/SuperWeaponType';
import { retailMember } from '../test-support/resources';

const condition = '0000000003000000' + '0'.repeat(48);
function fixture() {
    const global = new IniFile('[TeamTypes]\n0=T\n[ScriptTypes]\n0=S\n[TaskForces]\n0=F\n'
        + '[T]\nHouse=<none>\nScript=S\nTaskForce=F\nMax=2\nIsBaseDefense=no\n[S]\n0=49,0\n[F]\n0=1,E1\n'
        + `[AITriggerTypes]\nA=Attack,T,<all>,99,-1,<none>,${condition},50,1,100,1,0,1,0,<none>,1,1,1\n`);
    const ini = new IniFile('[Basic]\nPlayer=P\n[Houses]\n0=P\n1=C\n[P]\nCountry=P\nPlayerControl=yes\n'
        + '[C]\nCountry=C\nRatioAITriggerTeam=100\n');
    const definition = new CampaignDefinition('ra2', 'global-ai-runtime-fixture.map', ini.toString(), global);
    const objects: any[] = [], enemyObjects: any[] = [], neutralObjects: any[] = [], weapons: any[] = [];
    let available = true;
    const owner: any = { name: 'C', isAi: true, campaignTechLevel: 5, country: { side: 0 },
        getOwnedObjects: () => objects, production: { isAvailableForProduction: () => available },
        superWeaponsTrait: { getAll: () => weapons } };
    const enemy: any = { name: 'P', isAi: false, credits: 1000, getOwnedObjects: () => enemyObjects,
        powerTrait: { debugGetState: () => ({ power: 200, drain: 150 }) } };
    enemyObjects.push({ name: 'E2', isUnit: () => true, isSpawned: true });
    const neutral = { name: 'Neutral', isNeutral: true, getOwnedObjects: () => neutralObjects };
    const general = new IniFile('[General]\nTeamDelays=3,7,5\nTotalAITeamCap=2,3,4\nMinimumAIDefensiveTeams=0,0,0\n'
        + 'MaximumAIDefensiveTeams=1,1,1\nUseMinDefenseRule=no\nAIMinorSuperReadyPercent=.7\n'
        + 'AITriggerSuccessWeightDelta=20\nAITriggerFailureWeightDelta=-50\nAITriggerTrackRecordCoefficient=2\n');
    const types: any = { E1: { name: 'E1', techLevel: 1 }, E2: { name: 'E2', techLevel: 6 } };
    const rolls: any[] = [], created: any[] = [];
    const game: any = { gameOpts: { campaign: { difficulty: 'normal' } },
        rules: { getIni: () => general, hasObject: (name: string) => !!types[name], getObject: (name: string) => types[name] },
        getAllPlayers: () => [enemy, owner, neutral], alliances: { areAllied: () => false },
        generateRandomInt: (a: number, b: number) => { rolls.push([a, b]); return a; } };
    const host: any = { instances: new Map(), aiEnabled: new Set([owner]), production: new Set([owner]),
        create: (...args: any[]) => { created.push(args); }, finish: (team: any) => { team.phase = 'finished'; } };
    const ai = new CampaignAi(definition, game, id => id === 'C' ? owner : enemy, host);
    return { ai, definition, owner, enemy, objects, enemyObjects, neutralObjects, weapons, types, game, host, rolls, created,
        trigger: definition.aiTriggers.get('A')!, setAvailable: (value: boolean) => { available = value; } };
}

test('interpreter 6 verifies the imported original AI content and refuses modified or unidentified libraries', async () => {
    const original = new IniFile(retailMember('ra2', 'ai.ini', originalCampaignAiSha256).file.readAsString());
    await verifyOriginalCampaignAi(original, originalCampaignAiSha256);
    await expect(verifyOriginalCampaignAi(original)).rejects.toThrow('source identity');
    original.getSection('0CAC7C2C-G')!.set('Max', '99');
    await expect(verifyOriginalCampaignAi(original, originalCampaignAiSha256)).rejects.toThrow('differs');
});

test('global triggers require an actual enemy, source side, difficulty, computed member technology and production or a real recruit', () => {
    const f = fixture();
    expect(f.ai.eligible(f.trigger, f.owner)).toBe(false);
    f.ai.declareEnemy(f.owner, f.enemy); expect(f.ai.eligible(f.trigger, f.owner)).toBe(true);
    expect(f.trigger.techLevel).toBe(99); expect(f.ai.effectiveTechLevel(f.trigger)).toBe(1);
    f.trigger.side = 2; expect(f.ai.eligible(f.trigger, f.owner)).toBe(false); f.trigger.side = 1;
    f.trigger.house = '<none>'; expect(f.ai.eligible(f.trigger, f.owner)).toBe(false); f.trigger.house = '<all>';
    f.trigger.house = 'British'; expect(f.ai.eligible(f.trigger, f.owner)).toBe(false); f.trigger.house = '<all>';
    f.trigger.difficulties.normal = false; expect(f.ai.eligible(f.trigger, f.owner)).toBe(false); f.trigger.difficulties.normal = true;
    f.types.E1.techLevel = 6; expect(f.ai.eligible(f.trigger, f.owner)).toBe(false); f.types.E1.techLevel = 1;
    f.setAvailable(false); expect(f.ai.eligible(f.trigger, f.owner)).toBe(false);
    const recruit = { name: 'E1', isSpawned: true, isUnit: () => true, isDestroyed: false };
    f.objects.push(recruit); expect(f.ai.eligible(f.trigger, f.owner)).toBe(true);
    recruit.isDestroyed = true; expect(f.ai.eligible(f.trigger, f.owner)).toBe(false);
    f.trigger.secondTeam = 'T'; f.definition.taskForces.get('F')!.units.push({ type: 'E2', count: 1 });
    expect(f.ai.effectiveTechLevel(f.trigger)).toBe(6);
});

test('AI conditions preserve no-condition, single enemy, own and neutral counts, power thresholds, credits and charged owner superweapons', () => {
    const f = fixture(); f.ai.declareEnemy(f.owner, f.enemy); f.trigger.object = 'E2'; f.trigger.count = 1; f.trigger.comparison = 2;
    for (const [condition, expected] of [[-1, true], [0, true], [1, false], [2, true], [3, false], [4, false], [5, false], [6, false], [7, false]] as const) {
        f.trigger.condition = condition; expect(f.ai.condition(f.trigger, f.owner)).toBe(expected);
    }
    f.neutralObjects.push({ name: 'E2' }); f.trigger.condition = 7; expect(f.ai.condition(f.trigger, f.owner)).toBe(true);
    f.trigger.condition = 4; f.trigger.count = 1000; expect(f.ai.condition(f.trigger, f.owner)).toBe(true);
    const weapon = { rules: { type: SuperWeaponType.IronCurtain }, status: SuperWeaponStatus.Charging, getChargeProgress: () => .7 };
    f.weapons.push(weapon); f.trigger.condition = 5; expect(f.ai.condition(f.trigger, f.owner)).toBe(true);
    weapon.status = SuperWeaponStatus.Paused; expect(f.ai.condition(f.trigger, f.owner)).toBe(false);
    f.trigger.condition = 99; expect(() => f.ai.condition(f.trigger, f.owner)).toThrow('Unsupported');
});

test('the source team pass honors nonmonotonic difficulty delays, switches, exclusive 5000 weights and contextual ownership', () => {
    for (const [difficulty, delay] of [['hard', 3], ['normal', 7], ['easy', 5]] as const) {
        const f = fixture(); f.game.gameOpts.campaign.difficulty = difficulty; f.ai.declareEnemy(f.owner, f.enemy);
        const urgent = { ...f.trigger, id: 'B', weight: 5000 };
        f.definition.aiTriggers.set('B', urgent);
        // Recreate after adding the original record so its initial weight is read.
        const ai = new CampaignAi(f.definition, f.game, id => id === 'C' ? f.owner : f.enemy, f.host);
        ai.declareEnemy(f.owner, f.enemy);
        ai.update(delay + 174); expect(f.rolls).toEqual([]);
        ai.update(delay + 175); expect(f.rolls).toEqual([[1, 100], [1, 5000]]);
        expect(f.created[0]).toEqual(['T', false, undefined, 'B', f.owner]);
        f.host.aiEnabled.clear(); ai.update(delay * 2 + 175);
        expect(f.created.length).toBe(1); expect(f.rolls.at(-1)).toEqual([1, 100]);
    }
});

test('team caps, assembling draws and shared success history survive deterministic snapshots', () => {
    const f = fixture(); f.ai.declareEnemy(f.owner, f.enemy);
    f.host.instances.set(1, { id: 1, type: 'T', owner: f.owner, phase: 'assembling' });
    f.ai.update(182); expect(f.created).toEqual([]);
    f.host.instances.set(2, { id: 2, type: 'T', owner: f.owner, phase: 'holding' });
    expect(f.ai.eligible(f.trigger, f.owner)).toBe(false);
    f.ai.recordOutcome({ type: 'T', success: true } as any);
    f.ai.recordOutcome({ type: 'T', success: true } as any);
    expect(f.ai.snapshot()).toMatchObject({ outcomes: [['A', { runs: 2, successes: 2 }]], weights: [['A', 90.5]] });
    expect(JSON.stringify(f.ai.snapshot())).toContain('"C","P"');
});

test('script 43 waits for full physical transports and script 58 selects only the requested friendly building', () => {
    const f = fixture(), manager: any = new CampaignTeams(f.definition, { map: {}, ...f.game }, () => f.owner, () => {}, 6);
    f.definition.scripts.get('S')!.instructions = [{ section: 'S', key: '0', index: 0, opcode: 43, params: ['0'], raw: '43,0' }];
    let capacity = 1;
    const unit: any = { isSpawned: true, transportTrait: { getAvailableCapacity: () => capacity }, unitOrderTrait: { hasTasks: () => false } };
    const team: any = { type: 'T', members: [unit], owner: f.owner, line: 0, started: false, tasks: [] };
    manager.tickScript(team, 1); expect(team.line).toBe(0); capacity = 0;
    manager.tickScript(team, 2); expect(team.line).toBe(1);
    const building = (id: number, owner: any) => ({ id, owner, tile: { rx: id, ry: 0 }, isSpawned: true,
        rules: { index: 1 }, isTechno: () => true, isBuilding: () => true });
    const own = building(2, f.owner), hostile = building(1, f.enemy);
    manager.game.world = { getAllObjects: () => [hostile, own] }; manager.game.isValidTarget = () => true;
    unit.tile = { rx: 0, ry: 0 } as any;
    expect(manager.findTarget(team, 58, 131073)).toBe(own); expect(manager.findTarget(team, 46, 131073)).toBe(hostile);
    expect(manager.findTarget(team, 0, 0)).toBeUndefined();
});

test('source AI fleets search beyond a fixed sixteen-cell land patch and retain a blocked gather order for retry', () => {
    const f = fixture(), tiles = { getByMapCoords: (rx: number, ry: number) => rx >= 0 && ry >= 0 && rx < 40 && ry < 40 ? { rx, ry } : undefined };
    const base = { owner: f.owner, tile: { rx: 1, ry: 1 }, isBuilding: () => true, isSpawned: true };
    let passable = true;
    f.game.world = { getAllObjects: () => [base] };
    f.game.map = { tiles, mapBounds: { getFullSize: () => ({ width: 40, height: 40 }) }, getGroundObjectsOnTile: () => [],
        terrain: { getPassableSpeed: (tile: any) => Number(passable && tile.rx === 30 && tile.ry === 30) } };
    const manager: any = new CampaignTeams(f.definition, f.game, () => f.owner, () => {}, 6);
    const unit = { isSpawned: true, tile: { rx: 1, ry: 1 }, rules: {}, isInfantry: () => false };
    const team: any = { type: 'T', owner: f.owner, members: [unit], line: 0, started: false, tasks: [] };
    expect(manager.gatherTile(team, false)).toEqual({ rx: 30, ry: 30 });
    passable = false; expect(manager.gatherTile(team, false)).toBeUndefined();
    f.definition.scripts.get('S')!.instructions = [{ section: 'S', key: '0', index: 0, opcode: 54, params: ['0'], raw: '54,0' }];
    manager.tickScript(team, 1); expect(team.line).toBe(0); expect(team.started).toBe(false);
});

test('original superweapon scripts wait above the source readiness threshold and activate ordinary effects only when ready', () => {
    const f = fixture(), calls: any[] = [], tile = { rx: 2, ry: 3 };
    const weapon: any = { rules: { type: SuperWeaponType.IronCurtain }, status: SuperWeaponStatus.Charging, getChargeProgress: () => .8 };
    f.weapons.push(weapon);
    f.game.map = { tiles: { getByMapCoords: () => tile } };
    f.game.traits = { get: () => ({ activateSuperWeapon: (...args: any[]) => calls.push(args) }) };
    const manager: any = new CampaignTeams(f.definition, f.game, () => f.owner, () => {}, 6);
    const team: any = { type: 'T', owner: f.owner, members: [{ isSpawned: true, tile }] };
    expect(manager.callSuperWeapon(team, 55, 0)).toBe(false); expect(calls).toEqual([]);
    weapon.status = SuperWeaponStatus.Ready;
    expect(manager.callSuperWeapon(team, 55, 0)).toBe(true);
    expect(calls).toEqual([[SuperWeaponType.IronCurtain, f.owner, f.game, tile, undefined]]);
    f.weapons.length = 0; expect(manager.callSuperWeapon(team, 55, 0)).toBe(true);
});
