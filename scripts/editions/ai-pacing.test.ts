import { expect, test } from 'bun:test';
import { aiPacing } from '../../src/game/ai/AiPacing';
import { AiDifficulty } from '../../src/game/gameopts/GameOpts';
import { AttackMissionFactory } from '../../src/game/ai/thirdpartbot/builtIn/bot/logic/mission/missions/attackMission';
import { requestEconomyUnits } from '../../src/game/ai/thirdpartbot/builtIn/bot/logic/building/economyRequests';
import { useSpecialPowers } from '../../src/game/ai/thirdpartbot/builtIn/bot/logic/specialPowers';
import { SuperWeaponType } from '../../src/game/type/SuperWeaponType';
import { SuperWeaponStatus } from '../../src/game/SuperWeapon';

for (const expansion of [false, true]) for (const difficulty of [AiDifficulty.Easy, AiDifficulty.Normal, AiDifficulty.Brutal]) {
    test(`attack timing, active wave limit and economy budget: ${expansion}/${difficulty}`, () => {
        const pacing = aiPacing(difficulty, expansion, expansion);
        let tick = pacing.firstAttack - 1, minerCount = pacing.maxSlaveMiners;
        const player = { name: 'AI', aiPacing: pacing, credits: 1000, isCombatant: true };
        const game: any = { getCurrentTick: () => tick, getPlayerData: () => player,
            generateRandomInt: () => 1, getVisibleUnits: () => ['enemy'], getUnitData: () => ({ owner: 'Enemy', tile: { rx: 80, ry: 80 }, maxHitPoints: 100, rules: {} }) };
        const missions: any[] = [];
        const controller: any = { getMissions: () => missions, addMission: (m: any) => { missions.push(m); return true; } };
        const context: any = { game, player, matchAwareness: { getMainRallyPoint: () => ({ x: 0, y: 0 }) } };
        const factory = new AttackMissionFactory();
        const composition = { composition: { HTNK: 1 }, minimumUnits: 2, maximumUnits: 20 };
        const run = () => factory.maybeCreateMissions(context, controller, () => {}, composition);
        run(); expect(missions.length).toBe(0);
        tick++; run(); expect(missions.length).toBe(1);
        expect(missions[0].requestedUnitCount).toBe(Math.max(2, Math.round(20 * pacing.squadScale)));
        missions[0].state = 1; // A deployed wave must count toward the limit.
        tick += pacing.attackInterval - 1; run(); expect(missions.length).toBe(1);
        tick++; run(); expect(missions.length).toBe(pacing.maxAttacks);
        tick += pacing.attackInterval; run(); expect(missions.length).toBe(pacing.maxAttacks);
        const economy: any = { getCurrentTick: () => tick, getPlayerData: () => player, getVisibleUnits: () => Array(minerCount).fill(1) };
        const production: any = { getAvailableObjects: () => [{ name: 'SMIN' }] };
        const requests = new Map(); requestEconomyUnits(economy, production, 'AI', requests); expect(requests.has('SMIN')).toBe(false);
        minerCount--; requestEconomyUnits(economy, production, 'AI', requests); expect(requests.has('SMIN')).toBe(true);
    });
}

test('offensive powers respect preparation time and become available afterward', () => {
    const pacing = aiPacing(AiDifficulty.Easy, true, true);
    let tick = 0, fired = 0;
    const game: any = { getCurrentTick: () => tick, getPlayerData: () => ({ aiPacing: pacing }),
        getAllSuperWeaponData: () => [{ playerName: 'AI', status: SuperWeaponStatus.Ready, type: SuperWeaponType.PsychicReveal }],
        getVisibleUnits: () => [1], getGameObjectData: () => ({ rules: { constructionYard: true }, tile: { rx: 1, ry: 1 } }) };
    const actions: any = { activateSuperWeapon: () => fired++ };
    useSpecialPowers(game, actions, 'AI'); expect(fired).toBe(0);
    tick = pacing.firstAttack; useSpecialPowers(game, actions, 'AI'); expect(fired).toBe(1);
});

test('the three tiers remain ordered and expansion receives additional breathing room', () => {
    for (const expansion of [false, true]) {
        const [easy, normal, brutal] = [AiDifficulty.Easy, AiDifficulty.Normal, AiDifficulty.Brutal].map(d => aiPacing(d, expansion, expansion));
        expect(easy.firstAttack).toBeGreaterThan(normal.firstAttack); expect(normal.firstAttack).toBeGreaterThan(brutal.firstAttack);
        expect(easy.attackInterval).toBeGreaterThan(normal.attackInterval); expect(normal.attackInterval).toBeGreaterThan(brutal.attackInterval);
        expect(easy.maxSlaveMiners).toBeLessThan(normal.maxSlaveMiners); expect(normal.maxSlaveMiners).toBeLessThan(brutal.maxSlaveMiners);
    }
    expect(aiPacing(AiDifficulty.Normal, true, true).firstAttack).toBeGreaterThan(aiPacing(AiDifficulty.Normal, false, false).firstAttack);
});

test('both slave-economy production paths share the tier limit, including deployed miners', async () => {
    await import('../../src/game/ai/thirdpartbot/builtIn/BuiltInBotAdapter');
    const { SlaveRefinery, MobileSlaveMiner } = await import('../../src/game/ai/thirdpartbot/builtIn/bot/logic/building/slaveEconomy');
    const { Harvester } = await import('../../src/game/ai/thirdpartbot/builtIn/bot/logic/building/harvester');
    for (const difficulty of [AiDifficulty.Easy, AiDifficulty.Normal, AiDifficulty.Brutal]) {
        const pacing = aiPacing(difficulty, true, true), player: any = { name: 'AI', aiPacing: pacing };
        const game: any = { getVisibleUnits: () => Array(pacing.maxSlaveMiners).fill('YAREFN') };
        const refinery = new SlaveRefinery(), miner = new MobileSlaveMiner();
        expect(refinery.getPriority(game, player)).toBeLessThan(0);
        expect(miner.getPriority(game, player, {} as any)).toBeLessThan(0);
        expect(refinery.getMaxCount(game, player)).toBe(pacing.maxSlaveMiners);
        expect(miner.getMaxCount(game, player)).toBe(pacing.maxSlaveMiners);
        expect(new Harvester(15, 4, 2).getMaxCount(game, player, {} as any, null)).toBe(pacing.maxMiners);
    }
});

test('naval production cannot fill Yuri escort slots with extra Boomers', async () => {
    const { updateNavalFleet } = await import('../../src/game/ai/thirdpartbot/builtIn/bot/logic/navalFleet');
    for (const difficulty of [AiDifficulty.Easy, AiDifficulty.Normal, AiDifficulty.Brutal]) {
        const pacing = aiPacing(difficulty, true, true);
        let count = pacing.maxCapitalShips, queued = 0;
        const game: any = { getCurrentTick: () => 0, getPlayerData: () => ({ aiPacing: pacing, credits: 5000 }),
            getVisibleUnits: (_name: string, relationship: string) => relationship === 'self' ? Array.from({ length: count }, (_,i) => i) : [],
            getUnitData: (id: number) => ({ id, name: 'BSUB' }) };
        const production: any = { getAvailableObjects: () => [{ name: 'BSUB', type: 7 }], getQueueData: () => ({ size: 0 }) };
        const actions: any = { queueForProduction: () => queued++ };
        updateNavalFleet(game, actions, production, 'AI'); expect(queued).toBe(0);
        count--; updateNavalFleet(game, actions, production, 'AI'); expect(queued).toBe(1);
    }
});
