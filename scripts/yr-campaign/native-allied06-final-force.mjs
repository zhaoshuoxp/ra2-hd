import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';
import { advanceSupportedPrisms } from './supported-prism-column.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'all06umd.map');
let failure;
try {
    let state = await pilot.open();
    pilot.report.defense = await pilot.page.evaluate(() => {
        const g = window.__ra2debug.game, parliament = g.world.getAllObjects().find(unit => unit.name === 'CALOND04' && !unit.isDestroyed);
        return { tick: g.currentTick, parliament: parliament && { id: parliament.id, owner: parliament.owner.name,
            health: parliament.healthTrait.health, occupants: parliament.garrisonTrait?.getOccupants().length },
            flags: Object.fromEntries(g.campaign.machine.variables), timer: g.countdownTimer.snapshot(),
            remainingUnits: g.campaign.resolveHouse(9).getOwnedObjects(true).filter(unit => unit.isUnit()
                && !unit.rules.naval && !unit.rules.insignificant && !unit.isDestroyed)
                .map(unit => ({ id: unit.id, name: unit.name, spawned: unit.isSpawned,
                    tile: unit.tile && [unit.tile.rx, unit.tile.ry] })) };
    });
    assert(pilot.report.defense.parliament?.health > 25);
    if (!process.argv.includes('--continue-objectives'))
        await pilot.restart('Original YR Allied06 Parliament defense, completed original timer and remaining enemy land forces');
    else pilot.report.priorMeaningfulRestart = 'all06-final-force45-r1: named save at 111450, exact restart and another 180 ticks';
    const commands = pilot.commands;
    await pilot.checkpoint('original-defended-parliament-and-final-forces-checkpoint.json');
    const army = { prisms: state.own.filter(unit => unit.name === 'SREF').map(unit => unit.id),
        air: state.own.filter(unit => ['JUMPJET', 'FV'].includes(unit.name)).map(unit => unit.id) };
    pilot.report.army = army;
    for (let i = 0; i < 180 && !state.result; i++) {
        if (await pilot.page.evaluate(() => window.__ra2debug.game.campaign.inputLocked)) {
            await commands.step(60, { defend: false });
            state = await pilot.observe('original-london-final-presentation-' + i);
            continue;
        }
        const goal = await pilot.page.evaluate(ids => {
            const g = window.__ra2debug.game;
            const own = g.localPlayer.getOwnedObjects().filter(unit => ids.includes(unit.id) && unit.isSpawned && !unit.isDestroyed);
            if (!own.length) throw Error('The ordinary London ground army was lost');
            const center = own.reduce((sum, unit) => [sum[0] + unit.tile.rx / own.length, sum[1] + unit.tile.ry / own.length], [0, 0]);
            const target = g.campaign.resolveHouse(9).getOwnedObjects().filter(unit => unit.isSpawned && !unit.isDestroyed
                && !unit.rules.insignificant && !unit.rules.invisibleInGame && !(unit.isUnit() && unit.rules.naval)
                && unit.rules.legalTarget !== false)
                .sort((a, b) => Number(b.isBuilding()) - Number(a.isBuilding())
                    || Math.hypot(a.tile.rx - center[0], a.tile.ry - center[1]) - Math.hypot(b.tile.rx - center[0], b.tile.ry - center[1]))[0];
            return target && { id: target.id, name: target.name, tile: [target.tile.rx, target.tile.ry], naval: !!target.rules.naval };
        }, army.prisms);
        if (goal) {
            (pilot.report.finalTargets ??= []).push({ tick: state.tick, ...goal });
            if (goal.naval) {
                await commands.order(['SUB', 'HYD'], 2, goal.id);
                for (let j = 0; j < 450; j++) {
                    await commands.step(90);
                    if (j % 10 === 0) await pilot.observe('original-london-final-naval-factory-' + j);
                    if (!await pilot.page.evaluate(id => window.__ra2debug.game.world.hasObjectId(id), goal.id)) break;
                }
            } else await advanceSupportedPrisms(pilot, goal, army, 'original-london-final-required-forces-' + i + '-' + goal.name);
        }
        await commands.step(60, { defend: false });
        state = await pilot.observe('original-london-final-required-forces-' + i);
        if (!state.result) await pilot.checkpoint('last-london-force-progress-checkpoint.json');
    }
    state = await pilot.observe('original-london-source-victory');
    assert.equal(state.result, 'victory');
    pilot.report.status = 'PASS_NATIVE_ORIGINAL_ALLIED06_PARLIAMENT_GARRISON_DEFENSE_DIFFICULTY_TIMER_TWO_MASTERMINDS_AND_SOURCE_VICTORY';
} catch (error) { failure = error; }
await pilot.finish(failure);
