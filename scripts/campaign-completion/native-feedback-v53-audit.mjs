import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld, stepWorld } from '../m3-2/native-session.mjs';

const out = path.resolve(process.argv[2]), mission = process.argv[3] ?? 'all03u.map';
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', mission, errors: [], failedResources: [], observations: [],
    scope: 'Original opening with no player commands. Accelerated deterministic turns; observation only, no map/rule/health/objective changes.' };
let app, page;
try {
    ({ app, page } = await campaignSession(out, report, { density: 4 }));
    await page.evaluate(mission => window.__ra2debug.mainMenuController.screens.get(22).launchPrepared(mission), mission);
    await waitWorld(page, mission);
    for (const tick of [0, 180, 600, 1800, 3600]) {
        const current = await page.evaluate(() => window.__ra2debug.game.currentTick);
        if (tick > current) await stepWorld(page, tick - current);
        report.observations.push(await page.evaluate(() => {
            const g = window.__ra2debug.game, c = g.campaign;
            const actor = u => ({ id: u.id, name: u.name, owner: u.owner?.name, spawned: u.isSpawned, destroyed: u.isDestroyed,
                tile: [u.tile?.rx, u.tile?.ry], health: u.healthTrait?.getHitPoints(), units: u.transportTrait?.units.map(x => x.name),
                weapon: u.primaryWeapon && { name: u.primaryWeapon.name, damage: u.primaryWeapon.rules.damage },
                tasks: u.unitOrderTrait?.getTasks().map(t => ({ type: t.constructor.name, children: t.children?.map(x => x.constructor.name) })) });
            return { tick: g.currentTick, hash: g.getHash(), result: c.result, failure: c.failure,
                ai: c.teams.sourceAi?.snapshot(), aiTrace: c.teams.sourceAi?.trace, trace: c.trace,
                teams: [...c.teams.instances.values()].filter(t => t.owner === g.localPlayer || t.members.some(u => u.isAircraft()))
                    .map(t => ({ id: t.id, type: t.type, phase: t.phase, line: t.line, started: t.started,
                        tasks: t.tasks.map(x => ({ unit: x.unit.id, task: x.task?.constructor.name })), members: t.members.map(actor) })),
                actors: g.world.getAllObjects().filter(u => u.isTechno() && (['ENGINEER', 'FV', 'MTNK', 'PDPLANE', 'SHAD', 'TANY'].includes(u.name)))
                    .map(actor),
                bridges: g.world.getAllObjects().filter(u => u.isOverlay() && u.isBridge()).map(u => ({ id: u.id, name: u.name,
                    tile: [u.tile.rx, u.tile.ry], health: u.healthTrait?.health, value: u.value,
                    displayValue: u.bridgeDisplayValue, overlayId: u.overlayId, high: u.isHighBridge() })) };
        }));
    }
    await page.screenshot({ path: path.join(out, 'opening-native.png') });
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    if (process.argv.includes('--assert-demo')) {
        const start = report.observations[0], final = report.observations.find(o => o.tick === 600);
        const damaged = start.actors.find(a => a.name === 'FV' && a.health === 1);
        assert(damaged && final.actors.find(a => a.id === damaged.id)?.health > 1, 'Original damaged IFV was not repaired');
        assert(final.actors.some(a => a.name === 'FV' && a.units?.includes('ENGINEER')), 'Original engineer did not board the IFV');
        report.originalDemonstration = 'PASS_REAL_ENGINEER_BOARDING_AND_WEAPON_HEAL';
    }
    report.status = 'PASS_ORIGINAL_OPENING_OBSERVATION_ONLY';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
