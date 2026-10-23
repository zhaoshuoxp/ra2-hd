import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const artifact = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
const out = path.resolve(process.argv[3]);
await fs.mkdir(out, { recursive: false });
const profile = path.join(out, 'profile');
await fs.mkdir(profile);
await fs.writeFile(
    path.join(profile, 'resource-registration.json'),
    JSON.stringify({ schemaVersion: 1, directory: path.resolve('.local') }),
);
const report = {
    status: 'RUNNING',
    errors: [],
    stages: [],
    app: artifact.artifact,
    disclosure:
        'Legal-foundation prerequisite fixtures; native Soviet MCV production, movement, construction-yard deployment and repacking. Paused owner/bearing/opacity comparisons are controlled rendering checks. Rules, cost, camera, weapons and terrain remain unchanged.',
};
const save = () =>
    fs.writeFile(path.join(out, 'result.json'), JSON.stringify(report, null, 2) + '\n');
const stage = async (name, data) => {
    report.stages.push({ name, data });
    await save();
    console.log(name, JSON.stringify(data));
};
const app = await electron.launch({
    executablePath: artifact.executable,
    cwd: '/private/tmp',
    env: { ...process.env, RA2_DESKTOP_USER_DATA: profile, RA2_DESKTOP_NO_DISCOVERY: '1' },
    timeout: 60000,
});
let page;
try {
    page = await app.firstWindow();
    page.on('pageerror', (e) => report.errors.push(e.stack));
    await page.getByText('Offline Skirmish', { exact: true }).waitFor({ timeout: 90000 });
    await page.evaluate(() => {
        const d = window.__ra2debug;
        d.generalOptions.graphics.hdEnabled.value = true;
        d.generalOptions.graphics.renderResolution.value = '1080p';
        Object.entries({
            _r_lastMap: 'MP01T4.map',
            _r_lastMode: '1',
            _r_lastCountry: '5',
            _r_lastColor: '1',
            _r_lastStartPos: '0',
            _r_lastTeam: '0',
            _r_hostOpts: '6;10000;0;1;1;0;1;0;;0;1;0;0',
            _r_lastBots: JSON.stringify([
                null,
                null,
                null,
                { d: 4, c: 5, co: 2, s: 3, t: 1 },
                null,
                null,
                null,
                null,
            ]),
        }).forEach(([k, v]) => localStorage.setItem(k, v));
    });
    await page.getByText('Offline Skirmish', { exact: true }).click();
    await page.waitForFunction(() => window.__ra2debug?.skirmishLobby);
    await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000000));
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, {
        timeout: 90000,
    });
    report.fixtures = await page.evaluate(() => {
        const d = window.__ra2debug,
            g = d.game,
            p = d.localPlayer;
        const worker = g.getConstructionWorker(p),
            center = p.getOwnedObjects().find((o) => /MCV$/.test(o.name)).tile;
        const before = p.production.isAvailableForProduction(g.rules.getObject('SMCV', 7)),
            rows = [];
        for (const name of ['NAPOWR', 'NAPOWR', 'NAHAND', 'NAREFN', 'NAWEAP', 'NARADR', 'NADEPT']) {
            const tiles = g.map.tiles
                .getAll()
                .filter(
                    (t) =>
                        g.map.mapBounds.isWithinBounds(t) &&
                        worker.canPlaceAt(
                            name,
                            { rx: t.rx, ry: t.ry },
                            { normalizedTile: true, ignoreAdjacent: true },
                        ),
                );
            tiles.sort(
                (a, b) =>
                    Math.hypot(a.rx - center.rx, a.ry - center.ry) -
                    Math.hypot(b.rx - center.rx, b.ry - center.ry),
            );
            if (!tiles.length) throw Error('No legal foundation for ' + name);
            const b = g.createObject(2, name);
            g.changeObjectOwner(b, p);
            g.spawnObject(b, tiles[0]);
            rows.push({ name, tile: [b.tile.rx, b.tile.ry] });
        }
        return {
            before,
            after: p.production.isAvailableForProduction(g.rules.getObject('SMCV', 7)),
            rows,
            country: p.country.name,
        };
    });
    await stage('prerequisites', report.fixtures);
    assert(!report.fixtures.before && report.fixtures.after);
    await page.waitForTimeout(2500);
    await page.evaluate(() => {
        const d = window.__ra2debug;
        window.__initialMcvs = d.localPlayer
            .getOwnedObjects()
            .filter((o) => o.name === 'SMCV')
            .map((o) => o.id);
        d.actionsApi.queueForProduction(3, 7, 'SMCV', 1);
    });
    await page.waitForFunction(
        () =>
            window.__ra2debug.localPlayer
                .getOwnedObjects()
                .some((o) => o.name === 'SMCV' && !window.__initialMcvs.includes(o.id)),
        undefined,
        { timeout: 120000 },
    );
    await page.waitForFunction(
        () => ['READY', 'FAILED'].includes(window.__ra2debug.sovietUnitsHd.families.SMCV.status),
        undefined,
        { timeout: 30000 },
    );
    await stage('selection', await page.evaluate(() => window.__ra2debug.sovietUnitsHd));
    report.production = await page.evaluate(() => {
        const d = window.__ra2debug,
            u = d.localPlayer
                .getOwnedObjects()
                .find((o) => o.name === 'SMCV' && !window.__initialMcvs.includes(o.id));
        window.__mcv = u;
        window.__mcvTrace = [];
        window.__sampleTruck = () => {
            const r = d.renderableManager.getRenderableByGameObject(u),
                hd = r?.unitVxlHd;
            const layers =
                hd?.layers
                    .flatMap((p) => p.frames)
                    .filter((f) => f.batch.visible || f.translucent.visible) ?? [];
            return {
                tick: d.game.currentTick,
                hd: !!hd?.active,
                headings: layers.map((l) => l.frame.heading),
                bound:
                    layers.length > 0 &&
                    layers.every(
                        (l) =>
                            l.batch.material.map === l.part.override.pages[0].base &&
                            l.batch.material.uniforms.remapMap.value ===
                                l.part.override.pages[0].data,
                    ),
                moving: u.isMoving,
                direction: u.direction,
                tile: [u.tile.rx, u.tile.ry],
                health: u.healthTrait.health,
                spawned: u.isSpawned,
                destroyed: u.isDestroyed,
                renderer: !!r,
                targetHealth: window.__mcvTarget?.healthTrait.health,
                gl: d.renderer.renderer.getContext().getError(),
            };
        };
        window.__mcvTimer = setInterval(() => window.__mcvTrace.push(window.__sampleTruck()), 20);
        d.worldInteraction.minimapHandler.panToTile(u.tile);
        return {
            cost: u.rules.cost,
            country: d.localPlayer.country.name,
            sample: window.__sampleTruck(),
        };
    });
    await stage('native-production', report.production);
    assert(report.production.sample.hd && report.production.sample.bound);
    assert.equal(report.production.cost, 3000);
    report.recording = await page.evaluate(() => {
        const d = window.__ra2debug,
            canvas = d.renderer.renderer.domElement,
            stream = canvas.captureStream(15);
        const mimeType = 'video/webm;codecs=vp9',
            recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8000000 });
        window.__videoChunks = [];
        recorder.ondataavailable = (e) => {
            if (e.data.size) window.__videoChunks.push(e.data);
        };
        window.__nativeRecorder = recorder;
        window.__nativeVideoStream = stream;
        recorder.start(1000);
        const hd = d.renderableManager.getRenderableByGameObject(window.__mcv).unitVxlHd;
        window.__mcvTextures = hd.family.parts.flatMap((p) =>
            p.override.pages.flatMap((p) => [p.base, p.data, p.tiles.map]),
        );
        return {
            width: canvas.width,
            height: canvas.height,
            fps: 15,
            mimeType,
            cameraZoom: d.worldScene.camera.zoom,
        };
    });
    await page.evaluate(() => {
        const d = window.__ra2debug,
            g = d.game,
            u = window.__mcv;
        const tiles = g.map.tiles.getAll(),
            free = (t) =>
                t &&
                !t.rampType &&
                g.map.mapBounds.isWithinBounds(t) &&
                g.map.terrain.getPassableSpeed(t, u.rules.speedType, false, false) > 0 &&
                !g.map.tileOccupation
                    .getObjectsOnTile(t)
                    .some((o) => o.isTechno() || o.isTerrain());
        const candidates = tiles.filter(
            (t) => free(t) && free(tiles.find((v) => v.rx === t.rx + 5 && v.ry === t.ry)),
        );
        candidates.sort(
            (a, b) =>
                Math.hypot(a.rx - u.tile.rx, a.ry - u.tile.ry) -
                Math.hypot(b.rx - u.tile.rx, b.ry - u.tile.ry),
        );
        window.__mcvDestination = candidates.find(
            (t) => Math.hypot(t.rx - u.tile.rx, t.ry - u.tile.ry) > 5,
        );
        if (!window.__mcvDestination) throw Error('No clear test ground');
        g.mapShroudTrait.revealMap(d.localPlayer, g);
        const t = window.__mcvDestination;
        d.actionsApi.orderUnits([u.id], 0, t.rx, t.ry);
    });
    await page.waitForFunction(
        () => {
            const u = window.__mcv,
                t = window.__mcvDestination;
            return !u.isMoving && u.tile.rx === t.rx && u.tile.ry === t.ry;
        },
        undefined,
        { timeout: 90000 },
    );
    await stage('native-movement', await page.evaluate(() => window.__sampleTruck()));
    await page.evaluate(() => {
        const d = window.__ra2debug,
            g = d.game,
            u = window.__mcv;
        d.gameScreen.gameAnimationLoop.stop();
        d.gameScreen.pointer.unlock();
        d.worldInteraction.minimapHandler.panToTile(u.tile);
        const civilian = g.createUnitForPlayer(g.rules.getObject('AMCV', 7), d.localPlayer);
        g.spawnObject(
            civilian,
            g.map.tiles.getAll().find((t) => t.rx === u.tile.rx + 3 && t.ry === u.tile.ry),
        );
        window.__civilian = civilian;
    });
    await page.waitForTimeout(200);
    report.sweep = [];
    for (const owner of [0, 1])
        for (const yaw of [
            0, 22, 45, 67, 90, 112, 135, 157, 180, 202, 225, 247, 270, 292, 315, 337,
        ]) {
            const pair = [];
            for (const role of ['original', 'hd']) {
                const row = await page.evaluate(
                    ({ owner, yaw, role }) => {
                        const d = window.__ra2debug,
                            u = window.__mcv,
                            r = d.renderableManager.getRenderableByGameObject(u),
                            hd = r.unitVxlHd;
                        const player = owner
                            ? d.game.getCombatants().find((p) => p !== d.localPlayer)
                            : d.localPlayer;
                        if (u.owner !== player) d.game.changeObjectOwner(u, player);
                        r.update(0, 0);
                        r.updateVxlRotation(yaw, true);
                        hd.update();
                        if (role === 'original') {
                            hd.meshes.forEach((m, i) => (m.material = hd.originals[i]));
                            hd.shadow.update(false, 1);
                            hd.layers.forEach((p) =>
                                p.frames.forEach((f) =>
                                    [f.batch, f.depth, f.translucent].forEach(
                                        (m) => (m.visible = false),
                                    ),
                                ),
                            );
                        }
                        d.worldScene.scene.updateMatrixWorld(true);
                        d.worldScene.meshBatchManager.updateMeshes();
                        d.worldScene.meshBatchManager.processRenderQueue();
                        d.renderer.render();
                        const renderer = d.renderer.renderer,
                            ratio = renderer.domElement.width / d.renderer.width;
                        const p = r.posObj.position
                                .clone()
                                .set(0, 0, 0)
                                .applyMatrix4(r.posObj.matrixWorld)
                                .project(d.worldScene.camera),
                            v = d.worldScene.viewport;
                        const x = (v.x + ((p.x + 1) * v.width) / 2) * ratio,
                            y = (v.y + ((1 - p.y) * v.height) / 2) * ratio;
                        const canvas = document.createElement('canvas');
                        canvas.width = 240;
                        canvas.height = 220;
                        canvas
                            .getContext('2d')
                            .drawImage(
                                renderer.domElement,
                                Math.round(x - 120),
                                Math.round(y - 130),
                                240,
                                220,
                                0,
                                0,
                                240,
                                220,
                            );
                        const active = hd.layers
                            .flatMap((p) => p.frames)
                            .filter((f) => f.batch.visible);
                        return {
                            owner,
                            yaw,
                            role,
                            tick: d.game.currentTick,
                            nativeWorld: hd.meshes.map((m) => m.matrixWorld.toArray()),
                            originalBound: hd.meshes.every(
                                (m, i) => m.material === hd.originals[i],
                            ),
                            activeHeadings: active.map((f) => f.frame.heading),
                            bounds: active.map((f) => f.frame.logicalSize),
                            hdBound:
                                active.length > 0 &&
                                active.every(
                                    (f) => f.batch.material.map === f.part.override.pages[0].base,
                                ),
                            palette: active.map((f) => f.batch.material.palette.uuid),
                            shadowNative: hd.meshes.every(
                                (m, i) => m.customDepthMaterial === hd.shadow.originals[i],
                            ),
                            image: canvas.toDataURL(),
                            gl: renderer.getContext().getError(),
                            camera: {
                                zoom: d.worldScene.camera.zoom,
                                buffer: [renderer.domElement.width, renderer.domElement.height],
                                ratio,
                            },
                        };
                    },
                    { owner, yaw, role },
                );
                row.file = `owner-${owner}-yaw-${yaw}-${role}.png`;
                await fs.writeFile(
                    path.join(out, row.file),
                    Buffer.from(row.image.split(',')[1], 'base64'),
                );
                delete row.image;
                assert.equal(row.gl, 0);
                assert(row.shadowNative);
                assert.equal(row.originalBound, role === 'original');
                assert.equal(row.hdBound, role === 'hd');
                pair.push(row);
                report.sweep.push(row);
            }
            assert.deepEqual(pair[0].nativeWorld, pair[1].nativeWorld);
            assert.equal(pair[0].tick, pair[1].tick);
        }
    await stage('paired-bearing-sweep', { pairs: report.sweep.length / 2 });

    report.opacity = [];
    for (const opacity of [1, 0.5, 0, 1]) {
        const row = await page.evaluate((opacity) => {
            const d = window.__ra2debug,
                r = d.renderableManager.getRenderableByGameObject(window.__mcv),
                hd = r.unitVxlHd;
            r.vxlBuilders.forEach((b) => b.setOpacity(opacity));
            hd.update();
            d.worldScene.scene.updateMatrixWorld(true);
            d.worldScene.meshBatchManager.updateMeshes();
            d.renderer.render();
            return {
                opacity,
                active: hd.active,
                visible: hd.layers
                    .flatMap((p) => p.frames)
                    .filter((f) => f.batch.visible || f.translucent.visible).length,
                shadowOpacity: hd.shadow.opacity.value,
                nativeShadow: hd.meshes.every(
                    (m, i) => m.customDepthMaterial === hd.shadow.originals[i],
                ),
                gl: d.renderer.renderer.getContext().getError(),
            };
        }, opacity);
        assert(row.active && row.gl === 0);
        assert.equal(row.visible, opacity ? 1 : 0);
        assert.equal(row.shadowOpacity, opacity);
        assert.equal(row.nativeShadow, opacity === 1);
        report.opacity.push(row);
        await page.screenshot({ path: path.join(out, `opacity-${report.opacity.length}.png`) });
    }
    await stage('opacity-shadow-restoration', report.opacity);
    report.sharedImage = await page.evaluate(() => {
        const d = window.__ra2debug,
            c = window.__civilian;
        d.gameScreen.gameAnimationLoop.start();
        return {
            name: c.name,
            art: c.art.imageName,
            hd: !!d.renderableManager.getRenderableByGameObject(c)?.unitVxlHd,
        };
    });
    assert(!report.sharedImage.hd);
    await page.evaluate(() => {
        const d = window.__ra2debug,
            u = window.__mcv;
        d.game.changeObjectOwner(u, d.localPlayer);
        if (!d.game.gameOpts.mcvRepacks)
            throw Error('Native match option must permit MCV repacking');
        const worker = d.game.getConstructionWorker(d.localPlayer);
        const tiles = d.game.map.tiles
            .getAll()
            .filter(
                (t) =>
                    d.game.map.mapBounds.isWithinBounds(t) &&
                    Math.hypot(t.rx - u.tile.rx, t.ry - u.tile.ry) >= 4 &&
                    worker.canPlaceAt('NACNST', t, { ignoreObjects: [u], ignoreAdjacent: true }),
            );
        tiles.sort(
            (a, b) =>
                Math.hypot(a.rx - u.tile.rx, a.ry - u.tile.ry) -
                Math.hypot(b.rx - u.tile.rx, b.ry - u.tile.ry),
        );
        if (!tiles.length) throw Error('No legal native MCV deployment site');
        window.__deployTile = [tiles[0].rx, tiles[0].ry];
        d.actionsApi.orderUnits([u.id], 0, ...window.__deployTile);
    });
    await page.waitForFunction(
        () => {
            const u = window.__mcv;
            return (
                !u.isMoving &&
                u.tile.rx === window.__deployTile[0] &&
                u.tile.ry === window.__deployTile[1]
            );
        },
        undefined,
        { timeout: 90000 },
    );
    await stage(
        'legal-deploy-location',
        await page.evaluate(() => {
            const d = window.__ra2debug,
                u = window.__mcv;
            const allowed = d.game
                .getConstructionWorker(d.localPlayer)
                .canPlaceAt('NACNST', u.tile, { ignoreObjects: [u], ignoreAdjacent: true });
            if (!allowed) throw Error('Native deployment site no longer available');
            d.actionsApi.orderUnits([u.id], 10);
            return { tile: window.__deployTile, allowed };
        }),
    );
    await page.waitForFunction(
        () => window.__ra2debug.localPlayer.getOwnedObjects().some((o) => o.name === 'NACNST'),
        undefined,
        { timeout: 90000 },
    );
    await page.waitForTimeout(4000);
    report.deployed = await page.evaluate(() => {
        const d = window.__ra2debug,
            u = window.__mcv;
        const yard = d.localPlayer.getOwnedObjects().find((o) => o.name === 'NACNST');
        window.__mcvYard = yard;
        return {
            oldUnitRemoved: !u.isSpawned,
            rendererRemoved: !d.renderableManager.getRenderableByGameObject(u),
            yardId: yard.id,
            yardName: yard.name,
            acceptedBuilding: d.sovietBuildingsHd.NACNST,
            repacks: d.game.gameOpts.mcvRepacks,
            undeploysInto: yard.rules.undeploysInto,
        };
    });
    assert(report.deployed.oldUnitRemoved && report.deployed.rendererRemoved);
    assert.equal(report.deployed.acceptedBuilding.density, 2);
    await stage('native-deploy-to-accepted-yard', report.deployed);
    await page.evaluate(() => {
        const d = window.__ra2debug,
            b = window.__mcvYard;
        d.actionsApi.orderUnits([b.id], 0, b.tile.rx + 6, b.tile.ry);
    });
    await page.waitForFunction(
        () =>
            window.__ra2debug.localPlayer
                .getOwnedObjects()
                .some(
                    (o) =>
                        o.name === 'SMCV' &&
                        o !== window.__mcv &&
                        !window.__initialMcvs.includes(o.id),
                ),
        undefined,
        { timeout: 90000 },
    );
    await page.waitForFunction(
        () => {
            const d = window.__ra2debug;
            const u = d.localPlayer
                .getOwnedObjects()
                .find(
                    (o) =>
                        o.name === 'SMCV' &&
                        o !== window.__mcv &&
                        !window.__initialMcvs.includes(o.id),
                );
            return u && d.renderableManager.getRenderableByGameObject(u)?.unitVxlHd?.active;
        },
        undefined,
        { timeout: 30000 },
    );
    report.repacked = await page.evaluate(() => {
        const d = window.__ra2debug;
        const u = d.localPlayer
            .getOwnedObjects()
            .find(
                (o) =>
                    o.name === 'SMCV' && o !== window.__mcv && !window.__initialMcvs.includes(o.id),
            );
        return {
            id: u.id,
            hd: d.renderableManager.getRenderableByGameObject(u).unitVxlHd.active,
            yardRemoved: !window.__mcvYard.isSpawned,
            family: d.sovietUnitsHd.families.SMCV,
        };
    });
    assert(report.repacked.hd && report.repacked.yardRemoved);
    await stage('native-repack-restores-complete-mcv', report.repacked);
    report.trace = await page.evaluate(() => {
        clearInterval(window.__mcvTimer);
        return window.__mcvTrace;
    });
    assert(report.trace.some((t) => t.hd && t.moving && t.bound));
    assert(report.trace.every((t) => t.gl === 0));
    assert.deepEqual(report.errors, []);

    const abort = await page.evaluate(() => {
        const d = window.__ra2debug;
        d.gameScreen.menu.open();
        return d.gameScreen.strings.get('GUI:AbortMission');
    });
    await page.getByText(abort, { exact: true }).click();
    await page
        .getByText(
            await page.evaluate(() => window.__ra2debug.gameScreen.strings.get('GUI:Quit')),
            { exact: true },
        )
        .click();
    await page.waitForFunction(() => !window.__ra2debug.game, undefined, { timeout: 45000 });
    report.cleanup = await page.evaluate(() => ({
        gameCleared: !window.__ra2debug.game,
        count: window.__mcvTextures.length,
        texturesReleased: window.__mcvTextures.every(
            (t) => !window.__ra2debug.renderer.renderer.properties.get(t).__webglTexture,
        ),
    }));
    assert(report.cleanup.texturesReleased);
    await stage('match-teardown', report.cleanup);
    report.status = 'PASS_SMCV_NATIVE_PRODUCTION_MOVEMENT_DEPLOY_REPACK_AND_CONTROLLED_BEARINGS';
} catch (e) {
    report.status = 'FAIL';
    report.failure = e.stack;
    process.exitCode = 1;
    console.error(e);
    await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    try {
        const video = await page?.evaluate(async () => {
            const recorder = window.__nativeRecorder;
            if (!recorder) return;
            if (recorder.state !== 'inactive')
                await new Promise((resolve) => {
                    recorder.onstop = resolve;
                    recorder.stop();
                });
            window.__nativeVideoStream.getTracks().forEach((t) => t.stop());
            return await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.readAsDataURL(new Blob(window.__videoChunks, { type: recorder.mimeType }));
            });
        });
        if (video) {
            const bytes = Buffer.from(video.split(',')[1], 'base64');
            await fs.writeFile(path.join(out, 'native-actions.webm'), bytes);
            report.recording.bytes = bytes.length;
        }
    } catch (e) {
        report.recordingFailure = e.message;
    }
    await save();
    await app.close();
}
