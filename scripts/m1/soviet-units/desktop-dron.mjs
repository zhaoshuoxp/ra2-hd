import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const artifact = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
const output = path.resolve(process.argv[3]);
await fs.mkdir(output, { recursive: false });
const profile = path.join(output, 'profile');
await fs.mkdir(profile);
await fs.writeFile(
    path.join(profile, 'resource-registration.json'),
    JSON.stringify({ schemaVersion: 1, directory: path.resolve('.local') }),
);
const report = {
    status: 'RUNNING',
    app: artifact.artifact,
    errors: [],
    stages: [],
    disclosure:
        'DRON is naturally queued and built. The enemy host is a controlled placement; approach, leap, infection and damage use native orders and simulation. Frame sweeps are separately labeled.',
};
const save = async () =>
    fs.writeFile(path.join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n');
const stage = async (name, data) => {
    report.stages.push({ name, data });
    await save();
    console.log(name, JSON.stringify(data ?? ''));
};
const app = await electron.launch({
    executablePath: artifact.executable,
    cwd: '/private/tmp',
    env: { ...process.env, RA2_DESKTOP_USER_DATA: profile, RA2_DESKTOP_NO_DISCOVERY: '1' },
    timeout: 60000,
});
try {
    const page = await app.firstWindow();
    page.on('pageerror', (error) => report.errors.push(error.stack));
    await page.getByText('Offline Skirmish', { exact: true }).waitFor({ timeout: 90000 });
    await page.evaluate(() => {
        const g = window.__ra2debug.generalOptions.graphics;
        for (const key of [
            'conscript',
            'powerPlant',
            'napowr',
            'nahand',
            'narefn',
            'naweap',
            'nacnst',
            'rhino',
            'sovietUnits',
        ])
            g[`${key}Hd`].value = true;
        g.renderResolution.value = '1080p';
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
    report.selection = await page.evaluate(() => {
        const d = window.__ra2debug;
        return {
            units: d.sovietUnitsHd,
            conscript: d.conscriptHd,
            powerPlant: d.powerPlantHd,
            napowr: d.napowrHd,
            buildings: d.sovietBuildingsHd,
            rhino: d.rhinoHd,
        };
    });
    assert.equal(report.selection.units.families.DRON.status, 'NOT_REQUESTED');
    await stage('combined-selection', report.selection);
    await page.evaluate(() => {
        const d = window.__ra2debug;
        d.actionsApi.orderUnits(
            [d.localPlayer.getOwnedObjects().find((u) => /MCV$/.test(u.name)).id],
            10,
        );
    });
    await page.waitForFunction(() =>
        window.__ra2debug.localPlayer.getOwnedObjects().some((u) => u.name === 'NACNST'),
    );
    for (const name of ['NAPOWR', 'NAHAND', 'NAREFN', 'NAWEAP']) {
        await page.evaluate(
            (name) => window.__ra2debug.actionsApi.queueForProduction(0, 2, name, 1),
            name,
        );
        await page.waitForFunction(
            () => window.__ra2debug.localPlayer.production.getQueue(0).status === 3,
            undefined,
            { timeout: 120000 },
        );
        await page.evaluate((name) => {
            const d = window.__ra2debug,
                yard = d.localPlayer.getOwnedObjects().find((u) => u.name === 'NACNST'),
                tiles = [];
            for (let x = -12; x <= 12; x++)
                for (let y = -12; y <= 12; y++)
                    tiles.push({ rx: yard.tile.rx + x, ry: yard.tile.ry + y });
            const offsets = { NAPOWR: [-4, -2], NAHAND: [-5, 2], NAREFN: [-5, 7], NAWEAP: [5, 5] }[
                name
            ];
            tiles.sort(
                (a, b) =>
                    Math.hypot(a.rx - yard.tile.rx - offsets[0], a.ry - yard.tile.ry - offsets[1]) -
                    Math.hypot(b.rx - yard.tile.rx - offsets[0], b.ry - yard.tile.ry - offsets[1]),
            );
            const tile = tiles.find((t) =>
                d.game
                    .getConstructionWorker(d.localPlayer)
                    .canPlaceAt(name, t, { normalizedTile: true }),
            );
            if (!tile) throw Error(`No legal foundation: ${name}`);
            d.actionsApi.placeBuilding(name, tile.rx, tile.ry);
        }, name);
        await page.waitForFunction(
            (name) => window.__ra2debug.localPlayer.getOwnedObjects().some((u) => u.name === name),
            name,
        );
        await page.waitForTimeout(2400);
        await stage('native-building-production', name);
    }
    await page.evaluate(() => window.__ra2debug.actionsApi.queueForProduction(3, 7, 'DRON', 1));
    await page.waitForFunction(
        () => window.__ra2debug.localPlayer.getOwnedObjects().some((u) => u.name === 'DRON'),
        undefined,
        { timeout: 90000 },
    );
    await page.waitForFunction(
        () => {
            const d = window.__ra2debug;
            const u = d.localPlayer.getOwnedObjects().find((u) => u.name === 'DRON');
            return (
                u &&
                d.renderableManager.getRenderableByGameObject(u)?.shpRenderable?.builder?.hdOverride
            );
        },
        undefined,
        { timeout: 30000 },
    );
    report.production = await page.evaluate(() => {
        const d = window.__ra2debug,
            u = d.localPlayer.getOwnedObjects().find((u) => u.name === 'DRON');
        window.__dron = u;
        window.__dronTrace = [];
        d.worldInteraction.minimapHandler.panToTile(u.tile);
        window.__dronSample = () => {
            const r = d.renderableManager.getRenderableByGameObject(u),
                b = r?.shpRenderable?.builder,
                frame = b?.getFrame(),
                hd = b?.hdOverride;
            const page = hd?.pages[hd.frames[frame + b.frameOffset]?.page],
                mesh = r?.shpRenderable?.getShapeMesh();
            const leaps = d.game.world
                .getAllObjects()
                .filter((p) => p.fromObject === u && p.rules.name === 'JUMP')
                .map((p) => {
                    const r = d.renderableManager.getRenderableByGameObject(p),
                        b = r?.shpRenderable?.builder,
                        page = b?.getHdPage(),
                        mesh = r?.shpRenderable?.getShapeMesh();
                    return {
                        id: p.id,
                        frame: b?.getFrame(),
                        source: b?.shpFile.filename,
                        hd: !!b?.hdOverride,
                        boundBase: !!page && mesh.material.map === page.base,
                        boundRemap: !!page && mesh.material.uniforms.remapMap.value === page.data,
                        height: p.position.worldPosition.y,
                        visible: r?.get3DObject()?.visible,
                    };
                });
            return {
                leaps,
                tick: d.game.currentTick,
                frame,
                hd: !!hd,
                source: b?.shpFile?.filename,
                boundBase: !!page && mesh.material.map === page.base,
                boundRemap: !!page && mesh.material.uniforms.remapMap.value === page.data,
                tile: [u.tile.rx, u.tile.ry],
                moving: u.isMoving,
                firing: u.isFiring,
                spawned: u.isSpawned,
                destroyed: u.isDestroyed,
                renderer: !!r,
                visible: r?.get3DObject()?.visible,
                hostInfested: window.__dronHost?.parasiteableTrait?.isInfested(),
                hostHealth: window.__dronHost?.healthTrait.health,
                hostDestroyed: window.__dronHost?.isDestroyed,
                shadow: !!r?.shpRenderable?.getShadowMesh()?.visible,
                gl: d.renderer.renderer.getContext().getError(),
            };
        };
        window.__dronTimer = setInterval(() => window.__dronTrace.push(window.__dronSample()), 20);
        return {
            id: u.id,
            name: u.name,
            cost: u.rules.cost,
            tick: d.game.currentTick,
            sample: window.__dronSample(),
        };
    });
    assert(
        report.production.sample.hd &&
            report.production.sample.boundBase &&
            report.production.sample.boundRemap,
    );
    await stage('native-dron-production', report.production);
    report.recording = await page.evaluate(() => {
        const canvas = window.__ra2debug.renderer.renderer.domElement;
        const stream = canvas.captureStream(15),
            recorder = new MediaRecorder(stream, {
                mimeType: 'video/webm;codecs=vp9',
                videoBitsPerSecond: 8000000,
            });
        window.__videoChunks = [];
        window.__recorder = recorder;
        recorder.ondataavailable = (e) => {
            if (e.data.size) window.__videoChunks.push(e.data);
        };
        recorder.start(500);
        return {
            width: canvas.width,
            height: canvas.height,
            fps: 15,
            source: 'Native drawing buffer',
        };
    });

    await page.screenshot({ path: path.join(output, 'dron-produced.png') });
    await page.waitForFunction(
        () =>
            window.__ra2debug.localPlayer.getOwnedObjects().find((u) => u.name === 'NAWEAP')
                .factoryTrait.status === 0,
        undefined,
        { timeout: 30000 },
    );
    await page.evaluate(() => {
        const d = window.__ra2debug,
            u = window.__dron;
        const rule = d.game.rules.getObject('HARV', 7),
            enemy = d.game.getCombatants().find((p) => p !== d.localPlayer);
        const tiles = d.game.map.tiles
            .getAll()
            .filter(
                (t) =>
                    !t.rampType &&
                    d.game.map.mapBounds.isWithinBounds(t) &&
                    d.game.map.terrain.getPassableSpeed(t, rule.speedType, true, false) > 0 &&
                    !d.game.map.tileOccupation
                        .getObjectsOnTile(t)
                        .some((o) => o.isTechno() || o.isTerrain()),
            );
        tiles.sort(
            (a, b) =>
                Math.abs(Math.hypot(a.rx - u.tile.rx, a.ry - u.tile.ry) - 7) -
                Math.abs(Math.hypot(b.rx - u.tile.rx, b.ry - u.tile.ry) - 7),
        );
        const host = d.game.createUnitForPlayer(rule, enemy);
        d.game.spawnObject(host, tiles[0]);
        window.__dronHost = host;
        d.game.mapShroudTrait.revealMap(d.localPlayer, d.game);
        d.actionsApi.orderUnits([u.id], 2, host.id);
    });
    await page.waitForFunction(
        () => window.__dronTrace.some((row) => row.hostInfested && !row.spawned),
        undefined,
        { timeout: 60000 },
    );
    await stage('native-infection', await page.evaluate(() => window.__dronSample()));
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(output, 'dron-in-host.png') });
    await page.waitForFunction(
        () => window.__dronTrace.some((row) => row.hostHealth < 100),
        undefined,
        { timeout: 30000 },
    );
    await stage('native-parasite-damage', await page.evaluate(() => window.__dronSample()));
    await page.waitForFunction(
        () => window.__dronHost.isDestroyed && window.__dron.isSpawned,
        undefined,
        { timeout: 120000 },
    );
    await page.waitForTimeout(100);
    await stage(
        'native-host-death-and-drone-return',
        await page.evaluate(() => window.__dronSample()),
    );
    await page.evaluate(() => {
        const d = window.__ra2debug,
            u = window.__dron;
        u.primaryWeapon.warhead.inflictDamage(
            10000,
            u,
            { player: window.__dronHost.owner, obj: window.__dronHost, weapon: u.primaryWeapon },
            d.game,
        );
    });
    await page.waitForFunction(
        () =>
            window.__dron.isDestroyed &&
            !window.__ra2debug.renderableManager.getRenderableByGameObject(window.__dron),
    );
    await stage('native-damage-boundary-removal', await page.evaluate(() => window.__dronSample()));
    report.trace = await page.evaluate(() => {
        clearInterval(window.__dronTimer);
        return window.__dronTrace;
    });
    assert(report.trace.some((row) => row.moving && row.hd));
    assert(report.trace.some((row) => row.hostInfested && !row.spawned && !row.renderer));
    assert(report.trace.every((row) => row.gl === 0));
    assert(
        report.trace.some((row) =>
            row.leaps.some((p) => p.hd && p.boundBase && p.boundRemap && p.visible),
        ),
    );
    assert(report.trace.some((row) => row.hostDestroyed && row.spawned && row.hd));
    const video = await page.evaluate(
        () =>
            new Promise((resolve) => {
                const recorder = window.__recorder;
                recorder.onstop = () => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.readAsDataURL(
                        new Blob(window.__videoChunks, { type: recorder.mimeType }),
                    );
                };
                recorder.stop();
            }),
    );
    const bytes = Buffer.from(video.split(',')[1], 'base64');
    await fs.writeFile(path.join(output, 'native-actions.webm'), bytes);
    report.recording.bytes = bytes.length;
    report.status = 'PASS_DRON_NATIVE_PRODUCTION_LEAP_INFECTION_RETURN_AND_REMOVAL';
    await stage('complete', {
        frames: [...new Set(report.trace.map((row) => row.frame).filter(Number.isInteger))],
        samples: report.trace.length,
    });
} catch (error) {
    report.status = 'FAIL';
    report.failure = error.stack;
    const page = await app.firstWindow();
    report.trace = await page
        .evaluate(() => {
            clearInterval(window.__dronTimer);
            return window.__dronTrace;
        })
        .catch(() => undefined);
    await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
    process.exitCode = 1;
} finally {
    await save();
    await app.close();
}
