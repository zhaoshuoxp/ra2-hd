import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'sov01umd.map');
let failure;
try {
    await pilot.open();
    await pilot.page.evaluate(() => {
        const d = window.__ra2debug, g = d.game;
        const u = g.world.getAllObjects().find(u => u.name === 'DNOB' && u.isSpawned && !u.isDestroyed);
        if (!u) throw Error('The original water dinosaur is absent');
        window.__waterDinosaur = u.id;
        const free = d.worldScene.cameraPan.freeCamera, previous = free.value; free.value = true;
        try { d.worldInteraction.minimapHandler.panToTile(u.tile); } finally { free.value = previous; }
        window.__waterDinosaurFrames = [];
        function observe(time) {
            const r = d.renderableManager.getRenderableByGameObject(u), b = r?.shpRenderable?.builder;
            if (b?.mesh) {
                const f = b.hdOverride?.frames[b.frameNo];
                window.__waterDinosaurFrames.push({ time, tick: g.currentTick, frame: b.frameNo,
                    sequence: r.currentSequenceParams?.type, direction: r.computedDirection,
                    moving: u.isMoving, firing: u.isFiring, tile: [u.tile.rx, u.tile.ry],
                    position: u.position.worldPosition.toArray(), frameGeometry: f,
                    vertices: Array.from(b.mesh.geometry.getAttribute('position').array),
                    matrix: b.mesh.matrixWorld.toArray() });
            }
            window.__waterDinosaurRaf = requestAnimationFrame(observe);
        }
        window.__waterDinosaurRaf = requestAnimationFrame(observe);
        d.gameScreen.gameTurnMgr.setPaused(false); d.gameScreen.gameTurnMgr.setCampaignPaused(false);
    });
    for (let i = 0; i < 36; i++) {
        await pilot.page.waitForTimeout(160);
        await pilot.page.screenshot({ path: path.join(pilot.out, `native-water-frame-${String(i).padStart(2, '0')}.png`) });
    }
    pilot.report.frames = await pilot.page.evaluate(() => {
        cancelAnimationFrame(window.__waterDinosaurRaf);
        window.__ra2debug.gameScreen.gameTurnMgr.setPaused(true);
        return window.__waterDinosaurFrames;
    });
    assert(pilot.report.frames.length > 30);
    pilot.report.poseSequenceCounts = Object.fromEntries([...new Set(pilot.report.frames.map(f => f.sequence))]
        .map(sequence => [sequence, pilot.report.frames.filter(f => f.sequence === sequence).length]));
    assert(!pilot.report.frames.some(f => [9, 10].includes(f.sequence)),
        'Aquatic DNOB must not fall back to incompatible land-idle silhouettes');
    await fs.writeFile(path.join(pilot.out, 'frames.json'), JSON.stringify(pilot.report.frames, null, 2) + '\n');
    delete pilot.report.frames;
    assert.deepEqual(pilot.report.errors, []); assert.deepEqual(pilot.report.failedResources, []);
    pilot.report.status = 'OBSERVED_CONTINUOUS_NATIVE_WATER_DINOSAUR_SILHOUETTE_AND_POSE_GEOMETRY';
} catch (error) { failure = error; }
await pilot.finish(failure);
