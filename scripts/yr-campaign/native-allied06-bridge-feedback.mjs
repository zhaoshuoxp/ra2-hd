import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'all06umd.map');
let failure;
try {
    await pilot.open();
    pilot.report.scope = 'Original Allied06 source, supported reveal and protection, ordinary clock advancement. Read-only bridge and original-team observations; no source, actor, task, rule, trigger or result edits.';
    await pilot.page.evaluate(() => {
        const d = window.__ra2debug, g = d.game; d.trainer.setEnabled(true);
        for (const command of [{ type: 'reveal' }, { type: 'protect', targets: g.localPlayer.getOwnedObjects()
            .filter(u => u.isTechno() && u.isSpawned && !u.isDestroyed) }])
            if (!d.trainer.send(command)) throw Error('Supported bridge review assistance rejected');
        window.__bridgeCombatShots = [];
        g.events.subscribe(2, e => { if (e.gameObject?.onBridge) window.__bridgeCombatShots.push({
            tick: g.currentTick, id: e.gameObject.id, name: e.gameObject.name, owner: e.gameObject.owner.name }); });
    });
    await pilot.commands.step(1, { defend: false });
    pilot.report.bridgeSamples = [];
    for (let i = 0; i <= (process.argv.includes('--quick') ? 0 : 30); i++) {
        if (i) await pilot.commands.step(150, { defend: false });
        const sample = await pilot.page.evaluate(() => {
            const d = window.__ra2debug, g = d.game, c = g.campaign;
            const describe = u => { const team = c.teams.assignments.get(u); return { id: u.id, name: u.name,
                owner: u.owner.name, tile: [u.tile.rx, u.tile.ry], elevation: u.tileElevation, onBridge: u.onBridge,
                health: u.healthTrait.health, target: u.attackTrait?.currentTarget?.obj?.id,
                tasks: u.unitOrderTrait?.getTasks().map(t => ({ type: t.constructor.name, status: t.status,
                    children: t.children?.map(s => ({ type: s.constructor.name, status: s.status })) })),
                team: team && { type: team.type, line: team.line, phase: team.phase,
                    script: c.definition.scripts.get(team.script)?.instructions } }; };
            return { tick: g.currentTick, result: c.result, units: g.world.getAllObjects()
                .filter(u => u.isUnit() && u.isSpawned && !u.isDestroyed && (u.onBridge || !u.owner.isNeutral)).map(describe),
                shots: window.__bridgeCombatShots };
        });
        pilot.report.bridgeSamples.push(sample);
        if ([0, 8, 16, 24].includes(i)) {
            const targets = await pilot.page.evaluate(() => {
                const g = window.__ra2debug.game;
                return g.world.getAllObjects().filter(u => u.isHighBridge?.() && !u.isBridgePlaceholder?.()).filter(u => u.tile.rx > 70).slice(0, 3).map(u => ({ id: u.id, tile: [u.tile.rx, u.tile.ry] }));
            });
            for (const target of targets) {
                await pilot.page.evaluate(id => { const d = window.__ra2debug, u = d.game.world.getObjectById(id);
                    const f = d.worldScene.cameraPan.freeCamera, before = f.value; f.value = true;
                    try { d.worldInteraction.minimapHandler.panToTile(u.tile); } finally { f.value = before; }
                }, target.id);
                await pilot.page.waitForTimeout(150);
                const binding = await pilot.page.evaluate(id => {
                    const d = window.__ra2debug, u = d.game.world.getObjectById(id);
                    const r = d.renderableManager.getRenderableByGameObject(u), b = r.mainRenderable.builder;
                    const mesh = r.mainRenderable.getShapeMesh();
                    return { id, name: u.name, frame: b.frameNo, hd: b.hdOverride?.identity,
                        source: b.shpFile?.filename, flat: b.flat, light: r.extraLight.toArray(),
                        baseLight: mesh.material.extraLight?.toArray(), opacity: mesh.material.opacity,
                        material: mesh.material.type, renderOrder: mesh.renderOrder,
                        depthTest: mesh.material.depthTest, depthWrite: mesh.material.depthWrite,
                        family: d.environmentHd.families['newurban-bridge-high-concrete'] };
                }, target.id);
                (pilot.report.bridgeBindings ??= []).push(binding);
                await pilot.page.screenshot({ path: path.join(pilot.out, `native-bridge-${i}-${target.id}.png`) });
            }
        }
        await fs.writeFile(path.join(pilot.out, 'bridge-progress.json'), JSON.stringify(pilot.report, null, 2)+'\n');
    }
    if (process.argv.includes('--towers')) {
        const towers = await pilot.page.evaluate(() => window.__ra2debug.game.localPlayer.getOwnedObjects()
            .filter(u => u.name === 'ATESLA' && u.isSpawned && !u.isDestroyed)
            .map(u => ({ id: u.id, tile: [u.tile.rx, u.tile.ry] })));
        assert(towers.length >= 2, 'The original paid-base checkpoint must contain real towers');
        pilot.report.towerInspections = [];
        for (const tower of towers) {
            const record = await pilot.page.evaluate(id => {
                const d = window.__ra2debug, g = d.game, u = g.world.getObjectById(id), hash = g.getHash();
                const free = d.worldScene.cameraPan.freeCamera, prior = free.value; free.value = true;
                try { d.worldInteraction.minimapHandler.panToTile(u.tile); } finally { free.value = prior; }
                const r = d.renderableManager.getRenderableByGameObject(u);
                return { id, tile: [u.tile.rx, u.tile.ry], hash, hd: r.mainObj.builder.hdOverride?.identity,
                    bodyDepthTest: r.mainObj.getShapeMesh().material.depthTest,
                    bodyDepthWrite: r.mainObj.getShapeMesh().material.depthWrite };
            }, tower.id);
            await pilot.page.waitForTimeout(200);
            await pilot.page.screenshot({ path: path.join(pilot.out, `native-tower-bridge-${tower.id}.png`) });
            assert.equal(await pilot.page.evaluate(() => window.__ra2debug.game.getHash()), record.hash);
            pilot.report.towerInspections.push(record);
        }
    }
    assert.deepEqual(pilot.report.errors, []); assert.deepEqual(pilot.report.failedResources, []);
    pilot.report.status = 'OBSERVED_ORIGINAL_ALLIED06_BRIDGE_TEAMS_AND_CONTACTS';
} catch (error) { failure = error; }
await pilot.finish(failure);
