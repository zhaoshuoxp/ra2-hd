import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'all06umd.map');
const repairOrders = new Set(), stationedEngineers = new Set(), stationedGuards = new Set();
function configure(commands) {
    commands.groundDefenders = ['MTNK', 'SREF', 'GGI', 'FV'];
    commands.airDefenders = ['FV', 'GGI'];
    commands.groundPriority = ['YURI', 'MIND', 'YTNK', 'VIRUS'];
}
async function inspect() {
    return pilot.page.evaluate(() => {
        const g = window.__ra2debug.game;
        const parliament = g.world.getAllObjects().find(unit => unit.name === 'CALOND04' && !unit.isDestroyed);
        return { tick: g.currentTick, timer: g.countdownTimer.snapshot(), inputLocked: !!g.campaign.inputLocked,
            parliament: parliament && { id: parliament.id, owner: parliament.owner.name,
                health: parliament.healthTrait.health, occupants: parliament.garrisonTrait.getOccupants().length },
            units: g.localPlayer.getOwnedObjects().filter(unit => unit.isUnit() && unit.isSpawned && !unit.isDestroyed)
                .map(unit => ({ id: unit.id, name: unit.name, tile: [unit.tile.rx, unit.tile.ry],
                    deployed: !!unit.deployerTrait?.isDeployed(), moving: !!unit.moveTrait?.currentWaypoint })) };
    });
}
let failure;
try {
    await pilot.open();
    assert(pilot.report.sourceCheckpoint, 'Continue the legitimate observed Parliament-defense source checkpoint');
    configure(pilot.commands);
    const initial = await inspect();
    assert(initial.parliament?.health > 25 && initial.timer.ticks > 0);
    pilot.report.initialDefense = initial;
    await pilot.commands.queue('ENGINEER', 4);
    await pilot.commands.queue('GGI', 10);
    await pilot.commands.queue('CMIN', 1);
    await pilot.commands.queue('FV', 2);
    await pilot.commands.order(['GAPILE'], 0, undefined, [92, 119]);
    let timerEndedAt;
    for (let i = 0; i < 1200; i++) {
        const state = await inspect();
        assert(state.parliament?.health > 25, 'The original Parliament failure threshold was reached');
        if (!state.inputLocked) {
            const engineers = state.units.filter(unit => unit.name === 'ENGINEER');
            const available = engineers.filter(unit => !repairOrders.has(unit.id));
            if (state.parliament.health < 95 && available.length) {
                available.sort((a, b) => Math.hypot(a.tile[0] - 93, a.tile[1] - 116)
                    - Math.hypot(b.tile[0] - 93, b.tile[1] - 116));
                const engineer = available[0];
                await pilot.commands.order([engineer.id], 15, state.parliament.id);
                repairOrders.add(engineer.id);
                (pilot.report.engineerRepairs ??= []).push({ tick: state.tick,
                    engineer: engineer.id, parliamentHealth: state.parliament.health });
            }
            for (const unit of available) {
                if (repairOrders.has(unit.id) || stationedEngineers.has(unit.id)) continue;
                await pilot.commands.order([unit.id], 0, undefined, [92, 117]);
                stationedEngineers.add(unit.id);
            }
            for (const unit of state.units.filter(unit => unit.name === 'GGI')) {
                if (!stationedGuards.has(unit.id)) {
                    if (unit.deployed) await pilot.commands.order([unit.id], 9);
                    await pilot.commands.order([unit.id], 0, undefined, [96, 113]);
                    stationedGuards.add(unit.id);
                } else if (!unit.deployed && !unit.moving
                    && Math.hypot(unit.tile[0] - 96, unit.tile[1] - 113) <= 4) {
                    await pilot.commands.order([unit.id], 9);
                }
            }
        }
        if (i % 20 === 0) await pilot.observe('original-parliament-engineer-and-bridge-defense-' + i);
        if (state.timer.ticks === 0 && timerEndedAt === undefined) {
            timerEndedAt = state.tick;
            pilot.report.originalTimerCompleted = state;
            await pilot.checkpoint('original-parliament-timer-completed-checkpoint.json');
        }
        if (timerEndedAt !== undefined && state.tick >= timerEndedAt + 1800) break;
        await pilot.commands.step(30, { repair: false });
    }
    assert(timerEndedAt !== undefined, 'Observe the original difficulty-specific countdown expiry');
    pilot.report.defenseBeforeRestart = await inspect();
    await pilot.checkpoint('original-parliament-post-timer-defense-checkpoint.json');
    await pilot.restart('Original YR Allied06 difficulty timer expired, paid bridge guards and surviving Parliament');
    pilot.report.defenseAfterRestart = await inspect();
    assert(pilot.report.defenseAfterRestart.parliament.health > 25);
    assert.equal(pilot.report.defenseAfterRestart.timer.ticks, 0);
    pilot.report.status = 'PASS_NATIVE_ORIGINAL_ALLIED06_DIFFICULTY_TIMER_PARLIAMENT_ENGINEER_DEFENSE_AND_NAMED_RESTART_FINAL_GOALS_PENDING';
} catch (error) { failure = error; }
await pilot.finish(failure);
