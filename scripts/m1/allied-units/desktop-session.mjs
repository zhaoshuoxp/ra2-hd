// Shared setup for the incremental Allied checks in the exact packaged app.
import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

export async function startSession(receiptFile, output, edition = 'yr', snow = false, prepareMenu, prepareLobby) {
    const receipt = JSON.parse(await fs.readFile(receiptFile, 'utf8'));
    const artifact = receipt.receipt ?? receipt;
    assert((artifact.app || artifact.build) && artifact.resources, 'An isolated runtime and its resource root are required');
    const out = path.resolve(output), profile = path.join(out, 'profile');
    await fs.mkdir(out, { recursive: false });
    await fs.mkdir(profile);
    await fs.writeFile(path.join(profile, 'resource-registration.json'), JSON.stringify({
        schemaVersion: 1, directory: artifact.resources,
    }));
    const app = await electron.launch({
        executablePath: artifact.app ? path.join(artifact.app, 'Contents/MacOS/RA2 HD Editions')
            : await fs.realpath('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
        args: artifact.app ? [] : [artifact.build],
        cwd: '/private/tmp', timeout: 60000,
        env: { ...process.env, RA2_DESKTOP_USER_DATA: profile, RA2_DESKTOP_NO_DISCOVERY: '1' },
    });
    const report = { status: 'RUNNING', edition, snow, app: artifact.app, resources: artifact.resources,
        disclosure: 'Controlled legal fixtures followed by native orders; no rules or camera changes. Not a natural-match production claim.',
        errors: [], stages: [], clips: [] };
    const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    const page = await app.firstWindow();
    const highResolution = process.argv.includes('--4k');
    if (highResolution) {
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Emulation.setDeviceMetricsOverride', {
            width: 1920, height: 1080, deviceScaleFactor: 2, mobile: false,
        });
    }
    page.on('pageerror', error => report.errors.push(error.stack));
    try {
        await page.locator(`[data-edition=${edition}]`).click({ timeout: 60000 });
        await page.waitForFunction(() => window.__ra2debug?.generalOptions, undefined, { timeout: 90000 });
        await page.evaluate(() => {
            const audit = window.__nativePreparedAudit = { requests: [], fallbacks: [] };
            const fetch = window.fetch, warn = console.warn;
            window.fetch = async function (...args) {
                const response = await fetch.apply(this, args), url = String(args[0]);
                if (url.includes('/local-hd/') && audit.requests.length < 2048)
                    audit.requests.push({ url, status: response.status });
                return response;
            };
            console.warn = function (...args) {
                if (String(args[0]).includes('HD prepared cache fallback') && audit.fallbacks.length < 128)
                    audit.fallbacks.push(args.map(String).join(' '));
                return warn.apply(this, args);
            };
        });
        if (prepareMenu) await prepareMenu({ page, report, out });
        const requestedMap = process.argv.find(arg => arg.startsWith('--map='))?.slice(6);
        if (requestedMap) assert(/^[a-z0-9_-]+\.map$/i.test(requestedMap), 'Invalid fixture map name');
        const botSlot = Number(process.argv.find(arg => arg.startsWith('--bot-slot='))?.slice(11) ?? 3);
        const botSlots = process.argv.find(arg => arg.startsWith('--bot-slots='))?.slice(12).split(',').map(Number) ?? [botSlot];
        const cratesAppear = process.argv.includes('--crates');
        assert(Number.isInteger(botSlot) && botSlot >= 1 && botSlot <= 7, 'Invalid native bot slot');
        assert(botSlots.length && new Set(botSlots).size === botSlots.length &&
            botSlots.every(slot => Number.isInteger(slot) && slot >= 1 && slot <= 7), 'Invalid native bot slots');
        await page.evaluate(({ edition, snow, highResolution, requestedMap, botSlots, cratesAppear }) => {
            const d = window.__ra2debug;
            d.generalOptions.graphics.renderResolution.value = highResolution ? '4k' : '1080p';
            const bots = Array(8).fill(null);
            for (const slot of botSlots) bots[slot] = { d: 4, c: botSlots.length > 1 ? slot + 1 : 5,
                co: 2, s: slot, t: botSlots.length > 1 ? slot : 1 };
            Object.entries({
                _r_lastMap: requestedMap ?? (edition === 'yr' ? 'X' : '') + (snow ? 'MP26S6.map' : 'MP01T4.map'), _r_lastMode: '1',
                _r_lastCountry: '0', _r_lastColor: '1', _r_lastStartPos: '0', _r_lastTeam: '0',
                _r_hostOpts: `6;10000;0;1;1;0;1;${Number(cratesAppear)};;0;1;0;0`,
                _r_lastBots: JSON.stringify(bots),
            }).forEach(([key, value]) => localStorage.setItem(`_edition:${edition}:${key}`, value));
        }, { edition, snow, highResolution, requestedMap, botSlots, cratesAppear });
        const locale = JSON.parse(await fs.readFile('public/res/locale/zh-CN.json', 'utf8'));
        await page.getByRole('button', { name: new RegExp(`${locale['hd:menuskirmish']}|Skirmish`, 'i') }).click();
        await page.waitForFunction(() => window.__ra2debug?.skirmishLobby);
        if (prepareLobby) await prepareLobby({ page, report, out });
        if (requestedMap) {
            report.selectedMap = await page.evaluate(() => window.__ra2debug.skirmishLobby.gameOpts.mapName);
            assert.equal(report.selectedMap.toLowerCase(), requestedMap.toLowerCase(), 'Fixture selected a different map');
        }
        await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000000));
        await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 90000 });
        await page.evaluate(() => {
            window.__installAlliedFixtures = () => {
                const d = window.__ra2debug, g = d.game, player = d.localPlayer;
                const center = player.getOwnedObjects().find(unit => /MCV$/.test(unit.name) || unit.name === 'PCV').tile;
                for (const bot of g.botManager.bots.values()) bot.onGameTick = () => {};
                g.mapShroudTrait.revealMap(player, g);
                const fixture = window.__allied = {
                    center, player, enemy: g.getCombatants().find(owner => owner !== player), actors: {}, traces: [],
                };
                fixture.spawn = (name, type, near = center, owner = player) => {
                    const rule = g.rules.getObject(name, type);
                    const tile = g.map.tiles.getAll().filter(t => g.map.isWithinBounds(t) && !t.rampType
                        && g.map.terrain.getPassableSpeed(t, rule.speedType, type === 3, false) > 0
                        && !g.map.getGroundObjectsOnTile(t).some(o => o.isTechno() || o.isTerrain()))
                        .sort((a, b) => Math.hypot(a.rx - near.rx, a.ry - near.ry) - Math.hypot(b.rx - near.rx, b.ry - near.ry))[0];
                    if (!tile) throw Error('No legal fixture tile for ' + name);
                    const unit = g.createUnitForPlayer(rule, owner);
                    g.spawnObject(unit, tile); fixture.actors[unit.id] = unit; return unit;
                };
                fixture.building = (name, near = center, owner = player) => {
                    const worker = g.getConstructionWorker(owner);
                    const tile = g.map.tiles.getAll().filter(t => g.map.isWithinBounds(t)
                        && worker.canPlaceAt(name, t, { normalizedTile: true, ignoreAdjacent: true }))
                        .sort((a, b) => Math.hypot(a.rx - near.rx, a.ry - near.ry) - Math.hypot(b.rx - near.rx, b.ry - near.ry))[0];
                    if (!tile) throw Error('No legal foundation for ' + name);
                    const building = g.createObject(2, name);
                    g.changeObjectOwner(building, owner); g.spawnObject(building, tile); return building;
                };
                fixture.sample = unit => {
                    const r = d.renderableManager.getRenderableByGameObject(unit), builder = r?.shpRenderable?.builder;
                    return { name: unit.name, id: unit.id, tick: g.currentTick, spawned: unit.isSpawned,
                        destroyed: unit.isDestroyed, tile: unit.tile && [unit.tile.rx, unit.tile.ry], moving: unit.isMoving,
                        firing: unit.isFiring, health: unit.healthTrait?.health, frame: builder?.getFrame(),
                        shpHd: !!builder?.hdOverride, vxlHd: !!r?.unitVxlHd?.active,
                        parts: r?.unitVxlHd?.layers?.map(layer => layer.frames[0]?.part.member), turret: unit.turretNo,
                        harvestStatus: unit.harvesterTrait?.status, cargoEmpty: unit.harvesterTrait?.isEmpty(),
                        passengers: unit.transportTrait?.units.map(passenger => passenger.name),
                        powered: unit.poweredUnitTrait?.isOnline(),
                        ammo: unit.ammoTrait?.ammo, storedChildren: unit.airSpawnTrait?.availableSpawns,
                        deployed: unit.deployerTrait?.isDeployed(), disguised: unit.disguiseTrait?.isDisguised(),
                        warped: !!unit.warpedOutTrait?.isActive(), zone: unit.zone, elevation: unit.tileElevation };
                };
                fixture.projectiles = [];
                fixture.timer = setInterval(() => {
                    for (const actor of Object.values(fixture.actors)) for (const child of actor.airSpawnTrait?.spawns ?? [])
                        fixture.actors[child.id] = child;
                    fixture.traces.push(Object.values(fixture.actors).map(fixture.sample));
                    for (const object of g.getWorld().getAllObjects()) if (object.rules?.name === 'ADOGJUMP') {
                        const r = d.renderableManager.getRenderableByGameObject(object);
                        fixture.projectiles.push({ tick: g.currentTick, name: object.rules.name,
                            hd: !!r?.shpRenderable?.builder?.hdOverride });
                    }
                }, 50);
            };
            window.__installAlliedFixtures();
        });
    } catch (error) {
        report.status = 'FAIL'; report.failure = error.stack;
        report.setupDiagnostics = await page.evaluate(() => ({ text: document.body.innerText.slice(-4000),
            lobby: window.__ra2debug?.skirmishLobby?.gameOpts, gameStatus: window.__ra2debug?.game?.status })).catch(() => undefined);
        await save(); await page.screenshot({ path: path.join(out, 'setup-failure.png') }).catch(() => {});
        await app.close(); throw error;
    }
    const stage = async name => {
        report.stages.push({ name, samples: await page.evaluate(() => Object.values(window.__allied.actors).map(window.__allied.sample)) });
        await page.screenshot({ path: path.join(out, name + '.png') });
        if (highResolution) {
            const png = await page.evaluate(() => {
                const d = window.__ra2debug, actor = window.__allied.actor;
                const r = actor && (d.renderableManager.getRenderableByGameObject(actor)
                    ?? (window.__allied.deathRenderable?.gameObject === actor ? window.__allied.deathRenderable : undefined));
                if (!r) return;
                d.renderer.render();
                const c = d.renderer.renderer.domElement, v = d.worldScene.viewport;
                const p = r.getPosition().clone().project(d.worldScene.camera), ratio = c.width / d.renderer.width;
                const x = (v.x + (p.x + 1) * v.width / 2) * ratio;
                const y = (v.y + (1 - p.y) * v.height / 2) * ratio;
                const [width, height] = window.__allied.detailSize ?? [640, 420];
                const detail = document.createElement('canvas'); detail.width = width; detail.height = height;
                const left = Math.max(0, Math.min(c.width - width, Math.round(x - width / 2)));
                const top = Math.max(0, Math.min(c.height - height, Math.round(y - height * 0.6)));
                detail.getContext('2d').drawImage(c, left, top,
                    width, height, 0, 0, width, height);
                return { png: detail.toDataURL(), source: [left, top, width, height], projected: [x, y], buffer: [c.width, c.height] };
            });
            if (png) {
                Object.assign(report.stages.at(-1), { detail: { source: png.source, projected: png.projected, buffer: png.buffer } });
                await fs.writeFile(path.join(out, name + '-detail.png'), Buffer.from(png.png.split(',')[1], 'base64'));
            }
        }
        await save();
    };
    const startClip = async () => page.evaluate(highResolution => {
        const fps = highResolution ? 30 : 15;
        const canvas = window.__ra2debug.renderer.renderer.domElement, stream = canvas.captureStream(fps);
        const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: highResolution ? 48000000 : 8000000 });
        const f = window.__allied; f.chunks = []; f.recorder = recorder; f.stream = stream;
        recorder.ondataavailable = event => { if (event.data.size) f.chunks.push(event.data); };
        recorder.start(1000); return { width: canvas.width, height: canvas.height, fps, bitrate: recorder.videoBitsPerSecond };
    }, highResolution);
    const stopClip = async name => {
        const encoded = await page.evaluate(async () => {
            const f = window.__allied;
            await new Promise(resolve => { f.recorder.onstop = resolve; f.recorder.stop(); });
            f.stream.getTracks().forEach(track => track.stop());
            const bytes = new Uint8Array(await new Blob(f.chunks, { type: 'video/webm' }).arrayBuffer());
            let binary = ''; for (let i = 0; i < bytes.length; i += 32768)
                binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
            return btoa(binary);
        });
        const file = path.join(out, name + '.webm'); await fs.writeFile(file, Buffer.from(encoded, 'base64'));
        report.clips.push(file); await save(); return file;
    };
    const close = async error => {
        try {
            report.traces = await page.evaluate(() => { clearInterval(window.__allied.timer); return window.__allied.traces; });
            report.allocations = await page.evaluate(() => window.__ra2debug.sovietUnitsHd);
            report.worldAllocation = await page.evaluate(() => {
                const d = window.__ra2debug, w = d.worldView, demand = d.sovietUnitsHd;
                const baseline = (w.conscriptHd?.report.gpuBytes ?? 0) + (w.powerPlantHd?.report.gpuBytes ?? 0)
                    + (w.napowrHd?.report.gpuBytes ?? 0)
                    + [...(w.rhinoHd?.parts.values() ?? [])].reduce((n, p) => n + p.bitmap.width * p.bitmap.height * 5
                        + p.palette.image.data.byteLength, 0);
                const eager = Object.entries(w.sovietBuildingsHd ?? {}).filter(([name]) => !demand.families[name])
                    .reduce((n, [, family]) => n + family.report.gpuBytes, 0);
                return { baseline, eager, demand: demand.gpuBytes, total: baseline + eager + demand.gpuBytes,
                    limit: baseline + eager + demand.budget };
            });
            assert(report.worldAllocation.total <= report.worldAllocation.limit);
            report.prepared = await page.evaluate(() => ({ ...window.__nativePreparedAudit,
                cache: window.__ra2debug.preparedHdCache && { ...window.__ra2debug.preparedHdCache } }));
            if (report.prepared.cache) assert(report.prepared.cache.bytes + report.prepared.cache.pendingBytes <= 128 * 1024 * 1024);
            report.projectiles = await page.evaluate(() => window.__allied.projectiles);
            report.status = error || report.errors.length ? 'FAIL' : 'PASS_SELECTED_NATIVE_CASES';
            if (error) report.failure = error.stack;
            await save();
        } finally { await app.close(); }
    };
    return { page, app, out, report, stage, startClip, stopClip, close };
}
