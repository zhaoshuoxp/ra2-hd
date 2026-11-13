import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, worldState } from '../m3-2/native-session.mjs';
import { OrdinaryCampaignCommands } from '../campaign-completion/ordinary-commands.mjs';
import { closeCampaignMenuPaused } from '../campaign-completion/named-save-restart.mjs';
import { watchNativeEvaluation } from './watch-native-evaluation.mjs';

const out = path.resolve(process.argv[2]), source = path.resolve(process.argv[3]);
const checkpoint = JSON.parse(await fs.readFile(source));
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [], commands: [], samples: [], source,
    assistance: 'Exact real western-route checkpoint continuation, ordinary artillery attacks on the already visible original objectives, and ordinary armor protection. No source, rules, actor, task, health, RNG or result edits.' };
let session, commands;
async function inspect(label) {
    const state = await commands.inspect(label); report.samples.push(state);
    await fs.writeFile(path.join(out, 'progress.json'), JSON.stringify(report, null, 2) + '\n'); return state;
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
    commands = new OrdinaryCampaignCommands(session.page, report);
    let state = await inspect('exact-western-source-checkpoint');
    await commands.order(['APOC'], 0, undefined, [87, 164]);
    await commands.order(['HTK'], 0, undefined, [86, 163]);
    const artillery = state.own.filter(unit => unit.name === 'V3');
    for (let index = 0; index < artillery.length; index++) {
        await commands.order([artillery[index].id], 0, undefined, [85 + index % 2, 162 + Math.floor(index / 2)]);
    }
    for (let stage = 0; stage < 36; stage++) {
        await commands.step(90, { defend: false });
        state = await inspect('ordinary-high-ground-staging-' + stage);
        if (state.own.filter(unit => unit.name === 'V3').every(unit => unit.tile[0] >= 83 && unit.tile[1] >= 161)) break;
    }
    report.stagedTasks = await session.page.evaluate(() => window.__ra2debug.game.localPlayer.getOwnedObjects()
        .filter(unit => unit.name === 'V3').map(unit => ({ id: unit.id, tile: [unit.tile.rx, unit.tile.ry, unit.tile.z],
            tasks: unit.unitOrderTrait.tasks?.map(task => task.constructor.name) })));
    for (const name of ['CALAB', 'GACSPH']) {
        let lastTarget;
        for (let attempt = 0; attempt < 160; attempt++) {
            const target = await session.page.evaluate(name => window.__ra2debug.game.world.getAllObjects()
                .find(unit => unit.name === name && unit.isSpawned && !unit.isDestroyed)?.id, name);
            if (target === undefined) break;
            if (target !== lastTarget) { await commands.order(['V3'], 2, target); lastTarget = target; }
            const defense = await session.page.evaluate(() => {
                const g = window.__ra2debug.game, shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
                const guns = g.localPlayer.getOwnedObjects().filter(unit => unit.name === 'V3' && unit.isSpawned && !unit.isDestroyed);
                const enemies = g.world.getAllObjects().filter(unit => unit.isUnit() && unit.isSpawned && !unit.isDestroyed
                    && unit.owner !== g.localPlayer && !unit.owner.isNeutral && !g.alliances.areAllied(g.localPlayer, unit.owner)
                    && !shroud.isShrouded(unit.tile, unit.tileElevation) && !unit.cloakableTrait?.isCloaked()
                    && (!unit.disguiseTrait?.isDisguised() || g.localPlayer.sharedDetectDisguiseTrait?.has(unit))
                    && guns.some(gun => Math.hypot(gun.tile.rx - unit.tile.rx, gun.tile.ry - unit.tile.ry) < 10));
                return { ground: enemies.find(unit => unit.zone !== 1)?.id, air: enemies.find(unit => unit.zone === 1)?.id };
            });
            if (defense.ground !== undefined) await commands.order(['APOC'], 2, defense.ground);
            if (defense.air !== undefined) await commands.order(['HTK'], 2, defense.air);
            const progress = await commands.step(90, { defend: false });
            if (attempt % 5 === 0 || progress.result) state = await inspect('original-visible-' + name + '-' + attempt);
            assert(state.own.some(unit => unit.name === 'V3'), 'The ordinary artillery was lost');
            if (progress.result) break;
        }
        state = await inspect('original-goal-observation-' + name);
        assert(!state.houses.some(house => house.objects.some(unit => unit.name === name)), 'Original goal remains: ' + name);
    }
    for (let i = 0; i < 20 && state.result !== 'victory'; i++) {
        await commands.step(90, { defend: false }); state = await inspect('original-result-delay-' + i);
    }
    assert.equal(state.result, 'victory'); report.victory = state;
    report.status = 'PASS_NATIVE_ORIGINAL_SOVIET02_OUTPOSTS_BASE_RESTART_LABORATORY_CHRONOSPHERE_AND_SOURCE_VICTORY';
    await session.page.screenshot({ path: path.join(out, 'native-original-victory.png') });
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; }
finally {
    if (commands) report.finalWorld = await commands.inspect('final-original-observation').catch(() => undefined);
    if (session?.page) {
        if (!report.finalWorld?.result) await session.page.evaluate(() => { const g = window.__ra2debug.game; return g.campaign.journal.capture(g); })
            .then(value => fs.writeFile(path.join(out, 'last-trusted-checkpoint.json'), JSON.stringify(value) + '\n')).catch(() => {});
        await session.page.evaluate(() => { const g = window.__ra2debug.game; return {
            gameId: g.id, timestamp: g.startTimestamp, launch: g.campaign.launch, commands: g.campaign.journal.commands }; })
            .then(value => fs.writeFile(path.join(out, 'applied-source-journal.json'), JSON.stringify(value) + '\n')).catch(() => {});
    }
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await session?.app.close().catch(() => {});
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
