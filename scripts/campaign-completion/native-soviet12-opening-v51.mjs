import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld } from '../m3-2/native-session.mjs';

const out = path.resolve(process.argv[2]); await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [], difficulties: [],
    scope: 'Fresh original Soviet12 in three difficulties. No player orders or changes to initial troops, source timers, RNG or objectives. Two real seconds verify the Normal opening; direct turns then observe the original first chrono action and first enemy near the base. Fast sampling suppresses presentation only. Wall-clock equivalents from selected speed are calculations, not full-duration realtime runs.' };
let app, page;
try {
    for (const difficulty of ['normal', 'easy', 'hard']) {
        const directory = path.join(out, difficulty); await fs.mkdir(directory);
        ({ app, page } = await campaignSession(directory, report, { density: 0 }));
        await page.evaluate(difficulty => { const screen = window.__ra2debug.mainMenuController.screens.get(22);
            screen.difficulty = difficulty; return screen.launchPrepared('sov12s.map'); }, difficulty);
        await waitWorld(page, 'sov12s.map');
        const entry = { difficulty, initial: await page.evaluate(() => { const g = window.__ra2debug.game;
            return { tick: g.currentTick, speedTier: g.gameOpts.gameSpeed, speed: g.speed.value,
                source: g.campaign.launch.sourceSha256, forces: g.localPlayer.getOwnedObjects().filter(o => o.isSpawned && !o.isDestroyed)
                    .map(o => ({ id: o.id, name: o.name, building: o.isBuilding(), tile: [o.tile.rx, o.tile.ry] })) }; }) };
        report.difficulties.push(entry);
        assert.equal(entry.initial.speedTier, 2); assert.equal(entry.initial.speed, 4.5);
        assert.deepEqual(entry.initial.forces.map(o => o.name).sort(), ['NACNST', 'NAHAND', 'NAPOWR', 'NARADR']);
        if (difficulty === 'normal') {
            await page.evaluate(() => window.__ra2debug.gameScreen.gameTurnMgr.setCampaignPaused(false));
            await page.waitForTimeout(2200);
            entry.realtime = await page.evaluate(() => { const d = window.__ra2debug; d.gameScreen.gameTurnMgr.setCampaignPaused(true);
                return { tick: d.game.currentTick, firstChrono: d.game.campaign.trace.find(a => a.opcode === 107) }; });
            assert(entry.realtime.tick > 0); assert.equal(entry.realtime.firstChrono, undefined);
        }
        entry.timing = await page.evaluate(() => {
            const d = window.__ra2debug, g = d.game, c = g.campaign, old = c.restoring;
            let nearBase, firstChrono, firstEnabledTick; c.restoring = true;
            const chronoIds = [...c.definition.triggers.values()].filter(t => t.actions.some(a => a.opcode === 107)).map(t => t.id);
            try {
                while (g.currentTick < 6500 && !c.result && !c.failure) {
                    const enabledBefore = !firstChrono && new Map(chronoIds.map(id => [id, c.machine.states.get(id).enabledTick]));
                    g.update();
                    if (!firstChrono) {
                        firstChrono = c.trace.find(a => a.opcode === 107);
                        if (firstChrono) firstEnabledTick = enabledBefore.get(firstChrono.key);
                    }
                    if (!nearBase) {
                        const enemies = g.world.getAllObjects().filter(o => o.isSpawned && o.isTechno() && !o.isDestroyed && !o.owner.isNeutral
                            && !g.areFriendly({ owner: g.localPlayer }, o) && Math.abs(o.tile.rx - 173) + Math.abs(o.tile.ry - 112) < 40);
                        if (enemies.length) nearBase = { tick: g.currentTick, enemies: enemies.map(o => ({ id: o.id, name: o.name,
                            tile: [o.tile.rx, o.tile.ry], phasing: o.warpedOutTrait.isActive() })) };
                    }
                    if (firstChrono && nearBase) break;
                }
            } finally { c.restoring = old; }
            const trigger = firstChrono && c.definition.triggers.get(firstChrono.key), state = firstChrono && c.machine.states.get(firstChrono.key);
            const elapsedSeconds = Math.max(0, ...trigger.events.filter(e => e.opcode === 13).map(e => Number(e.params[1])));
            return { firstChrono, nearBase, failure: c.failure,
                schedule: { enabledTick: firstEnabledTick, sourceElapsedSeconds: elapsedSeconds,
                    firstPermittedTick: firstEnabledTick + elapsedSeconds * 15 },
                sourceTrigger: firstChrono && c.definition.triggers.get(firstChrono.key),
                computedFirstChronoPhysicalSeconds: firstChrono && firstChrono.tick / (15 * g.speed.value),
                computedNearBasePhysicalSeconds: nearBase && nearBase.tick / (15 * g.speed.value) };
        });
        assert(entry.timing.firstChrono?.tick > 0, JSON.stringify(entry.timing));
        assert(entry.timing.firstChrono.tick + 1 >= entry.timing.schedule.firstPermittedTick, JSON.stringify(entry.timing));
        assert(entry.timing.nearBase?.tick > 0, JSON.stringify(entry.timing)); assert(!entry.timing.failure);
        await page.evaluate(() => { const d = window.__ra2debug;
            d.worldInteraction.minimapHandler.panToTile(d.game.localPlayer.getOwnedObjects().find(o => o.name === 'NACNST').tile);
            d.gameScreen.pointer.unlock(true); });
        await page.waitForTimeout(300); await page.screenshot({ path: path.join(directory, 'native-original-base-and-first-nearby-wave.png') });
        await app.close(); app = page = undefined;
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_NATIVE_THREE_DIFFICULTY_ORIGINAL_BASE_ONLY_OPENING_AND_DELAYED_CHRONO_TIMING';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
