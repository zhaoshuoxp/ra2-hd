import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const identity = 'MIXED';

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
    identity,
    status: 'RUNNING',
    errors: [],
    stages: [],
    app: artifact.artifact,
    disclosure:
        'Controlled full-roster demand and native terrain/visibility fixtures on retail MP23T4. These placements are not country buildability evidence; native action tests are separate. No rules, abilities, geometry or camera changes.',
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
            _r_lastMap: 'MP23T4.map',
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
    await page.evaluate((id) => {
        window.__unitId = id;
        localStorage.setItem('_r_lastCountry', id === 'TTNK' ? '8' : '5');
    }, identity);
    await page.getByText('Offline Skirmish', { exact: true }).click();
    await page.waitForFunction(() => window.__ra2debug?.skirmishLobby);
    await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000000));
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, {
        timeout: 90000,
    });
    const inventory = JSON.parse(
        await fs.readFile('.artifacts/m1-7/source-v4/inventory.json', 'utf8'),
    );
    const ids = inventory.families.map((f) => ({
        id: f.id,
        type: f.category === 'InfantryTypes' ? 3 : 7,
    }));
    report.fixtures = await page.evaluate((ids) => {
        const d = window.__ra2debug,
            g = d.game,
            tiles = g.map.tiles.getAll();
        const home = d.localPlayer.getOwnedObjects()[0].tile;
        window.__actors = {};
        g.mapShroudTrait.revealMap(d.localPlayer, g);
        const placed = [];
        for (const { id, type } of ids) {
            const rule = g.rules.getObject(id, type);
            const candidates = tiles.filter(
                (t) =>
                    g.map.mapBounds.isWithinBounds(t) &&
                    !t.rampType &&
                    !g.map.tileOccupation.getBridgeOnTile(t) &&
                    g.map.terrain.getPassableSpeed(t, rule.speedType, type === 3, false) > 0 &&
                    !g.map.tileOccupation
                        .getObjectsOnTile(t)
                        .some((o) => o.isTechno() || o.isTerrain()) &&
                    placed.every((p) => Math.hypot(p.rx - t.rx, p.ry - t.ry) > 2),
            );
            candidates.sort(
                (a, b) =>
                    Math.hypot(a.rx - home.rx, a.ry - home.ry) -
                    Math.hypot(b.rx - home.rx, b.ry - home.ry),
            );
            if (!candidates.length) throw Error('No legal fixture tile for ' + id);
            const u = g.createUnitForPlayer(rule, d.localPlayer);
            g.spawnObject(u, candidates[0]);
            window.__actors[id] = u;
            placed.push(candidates[0]);
        }
        return Object.values(window.__actors).map((u) => ({
            id: u.name,
            tile: [u.tile.rx, u.tile.ry],
            rulesType: u.rules.type,
        }));
    }, ids);
    await page.waitForFunction(
        () =>
            Object.entries(window.__actors)
                .filter(([id]) => !['E2', 'HTNK', 'YURIPR', 'SQD'].includes(id))
                .every(([id]) =>
                    ['READY', 'FAILED', 'BUDGET_FALLBACK'].includes(
                        window.__ra2debug.sovietUnitsHd.families[id]?.status,
                    ),
                ),
        undefined,
        { timeout: 90000 },
    );
    report.memory = await page.evaluate(() => window.__ra2debug.sovietUnitsHd);
    await stage('combined-roster-demand', report.memory);
    for (const { id } of ids.filter((r) => !['E2', 'HTNK', 'YURIPR', 'SQD'].includes(r.id)))
        assert.equal(report.memory.families[id]?.status, 'READY', id);
    assert(report.memory.gpuBytes <= report.memory.budget);
    report.bridgeCommand = await page.evaluate(() => {
        const d = window.__ra2debug,
            g = d.game,
            u = window.__actors.SAPC,
            tiles = g.map.tiles.getAll();
        const bridgeTiles = tiles.filter(
            (t) =>
                g.map.tileOccupation.getBridgeOnTile(t)?.isHighBridge() &&
                g.map.terrain.getPassableSpeed(t, u.rules.speedType, false, false) > 0,
        );
        const target = bridgeTiles[Math.floor(bridgeTiles.length / 2)];
        if (!target) throw Error('No passable ground layer under high bridge');
        const start = tiles.filter(
            (t) =>
                !g.map.tileOccupation.getBridgeOnTile(t) &&
                Math.hypot(t.rx - target.rx, t.ry - target.ry) < 5 &&
                Math.hypot(t.rx - target.rx, t.ry - target.ry) > 2 &&
                g.map.terrain.getPassableSpeed(t, u.rules.speedType, false, false) > 0 &&
                !g.map.tileOccupation
                    .getObjectsOnTile(t)
                    .some((o) => o.isTechno() || o.isTerrain()),
        )[0];
        if (!start) throw Error('No clear transport approach');
        u.moveTrait.teleportUnitToTile(start, undefined, false, false, g);
        d.worldInteraction.minimapHandler.panToTile(target);
        window.__bridgeTarget = target;
        window.__bridgeTrace = [];
        window.__bridgeTimer = setInterval(
            () =>
                window.__bridgeTrace.push({
                    tick: g.currentTick,
                    tile: [u.tile.rx, u.tile.ry],
                    onBridge: u.onBridge,
                    moving: u.isMoving,
                    hd: !!d.renderableManager.getRenderableByGameObject(u)?.unitVxlHd?.active,
                }),
            20,
        );
        d.actionsApi.orderUnits([u.id], 0, target.rx, target.ry, true);
        return {
            start: [start.rx, start.ry],
            target: [target.rx, target.ry],
            requestedBridge: true,
        };
    });
    await page.waitForFunction(
        () => {
            const trace = window.__bridgeTrace;
            return trace.length > 1 && trace.at(-1).tick - trace[0].tick >= 180;
        },
        undefined,
        { timeout: 15000 },
    );
    report.bridgeCommand.trace = await page.evaluate(() => {
        clearInterval(window.__bridgeTimer);
        return window.__bridgeTrace;
    });
    assert(report.bridgeCommand.trace.every((s) => !s.onBridge && s.hd));
    report.bridgeCommand.outcome = 'PASS_NO_BRIDGE_DECK_ENTRY_AFTER_EXPLICIT_BRIDGE_ORDER';
    report.bridgeCommand.reachedRequestedTile = report.bridgeCommand.trace
        .at(-1)
        .tile.every((v, i) => v === report.bridgeCommand.target[i]);
    await stage('native-transport-bridge-restriction', report.bridgeCommand);
    await page.evaluate(() => {
        const d = window.__ra2debug;
        d.gameScreen.gameAnimationLoop.stop();
        d.gameScreen.pointer.unlock();
        window.__stateTime = performance.now();
        window.__textures = [];
        for (const u of Object.values(window.__actors)) {
            const r = d.renderableManager.getRenderableByGameObject(u);
            r?.unitVxlHd?.family.parts.forEach((p) =>
                p.override.pages.forEach((p) =>
                    window.__textures.push(p.base, p.data, p.tiles.map),
                ),
            );
        }
        window.__captureUnit = (id, role) => {
            const u = window.__actors[id],
                r = d.renderableManager.getRenderableByGameObject(u),
                hd = r.unitVxlHd;
            r.update(window.__stateTime, 0);
            d.worldScene.update(window.__stateTime, 0);
            r.updateVxlRotation(u.direction, true);
            hd.update();
            if (role === 'original') {
                hd.meshes.forEach((m, i) => (m.material = hd.originals[i]));
                hd.shadow.update(false, 1);
                hd.layers.forEach((p) =>
                    p.frames.forEach((f) =>
                        [f.batch, f.depth, f.translucent].forEach((m) => (m.visible = false)),
                    ),
                );
            }
            if (role === 'hd-native-depth') {
                hd.meshes.forEach((mesh, i) => {
                    const proxy = hd.layers[0].frames[0].depth.clone(false);
                    proxy.geometry = mesh.geometry;
                    proxy.material = hd.originals[i].clone();
                    proxy.material.colorWrite = false;
                    proxy.material.depthWrite = true;
                    proxy.material.transparent = false;
                    proxy.matrix.copy(mesh.matrix);
                    proxy.matrixAutoUpdate = false;
                    proxy.renderOrder = 4;
                    proxy.visible = mesh.visible;
                    mesh.parent.add(proxy);
                });
            }
            if (role === 'hd-depth-only')
                hd.layers.forEach((p) =>
                    p.frames.forEach((f) => {
                        f.batch.visible = false;
                        f.translucent.visible = false;
                    }),
                );
            if (role === 'hd-hidden')
                hd.layers.forEach((p) =>
                    p.frames.forEach((f) => {
                        f.batch.visible = false;
                        f.translucent.visible = false;
                        f.depth.visible = false;
                    }),
                );
            if (role === 'hd-no-edge')
                hd.layers.forEach((p) =>
                    p.frames.forEach((f) => f.batch.children.forEach((m) => (m.visible = false))),
                );
            if (role === 'hd-no-depth')
                hd.layers.forEach((p) => p.frames.forEach((f) => (f.depth.visible = false)));
            if (role === 'hd-no-shadow') hd.meshes.forEach((m) => (m.castShadow = false));
            d.worldScene.scene.updateMatrixWorld(true);
            d.worldScene.meshBatchManager.updateMeshes();
            d.worldScene.meshBatchManager.processRenderQueue();
            d.renderer.render();
            const canvas = d.renderer.renderer.domElement,
                ratio = canvas.width / d.renderer.width,
                v = d.worldScene.viewport;
            const p = r.posObj.position
                .clone()
                .set(0, 0, 0)
                .applyMatrix4(r.posObj.matrixWorld)
                .project(d.worldScene.camera);
            const x = (v.x + ((p.x + 1) * v.width) / 2) * ratio,
                y = (v.y + ((1 - p.y) * v.height) / 2) * ratio;
            const crop = document.createElement('canvas');
            crop.width = 360;
            crop.height = 300;
            crop.getContext('2d').drawImage(
                canvas,
                Math.round(x - 180),
                Math.round(y - 190),
                360,
                300,
                0,
                0,
                360,
                300,
            );
            return {
                id,
                role,
                image: crop.toDataURL(),
                context: canvas.toDataURL(),
                visible: r.get3DObject().visible,
                hd: hd.active,
                bound: hd.layers
                    .flatMap((p) => p.frames)
                    .filter((f) => f.batch.visible || f.translucent.visible)
                    .map((f) => f.part.member),
                originalBound: hd.meshes.every((m, i) => m.material === hd.originals[i]),
                nativeWorld: hd.meshes.map((m) => m.matrixWorld.toArray()),
                pose: hd.pose.toArray(),
                order: hd.meshes[0].renderOrder,
                clipping: (hd.originals[0].clippingPlanes ?? []).length,
                shadowNative: hd.meshes.every(
                    (m, i) => m.customDepthMaterial === hd.shadow.originals[i],
                ),
                opacity: hd.shadow.opacity.value,
                tilt: u.tilterTrait?.tilt,
                onBridge: u.onBridge,
                zone: u.zone,
                elevation: u.tileElevation,
                camera: {
                    zoom: d.worldScene.camera.zoom,
                    projection: d.worldScene.camera.projectionMatrix.toArray(),
                    buffer: [canvas.width, canvas.height],
                    logical: [d.renderer.width, d.renderer.height],
                    css: [
                        canvas.getBoundingClientRect().width,
                        canvas.getBoundingClientRect().height,
                    ],
                    dpr: devicePixelRatio,
                },
                gl: d.renderer.renderer.getContext().getError(),
            };
        };
    });
    report.captures = [];
    const capture = async (id, label) => {
        const pair = [];
        for (const role of ['original', 'hd']) {
            const row = await page.evaluate(({ id, role }) => window.__captureUnit(id, role), {
                id,
                role,
            });
            assert.equal(row.gl, 0);
            assert(row.hd);
            assert.equal(row.originalBound, role === 'original');
            row.file = `${id}-${label}-${role}.png`;
            row.contextFile = `${id}-${label}-${role}-context.png`;
            await fs.writeFile(
                path.join(out, row.file),
                Buffer.from(row.image.split(',')[1], 'base64'),
            );
            await fs.writeFile(
                path.join(out, row.contextFile),
                Buffer.from(row.context.split(',')[1], 'base64'),
            );
            delete row.image;
            delete row.context;
            pair.push(row);
            report.captures.push({ ...row, label });
        }
        assert.deepEqual(pair[0].nativeWorld, pair[1].nativeWorld);
        assert.deepEqual(pair[0].camera, pair[1].camera);
    };
    const vehicles = [
        'HARV',
        'SMCV',
        'HTK',
        'V3',
        'APOC',
        'TTNK',
        'DTRUCK',
        'ZEP',
        'SAPC',
        'SUB',
        'HYD',
        'DRED',
    ];
    for (const id of vehicles) {
        await page.evaluate((id) => {
            const d = window.__ra2debug,
                u = window.__actors[id];
            d.worldInteraction.minimapHandler.panToTile(u.tile);
        }, id);
        await capture(id, 'baseline');
        await page.evaluate((id) => {
            const d = window.__ra2debug,
                u = window.__actors[id];
            u.warpedOutTrait.setActive(true, true, d.game);
        }, id);
        await capture(id, 'warp');
        await page.evaluate((id) => {
            const d = window.__ra2debug,
                u = window.__actors[id];
            u.warpedOutTrait.expire(d.game);
            u.invulnerableTrait.setActiveFor(600, d.game);
        }, id);
        await capture(id, 'iron-curtain');
        await page.evaluate((id) => {
            const d = window.__ra2debug,
                u = window.__actors[id],
                r = d.renderableManager.getRenderableByGameObject(u);
            u.invulnerableTrait.timer.reset();
            r.startRocking(90, 0.9, window.__stateTime);
            window.__stateTime += 30;
        }, id);
        await capture(id, 'rocking');
        await page.evaluate(() => (window.__stateTime += 3000));
    }
    report.terrain = await page.evaluate(() => {
        const d = window.__ra2debug,
            tiles = d.game.map.tiles.getAll();
        window.__terrain = {
            high: tiles.find((t) => d.game.map.tileOccupation.getBridgeOnTile(t)?.isHighBridge()),
            low: tiles.find((t) => d.game.map.tileOccupation.getBridgeOnTile(t)?.isLowBridge()),
            ramps: [1, 2, 3, 4].map((n) =>
                tiles.find(
                    (t) =>
                        t.rampType === n &&
                        d.game.map.mapBounds.isWithinBounds(t) &&
                        !tiles.some(
                            (v) =>
                                Math.hypot(v.rx - t.rx, v.ry - t.ry) < 3 &&
                                d.game.map.tileOccupation
                                    .getObjectsOnTile(v)
                                    .some((o) => o.isTerrain() || o.isBuilding()),
                        ),
                ),
            ),
        };
        return Object.fromEntries(
            Object.entries(window.__terrain).map(([k, v]) => [
                k,
                Array.isArray(v) ? v.map((t) => t && [t.rx, t.ry]) : v && [v.rx, v.ry],
            ]),
        );
    });
    for (const id of ['HTK', 'HARV', 'APOC'])
        for (const state of ['ramp-0', 'ramp-1', 'ramp-2', 'ramp-3', 'bridge-on', 'bridge-under']) {
            const available = await page.evaluate(
                ({ id, state }) => {
                    const d = window.__ra2debug,
                        u = window.__actors[id],
                        r = d.renderableManager.getRenderableByGameObject(u);
                    const tile = state.startsWith('ramp')
                        ? window.__terrain.ramps[Number(state.slice(-1))]
                        : window.__terrain.high;
                    if (!tile) return false;
                    u.moveTrait.teleportUnitToTile(
                        tile,
                        state === 'bridge-on'
                            ? d.game.map.tileOccupation.getBridgeOnTile(tile)
                            : undefined,
                        false,
                        false,
                        d.game,
                    );
                    r.setPosition(u.position.worldPosition);
                    d.worldInteraction.minimapHandler.panToTile(tile);
                    return true;
                },
                { id, state },
            );
            if (available) await capture(id, state);
            if (process.env.M17_BRIDGE_DIAGNOSTIC && id === 'HARV' && state === 'bridge-under') {
                for (const role of [
                    'hd-depth-only',
                    'hd-hidden',
                    'hd-no-edge',
                    'hd-no-depth',
                    'hd-native-depth',
                ]) {
                    const row = await page.evaluate(
                        ({ id, role }) => window.__captureUnit(id, role),
                        { id, role },
                    );
                    await fs.writeFile(
                        path.join(out, role + '.png'),
                        Buffer.from(row.image.split(',')[1], 'base64'),
                    );
                }
            }
        }
    await page.evaluate(() => {
        const d = window.__ra2debug,
            u = window.__actors.DRED;
        d.worldInteraction.minimapHandler.panToTile(u.tile);
        window.__sinkTrace = [];
        window.__sinkTimer = setInterval(() => {
            const r = d.renderableManager.getRenderableByGameObject(u);
            window.__sinkTrace.push({
                tick: d.game.currentTick,
                destroyed: u.isDestroyed,
                renderer: !!r,
                hd: !!r?.unitVxlHd?.active,
                position: r?.mainObj?.position.toArray(),
                rotation: r?.mainObj?.rotation.toArray(),
                gl: d.renderer.renderer.getContext().getError(),
            });
        }, 20);
        d.gameScreen.gameAnimationLoop.start();
        u.primaryWeapon.warhead.inflictDamage(
            100000,
            u,
            { player: u.owner, obj: u, weapon: u.primaryWeapon },
            d.game,
        );
    });
    await page.waitForFunction(
        () => window.__sinkTrace.some((s) => s.hd && s.position?.[1] < -20),
        undefined,
        { timeout: 10000 },
    );
    await page.screenshot({ path: path.join(out, 'DRED-native-sinking.png') });
    await page.waitForFunction(
        () => !window.__ra2debug.renderableManager.getRenderableByGameObject(window.__actors.DRED),
        undefined,
        { timeout: 30000 },
    );
    report.sinking = await page.evaluate(() => {
        clearInterval(window.__sinkTimer);
        return window.__sinkTrace;
    });
    assert(report.sinking.some((s) => s.hd && s.position?.[1] < -20 && s.rotation?.[0] > 0));
    assert(report.sinking.every((s) => s.gl === 0));
    await stage('native-dreadnought-sinking', { samples: report.sinking.length });
    report.blocked = await page.evaluate(async () => {
        const d = window.__ra2debug;
        const rows = {};
        for (const id of ['YURIPR', 'SQD']) {
            const r = d.renderableManager.getRenderableByGameObject(window.__actors[id]);
            rows[id] = {
                hd: !!r.shpRenderable?.builder.hdOverride,
                demand: d.sovietUnitsHd.families[id],
            };
        }
        return rows;
    });
    for (const id of ['YURIPR', 'SQD']) {
        assert(!report.blocked[id].hd);
        assert.equal(report.blocked[id].demand.gpuBytes, 0);
    }
    assert.equal(report.blocked.SQD.demand.attempts[0].reason, 'USER_REQUESTED_ORIGINAL');
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
        count: window.__textures.length,
        released: window.__textures.every(
            (t) => !window.__ra2debug.renderer.renderer.properties.get(t).__webglTexture,
        ),
    }));
    assert(report.cleanup.released);
    report.status =
        'PASS_CONTROLLED_COMBINED_DEMAND_AND_NATIVE_RENDER_STATES_VISUAL_REVIEW_PENDING';
} catch (e) {
    report.status = 'FAIL';
    report.failure = e.stack;
    report.bridgeFailure = await page
        ?.evaluate(() => window.__bridgeTrace?.slice(-20))
        .catch(() => null);
    process.exitCode = 1;
    console.error(e);
    await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    await save();
    await app.close();
}
