import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, worldState } from '../m3-2/native-session.mjs';
import { OrdinaryCampaignCommands } from '../campaign-completion/ordinary-commands.mjs';
import { closeCampaignMenuPaused } from '../campaign-completion/named-save-restart.mjs';
import { orderGroundColumn } from './ordinary-column.mjs';
import { watchNativeEvaluation } from './watch-native-evaluation.mjs';

const out = path.resolve(process.argv[2]), checkpointFile = path.resolve(process.argv[3]);
const checkpoint = JSON.parse(await fs.readFile(checkpointFile));
assert.equal(checkpoint.identity.mission, 'sov02smd.map');
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [], commands: [], samples: [],
    checkpointFile, assistance: 'Continuation of the unchanged original mission through ordinary paid production, legal rally/move/attack orders and visible-target tactical navigation. No rules, actors, health, tasks, RNG, source conditions or results are edited.' };
let session, commands;
async function inspect(label) {
    const state = await commands.inspect(label); report.samples.push(state);
    await fs.writeFile(path.join(out, 'progress.json'), JSON.stringify(report, null, 2) + '\n');
    return state;
}
async function save(name) {
    const state = await session.page.evaluate(() => { const g = window.__ra2debug.game; return g.campaign.journal.capture(g); });
    await fs.writeFile(path.join(out, name), JSON.stringify(state) + '\n');
}
try {
    session = await campaignSession(out, report, { edition: 'yr' });
    await session.page.evaluate(checkpoint => window.__ra2debug.mainMenuController.screens.get(22)
        .launchDiagnostic(checkpoint, checkpoint.identity.mission), checkpoint);
    await session.page.waitForFunction(tick => window.__ra2debug.game?.currentTick === tick
        && window.__ra2debug.gameScreen?.menu?.getCurrentScreen(), checkpoint.tick, { timeout: 180000 });
    const restored = await worldState(session.page);
    assert.deepEqual({ worldHash: restored.hash, rng: restored.rng, mission: restored.mission,
        world: restored.world, pendingCallbacks: restored.pendingCallbacks }, checkpoint.expected);
    await closeCampaignMenuPaused(session.page);
    await session.page.evaluate(() => window.__ra2debug.gameScreen.gameTurnMgr.setPaused(true));
    await watchNativeEvaluation(session, out, report);
    await session.page.evaluate(() => {
        const g = window.__ra2debug.game, watched = new Set(['V3', 'HTK', 'APOC', 'HARV']);
        window.__campaignCombatObservation = [];
        window.__campaignObservedFiringCells = new Map();
        const describe = unit => unit && ({ id: unit.id, name: unit.name, owner: unit.owner?.name,
            tile: unit.tile && [unit.tile.rx, unit.tile.ry] });
        for (const type of [3, 12, 39]) g.events.subscribe(type, event => {
            if (event.target?.owner !== g.localPlayer || !watched.has(event.target.name)) return;
            const attacker = event.attackerInfo ?? event.attacker;
            const source = attacker?.obj ?? attacker;
            if (type === 12 && source?.name === 'MGTK' && source.tile
                && !g.mapShroudTrait.getPlayerShroud(g.localPlayer).isShrouded(source.tile, source.tileElevation)) {
                window.__campaignObservedFiringCells.set(source.id, {
                    x: source.tile.rx, y: source.tile.ry, tick: g.currentTick });
            }
            window.__campaignCombatObservation.push({ tick: g.currentTick, type, target: describe(event.target),
                attacker: describe(attacker?.obj ?? attacker), weapon: attacker?.weapon?.rules.name,
                previousHealth: event.previousHealth, health: event.target.healthTrait?.health });
            if (window.__campaignCombatObservation.length > 2000) window.__campaignCombatObservation.shift();
        });
    });
    commands = new OrdinaryCampaignCommands(session.page, report);
    commands.groundDefenders = ['HTNK', 'APOC', 'E2', 'SHK', 'DRON'];
    commands.airDefenders = ['FLAKT'];
    let state = await inspect('exact-original-cleared-factory-checkpoint');
    const advanceOnly = process.argv.includes('--advance-only');
    if (!advanceOnly) {
    const assembly = [112, 32];
    await commands.order(['NAWEAP', 'NAHAND'], 0, undefined, assembly);
    await commands.order(['V3'], 0, undefined, [104, 19]);
    const pendingArmor = state.queues.flatMap(queue => queue.items).find(item => item.name === 'APOC');
    if (pendingArmor) {
        await commands.cancel('APOC', pendingArmor.quantity);
        if (!state.queues.flatMap(queue => queue.items).some(item => item.name === 'HTK')) await commands.queue('HTK', 3);
        await commands.queue('APOC', pendingArmor.quantity);
    }
    for (let i = 0; i < 120 && state.own.filter(unit => unit.name === 'APOC').length < 8; i++) {
        const guards = state.own.filter(unit => unit.name === 'APOC').slice(0, 2).map(unit => unit.id);
        commands.groundDefenders = ['HTNK', 'E2', 'SHK', 'DRON'];
        await commands.order(guards, 0, undefined, [105, 22]);
        await commands.order(state.own.filter(unit => unit.name === 'APOC' && !guards.includes(unit.id))
            .map(unit => unit.id), 0, undefined, [115, 31]);
        await commands.order(['HTK'], 0, undefined, [104, 21]);
        await commands.step(180); state = await inspect('ordinary-paid-armor-assembly-' + i);
        assert(state.own.some(unit => unit.name === 'NAWEAP'), 'The ordinary factory was lost before assembly');
    }
    assert(state.own.filter(unit => unit.name === 'APOC').length >= 8, 'The ordinary armored column did not assemble');
    assert(state.own.filter(unit => unit.name === 'V3').length >= 5, 'The original artillery reserve was lost');
    await save('assault-ready-checkpoint.json');
    }
    commands.groundDefenders = ['HTNK', 'E2', 'SHK', 'DRON'];
    const goals = await session.page.evaluate(() => window.__ra2debug.game.map.getInitialMapObjects().technos
        .filter(unit => ['CALAB', 'GACSPH'].includes(unit.name)).map(unit => [unit.rx, unit.ry]));
    assert.equal(goals.length, 2); report.originalGoals = goals;
    const route = advanceOnly ? goals : [[83, 65], [65, 100], [60, 130], [75, 155], [91, 165], ...goals];
    for (const [index, goal] of route.entries()) {
        const spy = await session.page.evaluate(goal => {
            const d = window.__ra2debug, weapon = d.game.localPlayer.superWeaponsTrait.getAll()
                .find(weapon => weapon.rules.type === 8 && weapon.status === 2);
            if (!weapon) return;
            d.actionsApi.activateSuperWeapon(8, { rx: goal[0], ry: goal[1] });
            return { name: weapon.name, tile: goal };
        }, route[Math.min(route.length - 1, index + 1)]);
        if (spy) report.commands.push({ kind: 'ordinary-spy-plane', ...spy });
        for (let i = 0; i < 160 && !state.result; i++) {
            const plan = await orderGroundColumn(commands, goal);
            assert(plan && plan.front >= 1, 'The ordinary assault column was lost');
            const progress = await commands.step(90);
            if (i % 10 === 0 || progress.result) state = await inspect(`original-goal-route-${index}-${i}`);
            if (plan.distance < 6) break;
        }
        state = await inspect('original-goal-route-completed-' + index);
        if (state.result) break;
        await save('last-route-checkpoint.json');
    }
    for (let i = 0; i < 300 && state.result !== 'victory'; i++) {
        const plan = await orderGroundColumn(commands, goals[i / 60 % goals.length | 0]);
        assert(plan?.front >= 1, 'The ordinary final assault column was lost');
        await commands.step(90);
        if (i % 10 === 0) state = await inspect('original-laboratory-chronosphere-goal-' + i);
    }
    state = await inspect('original-final-observation'); assert.equal(state.result, 'victory');
    report.victory = state; report.status = 'PASS_NATIVE_ORIGINAL_SOVIET02_OUTPOSTS_BASE_NAMED_RESTART_LABORATORY_CHRONOSPHERE_AND_VICTORY';
    await session.page.screenshot({ path: path.join(out, 'native-original-victory.png') });
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; }
finally {
    if (commands) report.finalWorld = await commands.inspect('final-source-observation').catch(() => undefined);
    if (session?.page) {
        report.combatObservation = await session.page.evaluate(() => window.__campaignCombatObservation).catch(() => undefined);
        await session.page.evaluate(() => { const g = window.__ra2debug.game;
            return { gameId: g.id, timestamp: g.startTimestamp, launch: g.campaign.launch, commands: g.campaign.journal.commands }; })
            .then(value => fs.writeFile(path.join(out, 'applied-source-journal.json'), JSON.stringify(value) + '\n')).catch(() => {});
        if (!report.finalWorld?.result) await save('last-trusted-checkpoint.json').catch(() => {});
    }
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await session?.app.close().catch(() => {});
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
