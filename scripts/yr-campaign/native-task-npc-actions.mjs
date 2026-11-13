import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';
import { campaignSession, worldState, stepWorld } from '../m3-2/native-session.mjs';
import { openNpcSource } from './open-npc-source.mjs';

const [output, mission, identity, requestedDensity, requestedTicks] = process.argv.slice(2);
const out = path.resolve(output), density = Number(requestedDensity), ticks = Number(requestedTicks);
assert(identity === 'EINS' && mission === 'all04dmd.map'); assert([0,2,4].includes(density));
assert(Number.isSafeInteger(ticks) && ticks > 0 && ticks <= 1800 && ticks%5 === 0);
assert(process.argv.some(value => value.startsWith('--checkpoint=')));
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', mission, identity, density, ticks, errors: [], failedResources: [], observations: [],
    scope: 'Exactly restored ordinary source checkpoint, followed by original simulation ticks and existing original orders. '
        + 'Camera framing only; no map reveal, actor creation, health, pose, task, ownership, rule, world or outcome assignment. '
        + 'The normal animation loop chooses every displayed frame. Compare the Original/2X/4X world snapshots separately.' };
let app, page;
try {
    ({ app, page } = await campaignSession(out, report, { edition: 'yr', density }));
    await openNpcSource(page, out, report, mission, identity);
    report.start = await page.evaluate(({ identity, density }) => {
        const d = window.__ra2debug, g = d.game, w = d.worldScene;
        const actor = g.world.getAllObjects().find(actor => actor.name === identity && actor.isSpawned && !actor.isDestroyed);
        if (!actor) throw Error('Original source NPC is absent');
        if (g.mapShroudTrait.getPlayerShroud(g.localPlayer).isShrouded(actor.tile, actor.tileElevation))
            throw Error('Original NPC must already be visible through legitimate source gameplay');
        window.__sourceNpcActionActor = actor;
        const zoom = Math.max(1, density/2);
        w.cameraZoom.zoom = w.lastCameraZoom = zoom; w.camera.zoom = zoom; w.camera.updateProjectionMatrix();
        d.gameScreen.gameAnimationLoop.start(); d.gameScreen.pointer.unlock(true);
        document.querySelector('[data-campaign-diagnostic]')?.remove();
        return { id: actor.id, tile: [actor.tile.rx,actor.tile.ry], direction: actor.direction, health: actor.healthTrait?.health };
    }, { identity, density });
    report.before = await worldState(page);
    assert.equal(report.before.hash, report.restored.hash); assert.deepEqual(report.before.world, report.restored.world);
    assert.deepEqual(report.before.rng, report.restored.rng);
    if (density) await page.waitForFunction(() => window.__ra2debug.renderableManager
        .getRenderableByGameObject(window.__sourceNpcActionActor)?.shpRenderable?.builder?.hdOverride,
    undefined, { timeout: 60000 });
    const captured = new Set();
    for (let elapsed = 0; elapsed <= ticks; elapsed += 5) {
        if (elapsed) await stepWorld(page, Math.min(5, ticks-(elapsed-5)));
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const observation = await page.evaluate(() => {
            const d = window.__ra2debug, g = d.game, w = d.worldScene, actor = window.__sourceNpcActionActor;
            const all = g.world.getAllObjects(), carrier = all.find(unit => unit.transportTrait?.units.includes(actor));
            const renderable = d.renderableManager.getRenderableByGameObject(actor)?.shpRenderable;
            if (actor.isSpawned && actor.tile) {
                d.worldInteraction.minimapHandler.panToTile(actor.tile);
                w.updateCamera(w.cameraPan.getPan(), w.cameraZoom.getZoom());
            }
            const mesh = renderable?.getShapeMesh(), hd = renderable?.builder.getHdPage?.();
            let framing;
            if (actor.isSpawned && mesh) {
                const free = w.cameraPan.freeCamera, previous = free.value;
                free.value = true;
                try {
                    for (let pass = 0; pass < 3; pass++) {
                        const automatic = w.scene.matrixWorldAutoUpdate; w.scene.matrixWorldAutoUpdate = true;
                        try { w.scene.updateMatrixWorld(true); } finally { w.scene.matrixWorldAutoUpdate = automatic; }
                        const matrix = mesh.matrix.clone(), positions = mesh.geometry.getAttribute('position');
                        for (let parent = mesh.parent; parent; parent = parent.parent) matrix.premultiply(parent.matrix);
                        const points = Array.from({ length: positions.count }, (_, i) => w.camera.position.clone()
                            .set(positions.getX(i), positions.getY(i), positions.getZ(i)).applyMatrix4(matrix).project(w.camera));
                        const x = (Math.min(...points.map(p => p.x))+Math.max(...points.map(p => p.x)))*w.viewport.width/4;
                        const y = -(Math.min(...points.map(p => p.y))+Math.max(...points.map(p => p.y)))*w.viewport.height/4;
                        framing = { x, y };
                        const pan = w.cameraPan.getPan(); w.cameraPan.setPan({ x: pan.x+x, y: pan.y+y });
                        w.updateCamera(w.cameraPan.getPan(), w.cameraZoom.getZoom());
                    }
                } finally { free.value = previous; }
                d.renderableManager.getRenderableContainer().cullRenderables(w.viewport.width);
                w.meshBatchManager.updateMeshes(); d.renderer.render();
            }
            return { tick: g.currentTick, id: actor.id, spawned: actor.isSpawned, disposed: actor.isDisposed,
                removed: !all.includes(actor), carrier: carrier?.id, tile: actor.tile && [actor.tile.rx,actor.tile.ry],
                direction: actor.direction, frame: renderable?.builder.getFrame(),
                hd: !!hd && mesh?.material.type === 'HdSpriteMaterial' && mesh.material.map === hd.base,
                shadowFrame: renderable?.shadowRenderable?.builder?.getFrame(),
                shadowOverride: !!renderable?.shadowRenderable?.builder?.hdOverride,
                framing, glError: d.renderer.renderer.getContext().getError() };
        });
        assert.equal(observation.glError, 0); assert.equal(observation.shadowOverride, false);
        if (observation.spawned && observation.frame !== undefined) {
            assert.equal(observation.hd, density > 0);
            if (!captured.has(observation.frame)) {
                captured.add(observation.frame);
                observation.file = `natural-frame-${String(observation.frame).padStart(3,'0')}.png`;
                assert(Math.abs(observation.framing.x) < 1 && Math.abs(observation.framing.y) < 1,
                    'The naturally animated source actor must be centered before capture');
                const bytes = await page.screenshot({ path: path.join(out, observation.file) });
                const png = PNG.sync.read(bytes), colors = new Set();
                for (let y = Math.floor(png.height/3); y < png.height/2; y += 3)
                    for (let x = Math.floor(png.width/3); x < png.width/2; x += 3) {
                        const offset = (y*png.width+x)*4;
                        colors.add(png.data.subarray(offset,offset+3).toString('hex'));
                    }
                assert(colors.size > 16, 'The world capture must contain rendered scenery');
                observation.worldCaptureColors = colors.size;
            }
        }
        report.observations.push(observation);
        if ((report.observations.length%30) === 0) await fs.writeFile(path.join(out,'progress.json'),
            JSON.stringify({ tick: observation.tick, spawned: observation.spawned, removed: observation.removed,
                observedFrames: captured.size }, null, 2)+'\n');
    }
    report.after = await worldState(page);
    report.sourceOutcome = await page.evaluate(() => {
        const g = window.__ra2debug.game, actor = window.__sourceNpcActionActor;
        const flags = Object.fromEntries(g.campaign.machine.variables);
        return { disposed: actor.isDisposed, removed: !g.world.getAllObjects().includes(actor),
            rescueFlag: flags['3'], finalBaseFlag: flags['12'],
            teams: [...g.campaign.teams.instances.values()].filter(team => team.type === '0B0637DC')
                .map(team => ({ phase: team.phase, members: team.members.map(unit => ({ id: unit.id,
                    name: unit.name, spawned: unit.isSpawned, disposed: unit.isDisposed })) })) };
    });
    assert.equal(report.after.tick, report.before.tick+ticks);
    assert(captured.size > 1 && report.observations.some(row => row.carrier));
    assert(report.sourceOutcome.disposed && report.sourceOutcome.removed && report.sourceOutcome.rescueFlag
        && report.sourceOutcome.finalBaseFlag && report.sourceOutcome.teams.every(team => team.phase === 'finished'));
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_ORIGINAL_SOURCE_EINSTEIN_NATURAL_WALK_BOARDING_AND_TEAM_EXIT';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    await page?.screenshot({ path: path.join(out,'failure.png') }).catch(() => {});
} finally {
    await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n'); await app?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
