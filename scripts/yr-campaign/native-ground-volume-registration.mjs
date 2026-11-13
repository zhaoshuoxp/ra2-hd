import assert from 'node:assert/strict';
import path from 'node:path';
import { NativeCampaignPilot } from './native-pilot.mjs';

const mission = process.argv.find(v => v.startsWith('--mission='))?.slice(10) ?? 'all06umd.map';
const identity = process.argv.find(v => v.startsWith('--actor='))?.slice(8) ?? 'MTNK';
const pilot = new NativeCampaignPilot(process.argv[2], mission);
let failure;
try {
    await pilot.open();
    pilot.report.scope = 'Original source actor, complete selected HD family, frozen renderer-only heading and pitch/roll probes. No simulation actor, source, tasks, health, RNG or objective changes.';
    await pilot.page.evaluate(identity => {
        const d = window.__ra2debug, g = d.game;
        const actor = g.world.getAllObjects().find(o => o.name === identity && o.isSpawned && !o.isDestroyed);
        if (!actor) throw Error('Original actor absent: ' + identity);
        g.campaign.inspectionModified = true; g.mapShroudTrait.revealMap(g.localPlayer, g);
        window.__volumeActor = actor;
        d.gameScreen.pointer.unlock(true); d.worldInteraction.minimapHandler.panToTile(actor.tile);
    }, identity);
    await pilot.page.waitForFunction(() => !!window.__ra2debug.renderableManager
        .getRenderableByGameObject(window.__volumeActor)?.unitVxlHd, undefined, { timeout: 60000 });
    pilot.report.registration = await pilot.page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, actor = window.__volumeActor;
        d.gameScreen.gameAnimationLoop.stop();
        const r = d.renderableManager.getRenderableByGameObject(actor), hd = r.unitVxlHd;
        const before = { hash: g.getHash(), tick: g.currentTick, direction: actor.direction };
        const oldTilt = r.tiltObj.rotation.clone(), oldWrap = r.dirWrapObj.rotation.clone();
        const oldTurret = r.turret?.rotation.clone(), oldBarrel = r.barrel?.rotation.clone();
        const view = d.worldScene.camera.matrixWorldInverse;
        const v = r.posObj.position.clone(), rows = [];
        const projected = (points, matrix) => {
            const p = points.map(p => p.clone().applyMatrix4(matrix).applyMatrix4(view));
            return [Math.max(...p.map(p => p.x))-Math.min(...p.map(p => p.x)),
                Math.max(...p.map(p => p.y))-Math.min(...p.map(p => p.y))];
        };
        const sample = () => {
            r.tiltObj.updateMatrix(); r.dirWrapObj.updateMatrix();
            r.turret?.updateMatrix(); r.barrel?.updateMatrix();
            r.posObj.updateWorldMatrix(true, true); hd.update();
            const part = hd.layers.find(l => !l.turret && !l.rotor && l.frames[0]?.rigidSlope);
            const layer = part.frames.find(f => f.batch.visible), mesh = part.mesh;
            if (!layer || !hd.active) throw Error('The real ground HD hull is inactive');
            if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
            const b = mesh.geometry.boundingBox;
            const corners = [b.min.x,b.max.x].flatMap(x => [b.min.y,b.max.y]
                .flatMap(y => [b.min.z,b.max.z].map(z => v.clone().set(x,y,z))));
            const positions = layer.source.geometry.getAttribute('position');
            const vertices = Array.from({ length: positions.count }, (_, i) => v.clone().fromBufferAttribute(positions, i));
            const parts = hd.layers.map(l => l.frames.find(f => f.batch.visible)).filter(Boolean).map(f => {
                const p = f.source.geometry.getAttribute('position');
                const matrix = r.posObj.matrixWorld.clone().multiply(f.batch.matrix);
                return Array.from({ length:p.count }, (_,i) => {
                    const point = v.clone().fromBufferAttribute(p,i).applyMatrix4(matrix).applyMatrix4(view);
                    return [point.x,point.y];
                });
            });
            return { native: projected(corners, mesh.matrixWorld),
                image: projected(vertices, r.posObj.matrixWorld.clone().multiply(layer.batch.matrix)),
                parts, activeParts:parts.length };
        };
        try {
            for (const heading of [0,45,90,135,180,225,270,315]) {
                r.tiltObj.rotation.set(0, heading*Math.PI/180, 0); r.dirWrapObj.rotation.set(0, 0, 0);
                // Keep the actual turret's absolute bearing as the ordinary
                // vehicle renderer does when the hull turns underneath it.
                const joint = (Math.floor(actor.turretTrait.facing)-heading)*Math.PI/180;
                if (r.turret) r.turret.rotation.y = joint;
                if (r.barrel) r.barrel.rotation.y = joint;
                const flat = sample();
                for (const axis of ['x','z']) for (const tilt of [-.3,.3]) {
                    r.tiltObj.rotation.x = r.tiltObj.rotation.z = 0; r.tiltObj.rotation[axis] = tilt;
                    const slope = sample();
                    let shapeError = 0;
                    for (let part=0;part<flat.parts.length;part++) {
                        const original = flat.parts[part], current = slope.parts[part];
                        if (original.length !== current.length) throw Error('Slope changes component vertices');
                        for (let a=0;a<original.length;a++) for (let b=a+1;b<original.length;b++) {
                            const before = Math.hypot(original[a][0]-original[b][0],original[a][1]-original[b][1]);
                            const after = Math.hypot(current[a][0]-current[b][0],current[a][1]-current[b][1]);
                            if (before>.001) shapeError = Math.max(shapeError,Math.abs(after/before-1));
                        }
                    }
                    rows.push({ heading, axis, tilt, flat, slope,
                        shapeError,
                        widthRatioError: Math.abs(slope.image[0]/flat.image[0]-slope.native[0]/flat.native[0]),
                        heightRatioError: Math.abs(slope.image[1]/flat.image[1]-slope.native[1]/flat.native[1]) });
                }
            }
        } finally {
            r.tiltObj.rotation.copy(oldTilt); r.dirWrapObj.rotation.copy(oldWrap); sample();
            if (oldTurret) r.turret.rotation.copy(oldTurret);
            if (oldBarrel) r.barrel.rotation.copy(oldBarrel);
            sample();
        }
        return { identity: hd.family.identity, before,
            after: { hash: g.getHash(), tick: g.currentTick, direction: actor.direction }, rows,
            gl: d.renderer.renderer.getContext().getError() };
    });
    const r = pilot.report.registration;
    assert.equal(r.identity, identity); assert.deepEqual(r.before, r.after); assert.equal(r.gl, 0);
    assert.equal(r.rows.length, 32);
    assert(r.rows.every(r => r.shapeError < .005),
        'All projected hull, roof, track and turret edges must retain their accepted proportions');
    await pilot.page.screenshot({ path: path.join(pilot.out, 'native-restored-original-renderer-pose.png') });
    pilot.report.status = 'PASS_NATIVE_GENERIC_VXL_RIGID_PAINT_SHAPE_ALL_HEADINGS_PITCH_AND_ROLL';
} catch (error) { failure = error; }
await pilot.finish(failure);
