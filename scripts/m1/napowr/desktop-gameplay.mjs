import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const artifact = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
const output = path.resolve(process.env.M16_OUTPUT ?? `.artifacts/m1-6a/gameplay-${Date.now()}`);
await fs.mkdir(output, { recursive: true });
await fs.mkdir(path.join(output, 'profile'), { recursive: true });
await fs.writeFile(path.join(output, 'profile/resource-registration.json'), JSON.stringify({ schemaVersion: 1, directory: path.resolve('.local') }));
const profile = path.join(output, 'profile');
const report = { status: 'RUNNING', automation: 'Normal lobby, queues and orders operated by Playwright; no rule changes, fake units or forced result', errors: [], consoleErrors: [], steps: [] };
const save = async () => fs.writeFile(path.join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n');
const step = async (name, data) => { report.steps.push({ name, time: Date.now(), data }); await save(); console.log(name, JSON.stringify(data ?? '')); };
let app, page;
async function launch() {
    app = await electron.launch({ executablePath: artifact.executable, cwd: '/private/tmp',
        env: { ...process.env, RA2_DESKTOP_USER_DATA: profile }, timeout: 60000 });
    page = await app.firstWindow();
    page.on('pageerror', e => report.errors.push(e.stack));
    page.on('console', m => { if (m.type() === 'error')
        report.consoleErrors.push(m.text()); });
    await page.getByText('Offline Skirmish', { exact: true }).waitFor({ timeout: 90000 });
}
async function label(key) {
    // End-of-game disposal precedes the next screen's controller installation.
    await page.waitForFunction(() => window.__ra2debug?.mainMenuController?.getCurrentScreen()?.strings, undefined, { timeout: 45000 });
    return page.evaluate(key => window.__ra2debug.mainMenuController.getCurrentScreen().strings.get(key), key);
}
async function hdMenu(enabled) {
    await page.getByText('Options', { exact: true }).click();
    for (const key of ['conscript', 'powerPlant', 'napowr', 'rhino']) {
        const row = page.locator(`[data-hd-family="${key}"]`);
        await row.locator('.select-value').click();
        await row.getByText(enabled ? 'HD' : 'Original', { exact: true }).click();
    }
    await page.screenshot({ path: path.join(output, `options-${enabled ? 'hd' : 'original'}.png`) });
    await page.getByText(await label('GUI:Back'), { exact: true }).click();
}
async function start(country, units = 10) {
    await page.evaluate(({ country, units }) => {
        const prefs = { _r_lastMap: 'MP01T4.map', _r_lastMode: '1', _r_lastCountry: String(country), _r_lastColor: '1',
            _r_lastStartPos: '0', _r_lastTeam: '0', _r_hostOpts: `6;10000;${units};1;1;0;1;0;;0;1;0;0`,
            _r_lastBots: JSON.stringify([null, ...[1, 2, 3].map(i => ({ d: 4, c: 5, co: i + 1, s: i, t: i })), null, null, null, null]) };
        Object.entries(prefs).forEach(([k, v]) => localStorage.setItem(k, v));
    }, { country, units });
    await page.evaluate(() => {
        const gl = WebGL2RenderingContext.prototype;
        window.__m16Storage = [];
        if (!gl.__m16StorageOriginal) {
            gl.__m16StorageOriginal = gl.texStorage2D;
            gl.texStorage2D = function (...args) { window.__m16Storage.push(args); return gl.__m16StorageOriginal.apply(this, args); };
        }
    });
    await page.getByText('Offline Skirmish', { exact: true }).click();
    await page.waitForFunction(() => window.__ra2debug?.skirmishLobby);
    await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000000));
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 90000 });
    await page.evaluate(() => {
        const d = window.__ra2debug;
        window.__m15Game = d.game;
        window.__m15Pack = d.worldView.rhinoHd;
        window.__m15Textures = [...(d.worldView.conscriptHd?.override?.pages ?? []), ...(d.worldView.powerPlantHd?.overrides.values() ?? []), ...(d.worldView.napowrHd?.overrides.values() ?? [])].flatMap(p => p.pages ?? [p]).flatMap(p => [p.base, p.data]);
        window.__m15Renderer = d.renderer.renderer;
        window.__m15End = undefined;
        d.game.onEnd.subscribe(() => { window.__m15End = { tick: d.game.currentTick }; });
    });
    await step(`match-${country}`, await page.evaluate(() => {
        const d = window.__ra2debug, gl = d.renderer.renderer.getContext();
        return { conscript: d.conscriptHd, powerPlant: d.powerPlantHd, napowr: d.napowrHd, rhino: d.rhinoHd,
            players: d.game.getNonNeutralPlayers().map(p => ({ name: p.name, ai: p.isAi, country: p.country })),
            renderer: gl.getParameter(gl.RENDERER), multiDraw: !!gl.getExtension('WEBGL_multi_draw'),
            settings: d.generalOptions.graphics.serialize(), memory: d.renderer.renderer.info.memory };
    }));
}
async function deploy() {
    await page.evaluate(() => { const d = window.__ra2debug; d.actionsApi.orderUnits([d.localPlayer.getOwnedObjects().find(u => /MCV$/.test(u.name)).id], 10); });
    await page.waitForFunction(() => window.__ra2debug.localPlayer.getOwnedObjects().some(u => /[NG]ACNST/.test(u.name)), undefined, { timeout: 30000 });
}
async function build(name) {
    await page.evaluate(name => window.__ra2debug.actionsApi.queueForProduction(0, 2, name, 1), name);
    await page.waitForFunction(() => window.__ra2debug.localPlayer.production.getQueue(0).status === 3, undefined, { timeout: 120000 });
    const placed = await page.evaluate(name => {
        const d = window.__ra2debug, yard = d.localPlayer.getOwnedObjects().find(u => /[NG]ACNST/.test(u.name)), tiles = [];
        for (let x = -10; x <= 10; x++)
            for (let y = -10; y <= 10; y++)
                tiles.push({ rx: yard.tile.rx + x, ry: yard.tile.ry + y });
        tiles.sort((a, b) => Math.hypot(a.rx - yard.tile.rx, a.ry - yard.tile.ry) - Math.hypot(b.rx - yard.tile.rx, b.ry - yard.tile.ry));
        const tile = tiles.find(t => d.game.getConstructionWorker(d.localPlayer).canPlaceAt(name, t, { normalizedTile: true }));
        if (!tile)
            throw Error(`No legal foundation for ${name}`);
        d.actionsApi.placeBuilding(name, tile.rx, tile.ry);
        return { name, tile, tick: d.game.currentTick };
    }, name);
    await page.waitForFunction(name => window.__ra2debug.localPlayer.getOwnedObjects().some(u => u.name === name), name, { timeout: 20000 });
    await page.waitForTimeout(2200);
    if (name === 'GAPOWR' || name === 'NAPOWR') {
        placed.rendering = await page.evaluate(name => {
            const d = window.__ra2debug, u = d.localPlayer.getOwnedObjects().find(u => u.name === name);
            const r = d.renderableManager.getRenderableByGameObject(u);
            const parts = [r.mainObj, ...[...r.animObjects.values()].flat()].filter(p => p?.builder);
            return { id: u.id, owner: u.owner.color, parts: parts.map(p => ({
                    member: p.builder.shpFile?.filename, identity: p.builder.hdOverride?.identity,
                    frame: p.builder.frameNo, visible: p.get3DObject()?.visible,
                })) };
        }, name);
        assert(placed.rendering.parts.some(p => p.identity), 'Built power plant has no active HD override');
    }
    await step('build', placed);
}
async function produce(name, queue, type, count) {
    const before = await page.evaluate(name => window.__ra2debug.localPlayer.getOwnedObjects().filter(u => u.name === name).map(u => u.id), name);
    await page.evaluate(({ name, queue, type, count }) => window.__ra2debug.actionsApi.queueForProduction(queue, type, name, count), { name, queue, type, count });
    await page.waitForFunction(({ name, before, count }) => window.__ra2debug.localPlayer.getOwnedObjects().filter(u => u.name === name && !before.includes(u.id)).length >= count, { name, before, count }, { timeout: 120000 });
    await step('produce', { name, count });
}
async function cleanup() {
    return page.evaluate(() => {
        const pack = window.__m15Pack, renderer = window.__m15Renderer;
        return { gameCleared: !window.__ra2debug.game, texturesReleased: window.__m15Textures.every(t => !renderer.properties.get(t).__webglTexture),
            rhinoRefs: [...pack.parts.values()].map(p => p.refs), rhinoDisposed: [...pack.parts.values()].every(p => p.disposed),
            memory: renderer.info.memory, programs: renderer.info.programs.length };
    });
}
async function resultToMenu() {
    const continueLabel = await label('GUI:Continue');
    await page.getByText(continueLabel, { exact: true }).waitFor({ timeout: 45000 });
    await page.screenshot({ path: path.join(output, 'results.png') });
    report.resultText = await page.locator('body').innerText();
    await page.getByText(continueLabel, { exact: true }).click();
    await page.locator('input[name="gameSpeed"]').waitFor({ timeout: 30000 });
    await page.getByText(await label('GUI:Back'), { exact: true }).click();
    await page.getByText('Offline Skirmish', { exact: true }).waitFor();
    const row = await cleanup();
    await step('result-menu-cleanup', row);
    assert(row.gameCleared && row.texturesReleased && row.rhinoDisposed && row.rhinoRefs.every(n => n === 0));
}
async function abortToMenu() {
    const abort = await page.evaluate(() => { const d = window.__ra2debug; d.gameScreen.menu.open(); return d.gameScreen.strings.get('GUI:AbortMission'); });
    await page.getByText(abort, { exact: true }).click();
    await page.getByText(await page.evaluate(() => window.__ra2debug.gameScreen.strings.get('GUI:Quit')), { exact: true }).click();
    await resultToMenu();
}
try {
    await launch();
    report.runtime = await app.evaluate(({ app }) => ({ arch: process.arch, electron: process.versions.electron, appPath: app.getAppPath(), profile: app.getPath('userData'), packaged: app.isPackaged }));
    assert.equal(await page.evaluate(() => window.__ra2debug.generalOptions.graphics.serialize().split(',').slice(4).join(',')), '0,0,0,0');
    await hdMenu(true);
    report.saved = await page.evaluate(() => window.__ra2debug.generalOptions.graphics.serialize());
    await app.close();
    await launch();
    assert.equal(await page.evaluate(() => window.__ra2debug.generalOptions.graphics.serialize()), report.saved);
    await step('quit-relaunch-persistence', report.saved);
    await start(5);
    await deploy();
    if (!process.env.M16_REMAINING_ONLY) {
        await build('NAPOWR');
        report.storage = await page.evaluate(() => window.__m16Storage);
        assert(report.storage.filter(a => a[2] === 33323).length >= 6);
        report.reactor = await page.evaluate(() => {
            const d = window.__ra2debug, plant = d.localPlayer.getOwnedObjects().find(u => u.name === 'NAPOWR');
            window.__m16Plant = plant;
            window.__m16Trace = [];
            const listener = () => { if (!plant.isSpawned)
                return; const r = d.renderableManager.getRenderableByGameObject(plant); window.__m16Trace.push({ tick: d.game.currentTick, health: plant.healthTrait.health, body: r.mainObj.builder.getFrame(), active: r.animObjects.get(2)?.[0].builder.getFrame() }); };
            window.__m16Timer = setInterval(listener, 40);
            return { id: plant.id, tile: plant.tile, health: plant.rules.strength, playerPower: { power: d.localPlayer.powerTrait.power, drain: d.localPlayer.powerTrait.drain }, power: plant.rules.power, cost: plant.rules.cost, loaded: d.napowrHd,
                allocation: [...d.worldView.napowrHd.overrides.values()].flatMap(o => o.pages).map(p => ({ base: p.base.image.data.byteLength, data: p.data.image.data.byteLength, dataFormat: p.data.format, baseFormat: p.base.format, initialized: !!d.renderer.renderer.properties.get(p.data).__webglTexture })) };
        });
        assert.equal(report.reactor.loaded.density, 4);
        assert.equal(report.reactor.power, 150);
        assert.equal(report.reactor.cost, 600);
        assert.equal(report.reactor.allocation.reduce((n, p) => n + p.base + p.data, 0), 66712416);
        assert(report.reactor.allocation.every(p => p.initialized));
        await step('native-reactor-and-allocation', report.reactor);
        for (const name of ['NAHAND', 'NAREFN', 'NAWEAP'])
            await build(name);
        await produce('E2', 2, 3, 4);
        await produce('HTNK', 3, 7, 1);
        report.scene = await page.evaluate(() => { const d = window.__ra2debug; return d.localPlayer.getOwnedObjects().filter(u => ['E2', 'HTNK'].includes(u.name)).map(u => { const r = d.renderableManager.getRenderableByGameObject(u); return { name: u.name, hd: u.name === 'HTNK' ? r.rhinoHd?.active : !!r.shpRenderable?.builder?.hdOverride }; }); });
        assert(report.scene.some(u => u.name === 'E2' && u.hd) && report.scene.some(u => u.name === 'HTNK' && u.hd));
        await page.screenshot({ path: path.join(output, 'soviet-full-scene.png') });
        const { capture } = await import('./desktop-capture.mjs');
        await capture(page, output, report);
        await step('same-frame-native-comparison', { samples: report.samples.length });
        await page.evaluate(() => { const d = window.__ra2debug; d.actionsApi.orderUnits(d.localPlayer.getOwnedObjects().filter(u => u.name === 'HTNK').map(u => u.id), 3, window.__m16Plant.id); });
        await page.waitForFunction(() => window.__m16Plant.healthTrait.health < 49, undefined, { timeout: 90000 });
        await page.evaluate(() => { const d = window.__ra2debug; d.actionsApi.orderUnits(d.localPlayer.getOwnedObjects().filter(u => u.name === 'HTNK').map(u => u.id), 11); });
        report.damage = await page.evaluate(() => ({ health: window.__m16Plant.healthTrait.health, trace: window.__m16Trace.slice(-40) }));
        await page.screenshot({ path: path.join(output, 'natural-damage.png') });
        await page.evaluate(() => window.__ra2debug.actionsApi.toggleRepairWrench(window.__m16Plant.id));
        await page.waitForFunction(() => window.__m16Plant.healthTrait.health >= 100, undefined, { timeout: 90000 });
        await page.screenshot({ path: path.join(output, 'natural-repair.png') });
        await page.evaluate(() => window.__ra2debug.actionsApi.sellBuilding(window.__m16Plant.id));
        await page.waitForFunction(() => !window.__m16Plant.isSpawned, undefined, { timeout: 30000 });
        await step('natural-damage-repair-sale', { damage: report.damage.health, repaired: 100, sold: true });
        await build('NAPOWR');
        await page.evaluate(() => { const d = window.__ra2debug; window.__m16Plant = d.localPlayer.getOwnedObjects().find(u => u.name === 'NAPOWR'); d.actionsApi.orderUnits(d.localPlayer.getOwnedObjects().filter(u => u.name === 'HTNK').map(u => u.id), 3, window.__m16Plant.id); });
        await page.waitForFunction(() => !window.__m16Plant.isSpawned, undefined, { timeout: 90000 });
        await page.screenshot({ path: path.join(output, 'natural-destruction.png') });
        await step('natural-rebuild-destruction', { destroyed: true });
        await fs.writeFile(path.join(output, 'native-animation-trace.json'), JSON.stringify(await page.evaluate(() => { clearInterval(window.__m16Timer); return window.__m16Trace; })));
    }
    else {
        await build('NAPOWR');
    }
    await abortToMenu();
    await start(0);
    await deploy();
    await build('GAPOWR');
    await page.screenshot({ path: path.join(output, 'allied-regression.png') });
    await abortToMenu();
    await hdMenu(false);
    await start(5, 0);
    await deploy();
    // Same ordinary queue/placement path for the Original power control.
    await page.evaluate(() => window.__ra2debug.actionsApi.queueForProduction(0, 2, 'NAPOWR', 1));
    await page.waitForFunction(() => window.__ra2debug.localPlayer.production.getQueue(0).status === 3, undefined, { timeout: 90000 });
    report.original = await page.evaluate(() => { const d = window.__ra2debug; const rules = d.game.rules.getObject('NAPOWR', 2); return { loaded: d.napowrHd, power: rules.power, cost: rules.cost }; });
    assert.equal(report.original.loaded.density, 1);
    assert.equal(report.original.power, 150);
    assert.equal(report.original.cost, 600);
    report.status = 'PASS_DESKTOP_GAMEPLAY';
    await save();
}
catch (error) {
    process.exitCode = 1;
    report.status = 'FAIL';
    report.error = error.stack;
    report.lastState = await page?.evaluate(() => ({ tick: window.__ra2debug?.game?.currentTick, plant: { health: window.__m16Plant?.healthTrait.health, spawned: window.__m16Plant?.isSpawned } })).catch(() => undefined);
    console.error(error);
    await page?.screenshot({ path: path.join(output, 'failure.png') }).catch(() => { });
}
finally {
    await save();
    await app?.close();
    console.log('OUTPUT', output);
}
