import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld, stepWorld } from '../m3-2/native-session.mjs';

const out = path.resolve(process.argv[2]), mission = process.argv[3] ?? 'sov01umd.map';
assert(['sov01umd.map', 'sov05umd.map'].includes(mission));
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', mission, errors: [], failedResources: [], samples: [],
    scope: 'Original source opening without player orders, with read-only source health, displacement, heading and sprite observations. No actor, rule, health, trigger, RNG or result edits.' };
let session;
try {
    session = await campaignSession(out, report, { edition: 'yr', density: Number(process.argv.find(v => v.startsWith('--density='))?.slice(10) ?? 4) });
    const { page } = session;
    await page.evaluate(mission => window.__ra2debug.mainMenuController.screens.get(22).launchPrepared(mission), mission);
    await waitWorld(page, mission);
    await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game;
        d.gameScreen.gameTurnMgr.setPaused(true);
        window.__openingDamage = [];
        g.events.subscribe(event => {
            if (typeof event.damageHitPoints !== 'number') return;
            window.__openingDamage.push({ tick: g.currentTick, id: event.target?.id, name: event.target?.name,
                owner: event.target?.owner?.name, damage: event.damageHitPoints,
                attacker: event.attacker?.obj?.name, weapon: event.attacker?.weapon?.rules?.name });
        });
    });
    for (const tick of [0, 1, 15, 30, 60, 90, 120, 180, 240, 360, 540, 720, 900, 1200]) {
        const current = await page.evaluate(() => window.__ra2debug.game.currentTick);
        if (tick > current) await stepWorld(page, tick - current);
        if (mission === 'sov05umd.map' && [60, 120, 180].includes(tick)) await page.evaluate(() => {
            const d = window.__ra2debug, u = d.game.world.getAllObjects().find(u => u.name === 'SQD' && u.isSpawned);
            if (!u) return;
            const free = d.worldScene.cameraPan.freeCamera, previous = free.value; free.value = true;
            try { d.worldInteraction.minimapHandler.panToTile(u.tile); } finally { free.value = previous; }
        });
        await page.waitForTimeout(120);
        const sample = await page.evaluate(() => {
            const d = window.__ra2debug, g = d.game;
            return { tick: g.currentTick, player: g.localPlayer.name, policy: g.campaign.launch.semanticsVersion,
                units: g.world.getAllObjects().filter(u => u.isUnit() && (u.owner === g.localPlayer || u.name === 'SQD'))
                    .map(u => {
                        const r = d.renderableManager.getRenderableByGameObject(u), p = u.position;
                        return { id: u.id, name: u.name, owner: u.owner.name, spawned: u.isSpawned,
                            hp: u.healthTrait.getHitPoints(), strength: u.rules.strength, health: u.healthTrait.health,
                            tile: [u.tile.rx, u.tile.ry], position: p && [p.worldPosition.x, p.worldPosition.z],
                            projectedPositiveZ: r && (() => { const w = d.worldScene, origin = r.get3DObject().getWorldPosition(w.camera.position.clone());
                                const a = origin.clone().project(w.camera), b = origin.clone().add(w.camera.position.clone().set(0, 0, 10)).project(w.camera);
                                return [(b.x-a.x)*w.viewport.width/2, -(b.y-a.y)*w.viewport.height/2]; })(),
                            direction: u.direction, moving: u.moveTrait?.isMoving(), frame: r?.shpRenderable?.builder?.frameNo,
                            hd: !!r?.shpRenderable?.builder?.hdOverride, facingCount: r?.objectArt.facings,
                            shapeFrame: r?.shapeFrame, tasks: u.unitOrderTrait?.getTasks().map(t => t.constructor.name) };
                    }), damage: window.__openingDamage.splice(0) };
        });
        report.samples.push(sample);
        if ([30, 60, 120, 180, 540].includes(tick)) await page.screenshot({ path: path.join(out, `native-opening-${tick}.png`) });
        await fs.writeFile(path.join(out, 'progress.json'), JSON.stringify(report, null, 2) + '\n');
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'OBSERVED_ORIGINAL_SOVIET_OPENING_HEALTH_AND_SQUID_MOVEMENT';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; }
finally { await session?.app.close(); await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); }
console.log(JSON.stringify({ status: report.status, error: report.error, samples: report.samples.length }));
