import assert from 'node:assert/strict';
import path from 'node:path';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'sov06lmd.map');
let failure;
try {
    await pilot.open();
    const target = await pilot.page.evaluate(() => {
        const d = window.__ra2debug, g = d.game;
        const u = g.localPlayer.getOwnedObjects().find(u => u.name === 'HTNK' && u.isSpawned && !u.isDestroyed);
        if (!u) throw Error('The original Moon tank force is absent');
        const tiles = g.map.tiles.getAll().filter(t => t.rampType > 0 && Math.hypot(t.rx-u.tile.rx, t.ry-u.tile.ry) < 20
            && g.map.mapBounds.isWithinPlayerBounds(t) && g.map.terrain.getPassableSpeed(t, u.rules.speedType, false, false) > 0
            && !g.map.getGroundObjectsOnTile(t).some(o => o.isBuilding() || o.isVehicle()))
            .sort((a,b) => Math.hypot(a.rx-u.tile.rx,a.ry-u.tile.ry)-Math.hypot(b.rx-u.tile.rx,b.ry-u.tile.ry));
        if (!tiles.length) throw Error('No reachable original nearby Moon ramp');
        const t = tiles[0], free = d.worldScene.cameraPan.freeCamera, previous = free.value; free.value = true;
        try { d.worldInteraction.minimapHandler.panToTile(t); } finally { free.value = previous; }
        return { id: u.id, tile: [t.rx, t.ry], ramp: t.rampType, height: t.z };
    });
    pilot.report.ramp = target;
    await pilot.commands.order(['HTNK'], 0, undefined, target.tile);
    pilot.report.slopes = [];
    let captured = false;
    for (let i = 0; i < 100; i++) {
        await pilot.commands.step(12, { defend: false });
        await pilot.page.waitForTimeout(40);
        const sample = await pilot.page.evaluate(() => {
            const d = window.__ra2debug, g = d.game;
            return { tick: g.currentTick, tanks: g.localPlayer.getOwnedObjects()
                .filter(u => u.name === 'HTNK' && u.isSpawned && !u.isDestroyed).map(u => {
                    const r = d.renderableManager.getRenderableByGameObject(u), hd = r?.rhinoHd;
                    let volume;
                    if (hd?.active) {
                        const layer = [...hd.layers].find(([key, l]) => key.startsWith('body') && l.batch.visible)?.[1];
                        const native = hd.originalMeshes[0];
                        if (layer && native) {
                            if (!native.geometry.boundingBox) native.geometry.computeBoundingBox();
                            const b = native.geometry.boundingBox, view = d.worldScene.camera.matrixWorldInverse;
                            const v = r.posObj.position.clone();
                            const corners = [b.min.x,b.max.x].flatMap(x => [b.min.y,b.max.y]
                                .flatMap(y => [b.min.z,b.max.z].map(z => v.clone().set(x,y,z))));
                            const size = (points, matrix) => {
                                const p = points.map(p => p.clone().applyMatrix4(matrix).applyMatrix4(view));
                                return [Math.max(...p.map(v=>v.x))-Math.min(...p.map(v=>v.x)),
                                    Math.max(...p.map(v=>v.y))-Math.min(...p.map(v=>v.y))];
                            };
                            const bearing = r.tiltObj.rotation.y + r.dirWrapObj.rotation.y;
                            const originalPose = r.tiltObj.matrix.clone().multiply(r.dirWrapObj.matrix)
                                .multiply(r.rockingTiltObj.matrix).multiply(r.mainObj.matrix)
                                .multiply(r.mainObj.matrix.clone().makeRotationY(-bearing));
                            const currentRelative = r.posObj.matrixWorld.clone().invert().multiply(native.matrixWorld);
                            const flat = r.posObj.matrixWorld.clone().multiply(originalPose.invert()).multiply(currentRelative);
                            const nativeFlat = size(corners, flat), nativeCurrent = size(corners, native.matrixWorld);
                            const points = array => Array.from({length:array.length/3},(_,i)=>v.clone().fromArray(array,i*3));
                            const imageFlat = size(points(layer.levelPositions), r.posObj.matrixWorld);
                            const imageCurrent = size(points(layer.source.geometry.getAttribute('position').array),
                                r.posObj.matrixWorld.clone().multiply(layer.batch.matrix));
                            const projected = (array, matrix) => points(array)
                                .map(p => p.applyMatrix4(matrix).applyMatrix4(view));
                            const flatPoints = projected(layer.levelPositions, r.posObj.matrixWorld);
                            const currentPoints = projected(layer.source.geometry.getAttribute('position').array,
                                r.posObj.matrixWorld.clone().multiply(layer.batch.matrix));
                            let shapeError = 0;
                            for (let a = 0; a < flatPoints.length; a++) for (let b = a+1; b < flatPoints.length; b++) {
                                const before = Math.hypot(flatPoints[a].x-flatPoints[b].x, flatPoints[a].y-flatPoints[b].y);
                                const after = Math.hypot(currentPoints[a].x-currentPoints[b].x, currentPoints[a].y-currentPoints[b].y);
                                if (before > .001) shapeError = Math.max(shapeError, Math.abs(after/before-1));
                            }
                            volume = { nativeFlat, nativeCurrent, imageFlat, imageCurrent, shapeError,
                                heightRatioError: Math.abs(imageCurrent[1]/imageFlat[1]-nativeCurrent[1]/nativeFlat[1]),
                                widthRatioError: Math.abs(imageCurrent[0]/imageFlat[0]-nativeCurrent[0]/nativeFlat[0]) };
                        }
                    }
                    return { id: u.id, tile: [u.tile.rx, u.tile.ry], ramp: u.tile.rampType, tilt: u.tilterTrait.tilt,
                        heading: u.direction, activeHd: !!hd?.active,
                        volume,
                        layers: hd && [...hd.layers].filter(([,l]) => l.batch.visible).map(([key,l]) => ({
                            key, attitude: l.attitudeKey, positions: Array.from(l.source.geometry.getAttribute('position').array) })) };
                }) };
        });
        pilot.report.slopes.push(sample);
        if (!captured && sample.tanks.some(u => u.ramp > 0 && Math.abs(u.tilt.pitch) > .1)) {
            await pilot.page.screenshot({ path: path.join(pilot.out, 'native-original-tanks-on-moon-ramp.png') }); captured = true;
        }
        if (captured && i > 10) break;
    }
    assert(captured, 'The ordinary source tank orders must cross a real Moon slope');
    const hd = pilot.report.slopes.flatMap(s => s.tanks).filter(u => u.activeHd && Math.abs(u.tilt.pitch) > .1);
    if (Number(process.argv.find(v => v.startsWith('--density='))?.slice(10)) > 0)
        assert(hd.length > 0 && hd.some(u => u.layers.every(l => l.attitude >= 0)), 'The actual dedicated Rhino renderer must use its rigid surface on slopes');
    if (Number(process.argv.find(v => v.startsWith('--density='))?.slice(10)) > 0) {
        assert(hd.every(u => u.volume && u.volume.shapeError < .005),
            'Every painted edge must retain its screen-space length on slopes; matching only the outer rectangle is insufficient');
    }
    await pilot.page.screenshot({ path: path.join(pilot.out, 'native-original-moon-terrain.png') });
    pilot.report.status = 'PASS_NATIVE_ORDINARY_MOON_TANK_MOVEMENT_AND_RIGID_HD_SLOPE_SURFACES';
} catch (error) { failure = error; }
await pilot.finish(failure);
