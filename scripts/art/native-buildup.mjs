// Controlled native construction/sale and complete same-phase GPU review.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startSession } from '../m1/yuri-units/desktop-session.mjs';

const [receipt, authoringFile, output, edition = 'yr', theater = 'TEMPERATE', mode = '4'] = process.argv.slice(2);
const authoring = JSON.parse(await fs.readFile(authoringFile));
const density = Number(mode), original = density === 1;
const ownerColorId = Number(process.argv.find(arg => arg.startsWith('--owner='))?.slice(8) ?? 1);
assert(Number.isInteger(ownerColorId) && ownerColorId >= 0 && ownerColorId < 8);
const scoped = authoring.families.filter(f => f.theater === theater
    && (!f.editions || f.editions.includes(edition)));
const families = authoring.scope === 'ALL_SELECTED_BUILDUP_SEQUENCES'
    ? [...new Set(scoped.map(f => f.identity))]
    : ['GACNST', 'GAWEAP', 'GATECH', 'NAWEAP', 'NALASR', 'NAPSIS',
        ...(edition === 'yr' ? ['YABRCK', 'YAWEAP', 'YATECH'] : [])];
if (authoring.scope === 'ALL_SELECTED_BUILDUP_SEQUENCES' && families.includes('GAAIRC')
    && !families.includes('AMRADR')) families.push('AMRADR');
