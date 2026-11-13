import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld } from '../m3-2/native-session.mjs';

const out = path.resolve(process.argv[2]); await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [], missions: [],
    scope: 'Unmodified original worlds without player orders, advanced by direct simulation turns while suppressing presentation for sampling. Source rules, triggers, actors and goals remain intact. Airport screenshots reveal the frozen original map for a labeled art diagnostic only.' };
let app, page;
try {
    const selected = process.argv.find(value => value.startsWith('--mission='))?.slice(10);
    if (selected) assert(['sov09u.map', 'sov12s.map'].includes(selected));
    for (const mission of selected ? [selected] : ['sov09u.map', 'sov12s.map']) {
        const sessionOut = path.join(out, mission.slice(0, -4)); await fs.mkdir(sessionOut);
        ({ app, page } = await campaignSession(sessionOut, report, { density: 4 }));
        await page.evaluate(mission => window.__ra2debug.mainMenuController.screens.get(22).launchDiagnostic(undefined, mission), mission);
        await waitWorld(page, mission);
        const result = { mission, launch: await page.evaluate(() => window.__ra2debug.game.campaign.launch), samples: [] }; report.missions.push(result);
        for (const target of [0, 300, 900, 1800, 3600, 6000]) {
            const sample = await page.evaluate(target => {
                const d = window.__ra2debug, g = d.game, c = g.campaign;
                const restoring = c.restoring; c.restoring = true;
                try { while (g.currentTick < target && !c.result && !c.failure) g.update(); }
                finally { c.restoring = restoring; }
                const unit = object => ({ id: object.id, name: object.name, owner: object.owner?.name,
                    tile: [object.tile.rx, object.tile.ry], hp: object.healthTrait?.health,
                    tasks: object.unitOrderTrait?.getTasks().map(task => task.constructor.name),
                    spawned: object.isSpawned, destroyed: object.isDestroyed });
                return { tick: g.currentTick, hash: g.getHash(), result: c.result, failure: c.failure,
                    player: g.localPlayer.name, controlled: g.localPlayer.campaignControlledPlayers?.map(p => p.name),
                    yuri: g.world.getAllObjects().filter(o => o.name === 'YURI').map(unit),
                    friendly: g.world.getAllObjects().filter(o => o.isSpawned && o.isTechno() && !o.isDestroyed
                        && (o.owner === g.localPlayer || !o.owner.isAi && !o.owner.isNeutral)).map(unit),
                    nearbyEnemy: g.world.getAllObjects().filter(o => o.isSpawned && o.isTechno() && !o.isDestroyed
                        && o.owner.isAi && Math.abs(o.tile.rx - 173) + Math.abs(o.tile.ry - 112) < 40).map(unit),
                    trace: c.trace.slice(-25), teams: [...c.teams.instances.values()].filter(team => team.members.some(o => o.name === 'YURI'))
                        .map(team => ({ type: team.type, phase: team.phase, line: team.line, target: team.target?.id })) };
            }, target);
            result.samples.push(sample); if (sample.result || sample.failure) break;
        }
        if (mission === 'sov09u.map') {
            if (process.argv.includes('--assert-yuri-idle')) {
                assert.equal(result.launch.semanticsVersion, 11); assert.equal(result.launch.paradropControlVersion, 1);
                const landed = result.samples.find(sample => sample.tick === 900), last = result.samples.at(-1);
                assert.equal(last.tick, 6000); assert(!last.result && !last.failure); assert.equal(last.yuri.length, 2);
                assert.deepEqual(last.yuri.map(unit => [unit.id, unit.tile]), landed.yuri.map(unit => [unit.id, unit.tile]));
                assert(last.yuri.every(unit => unit.spawned && !unit.destroyed && !unit.tasks.some(task => /Attack/.test(task))));
                result.unprotectedIdleThrough6000 = true;
            }
            result.airport = await page.evaluate(() => {
                const d = window.__ra2debug, g = d.game;
                const airport = g.world.getAllObjects().find(o => o.name === 'CAAIRP');
                if (!airport) return null;
                g.campaign.inspectionModified = true; g.mapShroudTrait.revealMap(g.localPlayer, g);
                d.worldInteraction.minimapHandler.panToTile(airport.tile);
                return { id: airport.id, tile: [airport.tile.rx, airport.tile.ry], nearby: g.world.getAllObjects()
                    .filter(o => Math.abs(o.tile.rx - airport.tile.rx) + Math.abs(o.tile.ry - airport.tile.ry) < 12)
                    .map(o => ({ id: o.id, name: o.name, tile: [o.tile.rx, o.tile.ry] })) };
            });
            await page.waitForTimeout(500); await page.screenshot({ path: path.join(out, 'diagnostic-soviet09-airport.png') });
        }
        await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
        await app.close(); app = page = undefined;
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_ORIGINAL_OPENING_BASELINE_OBSERVED';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