const only = process.argv.find(arg => arg.startsWith('--families='))?.slice(11).split(',');
if (only) families.splice(0, families.length, ...families.filter(name => only.includes(name)));
const session = await startSession(receipt, output, edition, theater === 'SNOW', async ({ page }) => {
    await page.evaluate(({ density, original }) => {
        const graphics = window.__ra2debug.generalOptions.graphics;
        graphics.hdEnabled.value = !original;
        graphics.hdDensity.value = density === 4 ? 4 : 2;
        graphics.models.value = 1;
        graphics.shadows.value = 3;
    }, { density, original });
}, undefined, theater === 'NEWURBAN' ? (process.env.BUILDUP_NEWURBAN_MAP ?? 'RushHr.map') : undefined, ownerColorId);
const { page, report, out, startClip, stopClip, close } = session;
report.scope = { density, theater, families, original, ownerColorId };
report.ownerColor = await page.evaluate(id => {
    const d = window.__ra2debug, actual = d.localPlayer.color;
    const expected = [...d.game.rules.getMultiplayerColors().values()][id];
    return { actual: [actual.r, actual.g, actual.b], expected: [expected.r, expected.g, expected.b] };
}, ownerColorId);
assert.deepEqual(report.ownerColor.actual, report.ownerColor.expected, 'Actual native player palette');
report.cases = {};
let failure;
try {
    assert.equal(await page.evaluate(() => window.__ra2debug.theater.type),
        { TEMPERATE: 1, SNOW: 4, NEWURBAN: 32 }[theater], 'Actual native map theater');
    await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied, g = d.game;
        f.initialUnits = new Set(g.getWorld().getAllObjects().filter(o => o.isUnit()).map(o => o.id));
        f.reverseBuildup = building => {
            if (building.name !== 'YAREFN') {
                d.actionsApi.sellBuilding(building.id);
                return 'NATIVE_SELL';
            }
            const worker = g.getConstructionWorker(f.player), origin = building.tile;
            const target = g.map.tiles.getAll().filter(t => g.map.isWithinBounds(t)
                && Math.hypot(t.rx - origin.rx, t.ry - origin.ry) >= 3
                && worker.canPlaceAt('YAREFN', t, { ignoreAdjacent: true }))
                .sort((a, b) => Math.hypot(a.rx - origin.rx, a.ry - origin.ry)
                    - Math.hypot(b.rx - origin.rx, b.ry - origin.ry))[0];
            if (!target) throw Error('No legal native Slave Miner movement target');
            d.actionsApi.orderUnits([building.id], 0, target.rx, target.ry);
            return 'NATIVE_MOVE_ORDER_UNDEPLOY';
        };
        f.place = name => {
            g.mapShroudTrait.revealMap(f.player, g);
            const worker = g.getConstructionWorker(f.player);
            const near = name === 'YAREFN' ? g.map.tiles.getAll().find(t => g.map.isWithinBounds(t)
                && g.map.getObjectsOnTile(t).some(o => o.isOverlay() && o.isTiberium())) : f.center;
            if (!near) throw Error('No native ore field for the Slave Miner fixture');
            const tile = g.map.tiles.getAll().filter(t => g.map.isWithinBounds(t)
                && worker.canPlaceAt(name, t, { normalizedTile: true, ignoreAdjacent: true }))
                .sort((a, b) => Math.hypot(a.rx - near.rx, a.ry - near.ry)
                    - Math.hypot(b.rx - near.rx, b.ry - near.ry))[0];
            if (!tile) throw Error('No native foundation for ' + name);
            return worker.placeAt(name, tile, true)[0];
        };
        f.focus = building => d.worldInteraction.minimapHandler.panToTile(building.tile);
        const render = d.renderer.render;
        d.renderer.render = function (...args) {
            const b = f.current, r = b && d.renderableManager.getRenderableByGameObject(b);
            if (r && f.samples.length < 500) {
                const type = r.currentAnimType, o = r.animObjects.get(type)?.[0], a = r.animations.get(o);
                f.samples.push({ time: performance.now(), tick: g.currentTick, type, status: b.buildStatus,
                    mainVisible: r.mainObj?.get3DObject().visible, turretVisible: r.turret?.visible,
                    mkVisible: o?.get3DObject().visible,
                    frame: a?.getCurrentFrame(), displayed: o?.builder.getFrame(), start: a?.props.start,
                    end: a?.props.end, rate: a?.props.rate, hdIdentity: o?.builder.hdOverride?.identity,
                    hdDensity: d.sovietUnitsHd?.families[b.name === 'AMRADR' ? 'GAAIRC' : b.name]?.density
                        ?? d.sovietBuildingsHd?.[b.name === 'AMRADR' ? 'GAAIRC' : b.name]?.density
                        ?? (b.name === 'GAPOWR' ? d.powerPlantHd?.density : b.name === 'NAPOWR' ? d.napowrHd?.density : undefined) });
            }
            return render.apply(this, args);
        };
        f.samples = [];
        // Native minimap centering is a capture fixture, not a camera-setting
        // or gameplay change. Keep external edge-pan input out of the footage.
        f.captureFocusTimer = setInterval(() => {
            const building = f.current;
            if (building?.isSpawned && !building.isDestroyed) f.focus(building);
        }, 16);
    });
    report.captureFocusPolicy = 'Repeated native minimap centering; camera settings and game rules unchanged';
    for (const name of families) {
        // Keep the fixture pointer away from map edges so native edge-panning
        // cannot move the camera away while a recording is in progress.
        const pointerCenter = await page.evaluate(() => ({ x: innerWidth / 2, y: innerHeight / 2 }));
        await page.mouse.move(pointerCenter.x, pointerCenter.y);
        const candidate = scoped.find(f => f.identity === (name === 'AMRADR' ? 'GAAIRC' : name)
            && (name !== 'NAPSIS' || (edition === 'yr' ? f.side === 'yuri' : f.side !== 'yuri')));
        assert(candidate, `${edition}/${theater}/${name}: selected source`);
        const row = report.cases[name] = { expectedMemberSha256: candidate.newMember.sha256, frames: candidate.frames };
        // The first placed native building retains a live family lease; the
        // second construction consequently tests repaired HD from its start.
        await page.evaluate(name => {
            const f = window.__allied;
            f.samples = []; f.warm = f.place(name); f.focus(f.warm);
        }, name);
        await page.waitForFunction(({ density, original }) => {
            const d = window.__ra2debug, f = window.__allied;
            const r = d.renderableManager.getRenderableByGameObject(f.warm);
            return f.warm.buildStatus === 1 && r?.currentAnimType !== 5 && (original
                || r?.mainObj?.builder.hdOverride
                    && (d.sovietUnitsHd.families[f.warm.name === 'AMRADR' ? 'GAAIRC' : f.warm.name]?.density
                        ?? d.sovietBuildingsHd[f.warm.name === 'AMRADR' ? 'GAAIRC' : f.warm.name]?.density
                        ?? (f.warm.name === 'GAPOWR' ? d.powerPlantHd.density : d.napowrHd.density)) === density);
        }, { density, original }, { timeout: 60000 });
        await startClip();
        await page.evaluate(name => {
            const f = window.__allied;
            f.samples = []; f.current = f.place(name); f.focus(f.current);
        }, name);
        await page.waitForFunction(() => {
            const d = window.__ra2debug, f = window.__allied;
            return f.current.buildStatus === 1 && d.renderableManager.getRenderableByGameObject(f.current)?.currentAnimType !== 5;
        }, undefined, { timeout: 20000 });
        await page.waitForTimeout(750);
        row.readyState = await page.evaluate(() => {
            const d = window.__ra2debug, b = window.__allied.current;
            const r = d.renderableManager.getRenderableByGameObject(b);
            const screenBounds = mesh => {
                if (!mesh?.geometry?.attributes?.position) return undefined;
                mesh.updateWorldMatrix(true, false);
                const positions = mesh.geometry.attributes.position;
                const points = Array.from({ length: positions.count }, (_, i) => {
                    const point = r.getPosition().clone().set(positions.getX(i), positions.getY(i), positions.getZ(i));
                    point.applyMatrix4(mesh.matrixWorld).project(d.worldScene.camera);
                    return [point.x, point.y];
                });
                return [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])),
                    Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
            };
            return { status: b.buildStatus, type: r.currentAnimType,
                mainVisible: r.mainObj?.get3DObject().visible,
                turretVisible: r.turret?.visible,
                mainIdentity: r.mainObj?.builder.hdOverride?.identity,
                spriteGeometry: [r.mainObj, r.bib, ...[...r.animObjects.values()].flat()].filter(Boolean).map(o => ({
                    visible: o.get3DObject().visible, frame: o.builder.getFrame(),
                    animation: r.animations.get(o) && { start: r.animations.get(o).props.start,
                        end: r.animations.get(o).props.end, rate: r.animations.get(o).props.rate },
                    frameOffset: o.builder.frameOffset, size: o.builder.shpSize, offset: o.builder.offset,
                    identity: o.builder.hdOverride?.identity,
                    screenBounds: screenBounds(o.getShapeMesh()),
                    sourceMember: [...r.aggregatedImageData.imageIndexes].find(([, index]) => index === o.builder.frameOffset)?.[0]?.filename,
                })),
                turretGeometry: r.buildingTurretHd && { facing: b.turretTrait.facing,
                    screenBounds: screenBounds([...r.buildingTurretHd.meshes.values()].find(([, m]) => m.visible)?.[1]),
                    position: r.turret.position.toArray(), contract: r.buildingTurretHd.resources.contract },
                buildupVisible: (r.animObjects.get(5) ?? []).map(o => o.get3DObject().visible),
                activeVisible: (r.animObjects.get(2) ?? []).map(o => o.get3DObject().visible),
                glError: d.renderer.renderer.getContext().getError() };
        });
        assert.equal(row.readyState.status, 1);
        assert.notEqual(row.readyState.type, 5);
        assert.equal(row.readyState.mainVisible, true);
        assert(row.readyState.buildupVisible.every(visible => !visible), `${name}: MK hidden after completion`);
        assert.equal(row.readyState.glError, 0);
        const visibleBounds = row.readyState.spriteGeometry[0]?.screenBounds;
        assert(visibleBounds && visibleBounds.every(value => Math.abs(value) < .95), `${name}: recorded building is outside the viewport`);
        row.readyScreenshot = path.join(out, name + '-native-ready.png');
        await page.screenshot({ path: row.readyScreenshot });
        row.construction = await page.evaluate(() => window.__allied.samples);
        const samples = row.construction.filter(s => s.type === 5);
        assert(samples.length > 3 && new Set(samples.map(s => s.frame)).size > 3, `${name}: native intermediate phases`);
        assert.equal(new Set(samples.map(s => !!s.hdIdentity)).size, 1, `${name}: no mid-sequence publication`);
        if (original) assert(samples.every(s => !s.hdIdentity));
        else assert(samples.every(s => s.hdIdentity?.includes(candidate.newMember.sha256)
            && s.hdDensity === density), `${name}: requested repaired member/density bound in-match`);
        if (!original && candidate.componentRig?.terminalCompletionOverlay) {
            const terminal = samples.filter(s => s.frame === candidate.frames-1);
            assert(terminal.length && terminal.every(s => s.mainVisible && s.turretVisible && !s.mkVisible),
                `${name}: actual retained terminal assembly during native construction`);
            row.terminalAssemblySamples = terminal.length;
        }
        if (!original && candidate.componentRig?.retainedIdleCompletion) {
            const terminal = samples.filter(s => s.displayed === candidate.frames - 1);
            assert(terminal.length && terminal.every(s => s.mainVisible && !s.mkVisible),
                `${name}: actual retained idle presentation at the construction terminal`);
            row.retainedIdleCompletionSamples = terminal.length;
        }
        row.buildClip = await stopClip(name + '-native-build');
        const captureCenter = await page.evaluate(() => ({ x: innerWidth / 2, y: innerHeight / 2 }));
        await page.mouse.move(captureCenter.x, captureCenter.y);
        await page.evaluate(() => window.__allied.focus(window.__allied.current));
        await page.waitForFunction(() => {
            const d = window.__ra2debug;
            const r = d.renderableManager.getRenderableByGameObject(window.__allied.current);
            const position = r?.getPosition().clone().project(d.worldScene.camera);
            return position && Math.abs(position.x) < .6 && Math.abs(position.y) < .6;
        }, undefined, { timeout: 10000 });
        if (!original) {
            // Same-time direct renderer reads: all MK phases, plus an untouched
            // Original control for each phase. Freeze is confined to this harness.
            const sheet = await page.evaluate(async ({ count }) => {
                const d = window.__ra2debug, f = window.__allied, loop = d.gameScreen.gameAnimationLoop;
                const r = d.renderableManager.getRenderableByGameObject(f.current);
                loop.stop();
                const time = performance.now(), update = r.update;
                r.setAnimation(5, time); r.update = () => {};
                const objects = r.animObjects.get(5), props = r.animations.get(objects[0]).props;
                const overrides = objects.map(o => o.builder.hdOverride);
                const cell = 512, columns = 5, rows = Math.ceil(count / columns);
                const canvas = document.createElement('canvas');
                canvas.width = columns * cell; canvas.height = rows * cell * 2;
                const ctx = canvas.getContext('2d');
                const glCanvas = d.renderer.renderer.domElement, v = d.worldScene.viewport;
                const position = r.getPosition().clone().project(d.worldScene.camera), ratio = glCanvas.width / d.renderer.width;
                const x = (v.x + (position.x + 1) * v.width / 2) * ratio;
                const y = (v.y + (1 - position.y) * v.height / 2) * ratio;
                if (![x, y].every(Number.isFinite) || x < 0 || y < 0 || x > glCanvas.width || y > glCanvas.height)
                    throw Error('Native fixture is outside the captured renderer viewport');
                const poses = [];
                try {
                    for (let phase = 0; phase < count; phase++) {
                        const native = props.start + phase;
                        objects.forEach(o => o.setFrame(native));
                        for (const pass of [0, 1]) {
                            objects.forEach((o, i) => o.builder.setHdOverride(pass ? undefined : overrides[i]));
                            r.buildingTurretHd?.update();
                            r.updateConstructionCompletion?.();
                            if (pass) {
                                if (r.mainObj) r.mainObj.get3DObject().visible = false;
                                if (r.bib) r.bib.get3DObject().visible = false;
                                if (r.turret) r.turret.visible = false;
                                for (const type of [0,2,3]) for (const sprite of r.animObjects.get(type) ?? [])
                                    sprite.get3DObject().visible = false;
                                objects.forEach(o => o.get3DObject().visible = true);
                            }
                            d.renderer.update(time, .5); d.renderer.render();
                            ctx.drawImage(glCanvas, x - cell / 2, y - cell * .65, cell, cell,
                                phase % columns * cell, (Math.floor(phase / columns) * 2 + pass) * cell, cell, cell);
                        }
                        poses.push({ phase, displayed: objects.map(o => o.builder.getFrame()), nativeFrame: native });
                    }
                } finally {
                    objects.forEach((o, i) => o.builder.setHdOverride(overrides[i]));
                    r.update = update; r.setAnimation(0, time); d.renderer.update(time, .5); d.renderer.render(); loop.start();
                }
                // Compare terminal MK and retained idle at the identical building tile,
                // camera crop and frozen time; ready visibility alone is insufficient.
                const transition = document.createElement('canvas');
                transition.width = cell * 2; transition.height = cell;
                const tc = transition.getContext('2d');
                loop.stop(); r.update = () => {};
                try {
                    r.setAnimation(5, time);
                    objects.forEach(o => o.setFrame(props.end));
                    r.buildingTurretHd?.update(); r.updateConstructionCompletion?.();
                    d.renderer.update(time, .5); d.renderer.render();
                    tc.drawImage(glCanvas, x-cell/2, y-cell*.65, cell, cell, 0, 0, cell, cell);
                    r.setAnimation(0, time);
                    for (const sprites of r.animObjects.values()) for (const sprite of sprites) {
                        if (sprite.get3DObject().visible) sprite.setFrame(r.animations.get(sprite).props.start);
                    }
                    r.buildingTurretHd?.update(); r.updateConstructionCompletion?.();
                    d.renderer.update(time, .5); d.renderer.render();
                    const geometry = sprite => {
                        const mesh = sprite.getShapeMesh(); mesh.updateWorldMatrix(true,false);
                        const a = mesh.geometry.attributes.position;
                        const vertices = Array.from({length:a.count},(_,i) => {
                            const p=r.getPosition().clone().set(a.getX(i),a.getY(i),a.getZ(i));
                            p.applyMatrix4(mesh.matrixWorld).project(d.worldScene.camera);return p;
                        });
                        return {frame:sprite.builder.getFrame(),frameOffset:sprite.builder.frameOffset,
                            sourceMember:[...r.aggregatedImageData.imageIndexes].find(([,i])=>i===sprite.builder.frameOffset)?.[0]?.filename,
                            screenBounds:[Math.min(...vertices.map(p=>p.x)),Math.min(...vertices.map(p=>p.y)),
                                Math.max(...vertices.map(p=>p.x)),Math.max(...vertices.map(p=>p.y))],
                            depth:vertices.reduce((s,p)=>s+p.z,0)/vertices.length};
                    };
                    const initialIdleGeometry = [r.mainObj,r.bib,...[...r.animObjects.values()].flat()]
                        .filter(sprite=>sprite?.get3DObject().visible).map(geometry);
                    tc.drawImage(glCanvas, x-cell/2, y-cell*.65, cell, cell, cell, 0, cell, cell);
                    transition.initialIdleGeometry=initialIdleGeometry;
                } finally { r.update = update; loop.start(); }
                return { png: canvas.toDataURL(), transitionPng: transition.toDataURL(),
                    initialIdleGeometry:transition.initialIdleGeometry, poses, start: props.start, end: props.end,
                    glError: d.renderer.renderer.getContext().getError() };
            }, { count: candidate.frames });
            assert.equal(sheet.glError, 0);
            assert.equal(sheet.end - sheet.start + 1, candidate.frames);
            row.nativeSheet = path.join(out, name + '-same-phase-native.png');
            await fs.writeFile(row.nativeSheet, Buffer.from(sheet.png.split(',')[1], 'base64'));
            row.terminalTransition = path.join(out, name + '-terminal-to-idle.png');
            await fs.writeFile(row.terminalTransition, Buffer.from(sheet.transitionPng.split(',')[1], 'base64'));
            delete sheet.png; delete sheet.transitionPng; row.poseCheck = sheet;
        }
        await startClip();
        row.reverseAction = await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied;
            f.samples = []; return f.reverseBuildup(f.current);
        });
        await page.waitForFunction(() => !window.__allied.current.isSpawned, undefined, { timeout: 20000 });
        row.sale = await page.evaluate(() => window.__allied.samples);
        row.saleClip = await stopClip(name + '-native-sale');
        assert(row.sale.some(s => s.type === 6), `${name}: native reverse sequence`);
        if (!original) assert(row.sale.filter(s => s.type === 6).every(s => s.hdIdentity?.includes(candidate.newMember.sha256)));
        row.status = original ? 'PASS_NATIVE_ORIGINAL_BUILDUP_AND_SALE'
            : 'PASS_NATIVE_REPAIRED_BUILDUP_PHASES_BINDING_AND_SALE';
        console.log(JSON.stringify({ edition, theater, density, name, status: row.status }));
        await fs.writeFile(path.join(out, 'buildup-cases.json'), JSON.stringify(report.cases, null, 2) + '\n');
        if (authoring.scope === 'ALL_SELECTED_BUILDUP_SEQUENCES') {
            await page.evaluate(() => window.__allied.reverseBuildup(window.__allied.warm));
            await page.waitForFunction(() => !window.__allied.warm.isSpawned, undefined, { timeout: 20000 });
            await page.evaluate(() => {
                const f = window.__allied, g = window.__ra2debug.game;
                for (const unit of g.getWorld().getAllObjects().filter(o => o.isUnit() && !f.initialUnits.has(o.id)))
                    if (unit.isSpawned) g.unspawnObject(unit);
            });
        }
    }
    assert.equal(await page.evaluate(() => window.__ra2debug.renderer.renderer.getContext().getError()), 0);
    assert.deepEqual(report.errors, []);
} catch (error) { failure = error; }
await close(failure);
if (failure) throw failure;
