import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const artifact = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
const output = path.resolve(process.env.M15_OUTPUT ?? `.artifacts/m1-5/gameplay-${Date.now()}`);
await fs.mkdir(output, { recursive: true });
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
    page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(m.text()); });
    await page.getByText('Offline Skirmish', { exact: true }).waitFor({ timeout: 90000 });
}
async function label(key) {
    // End-of-game disposal precedes the next screen's controller installation.
    await page.waitForFunction(() => window.__ra2debug?.mainMenuController?.getCurrentScreen()?.strings,
        undefined, { timeout: 45000 });
    return page.evaluate(key => window.__ra2debug.mainMenuController.getCurrentScreen().strings.get(key), key);
}
async function hdMenu(enabled) {
    await page.getByText('Options', { exact: true }).click();
    for (const key of ['conscript', 'powerPlant', 'rhino']) {
        const row = page.locator(`[data-hd-family="${key}"]`);
        await row.locator('.select-value').click(); await row.getByText(enabled ? 'HD' : 'Original', { exact: true }).click();
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
    await page.getByText('Offline Skirmish', { exact: true }).click();
    await page.waitForFunction(() => window.__ra2debug?.skirmishLobby);
    await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000000));
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 90000 });
    await page.evaluate(() => {
        const d = window.__ra2debug;
        window.__m15Game = d.game; window.__m15Pack = d.worldView.rhinoHd;
        window.__m15Textures = [...(d.worldView.conscriptHd?.override?.pages ?? []), ...(d.worldView.powerPlantHd?.overrides.values() ?? [])].flatMap(p => p.pages ?? [p]).flatMap(p => [p.base, p.data]);
        window.__m15Renderer = d.renderer.renderer;
        window.__m15End = undefined;
        d.game.onEnd.subscribe(() => { window.__m15End = { tick: d.game.currentTick }; });
    });
    await step(`match-${country}`, await page.evaluate(() => {
        const d = window.__ra2debug, gl = d.renderer.renderer.getContext();
        return { conscript: d.conscriptHd, powerPlant: d.powerPlantHd, rhino: d.rhinoHd,
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
        for (let x = -10; x <= 10; x++) for (let y = -10; y <= 10; y++) tiles.push({ rx: yard.tile.rx + x, ry: yard.tile.ry + y });
        tiles.sort((a, b) => Math.hypot(a.rx - yard.tile.rx, a.ry - yard.tile.ry) - Math.hypot(b.rx - yard.tile.rx, b.ry - yard.tile.ry));
        const tile = tiles.find(t => d.game.getConstructionWorker(d.localPlayer).canPlaceAt(name, t, { normalizedTile: true }));
        if (!tile) throw Error(`No legal foundation for ${name}`);
        d.actionsApi.placeBuilding(name, tile.rx, tile.ry); return { name, tile, tick: d.game.currentTick };
    }, name);
    await page.waitForFunction(name => window.__ra2debug.localPlayer.getOwnedObjects().some(u => u.name === name), name, { timeout: 20000 });
    await page.waitForTimeout(2200);
    if (name === 'GAPOWR') {
        placed.rendering = await page.evaluate(() => {
            const d = window.__ra2debug, u = d.localPlayer.getOwnedObjects().find(u => u.name === 'GAPOWR');
            const r = d.renderableManager.getRenderableByGameObject(u);
            const parts = [r.mainObj, ...[...r.animObjects.values()].flat()].filter(p => p?.builder);
            return { id: u.id, owner: u.owner.color, parts: parts.map(p => ({
                member: p.builder.shpFile?.filename, identity: p.builder.hdOverride?.identity,
                frame: p.builder.frameNo, visible: p.get3DObject()?.visible,
            })) };
        });
        assert(placed.rendering.parts.some(p => p.identity), 'Built GAPOWR has no active HD override');
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
    const row = await cleanup(); await step('result-menu-cleanup', row);
    assert(row.gameCleared && row.texturesReleased && row.rhinoDisposed && row.rhinoRefs.every(n => n === 0));
}
try {
    await launch();
    report.scenario = 'Four-player normal skirmish: one human and three Normal AI on separate teams, native rules and starting forces';
    report.runtime = await app.evaluate(({ app }) => ({ arch: process.arch, electron: process.versions.electron, cwd: process.cwd(), appPath: app.getAppPath(), profile: app.getPath('userData'), packaged: app.isPackaged }));
    assert.equal(await page.evaluate(() => window.__ra2debug.generalOptions.graphics.serialize().split(',').slice(4).join(',')), '0,0,0');
    await hdMenu(true);
    report.saved = await page.evaluate(() => window.__ra2debug.generalOptions.graphics.serialize());
    await app.close(); await launch();
    assert.equal(await page.evaluate(() => window.__ra2debug.generalOptions.graphics.serialize()), report.saved);
    await step('quit-relaunch-persistence', report.saved);
    await start(5); await deploy();
    for (const name of ['NAPOWR', 'NAHAND', 'NAREFN', 'NAWEAP']) await build(name);
    await produce('E2', 2, 3, 4); await produce('HTNK', 3, 7, 1);
    await page.waitForTimeout(600);
    report.units = await page.evaluate(() => {
        const d = window.__ra2debug; window.__m15Units = d.localPlayer.getOwnedObjects().filter(u => ['HTNK', 'E2'].includes(u.name));
        window.__m15Trace = []; window.__m15Shots = []; window.__m15Sample = true;
        const ids = window.__m15Units.map(u => u.id);
        d.game.getWorld().onObjectSpawned.subscribe(o => { if (ids.includes(o.fromObject?.id)) window.__m15Shots.push({ tick: d.game.currentTick, source: o.fromObject.id, name: o.name }); });
        const sample = () => { if (!window.__m15Sample || !d.game) return;
            window.__m15Trace.push({ tick: d.game.currentTick, units: window.__m15Units.map(u => {
                const r = d.renderableManager.getRenderableByGameObject(u);
                return { id: u.id, name: u.name, moving: u.isMoving, firing: u.isFiring, destroyed: u.isDestroyed,
                    direction: u.direction, turret: u.turretTrait?.facing, hd: u.name === 'HTNK' ? r?.rhinoHd?.active : !!r?.shpRenderable?.builder?.hdOverride };
            }), gl: d.renderer.renderer.getContext().getError() }); requestAnimationFrame(sample);
        }; sample();
        return window.__m15Units.map(u => { const r = d.renderableManager.getRenderableByGameObject(u);
            return { id: u.id, name: u.name, owner: u.owner.color, builder: r.shpRenderable?.builder?.constructor.name,
                hd: u.name === 'HTNK' ? r.rhinoHd?.active : !!r.shpRenderable?.builder?.hdOverride,
                vxl: r.vxlBuilders?.map(b => b.constructor.name) };
        });
    });
    await step('effective-units', report.units);
    assert(report.units.some(u => u.name === 'HTNK'), 'Produced Rhino must survive to the sampled scene');
    assert(report.units.every(u => u.hd));
    await page.screenshot({ path: path.join(output, 'soviet-produced.png') });
    await page.evaluate(() => {
        const d = window.__ra2debug;
        window.__m15Target = (u, distance) => {
            const tiles = d.game.map.tiles.getAll().filter(t => Math.hypot(t.rx - u.tile.rx, t.ry - u.tile.ry) >= distance
                && Math.hypot(t.rx - u.tile.rx, t.ry - u.tile.ry) < distance + 1
                && d.game.map.mapBounds.isWithinBounds(t) && !t.rampType
                && d.game.map.terrain.getPassableSpeed(t, u.rules.speedType, false, false) > 0
                && !d.game.map.tileOccupation.getObjectsOnTile(t).length);
            return tiles[0];
        };
        for (const u of window.__m15Units) {
            const t = window.__m15Target(u, 2); if (t) d.actionsApi.orderUnits([u.id], 0, t.rx, t.ry);
        }
    });
    await page.waitForTimeout(5000);
    await page.evaluate(() => { const d = window.__ra2debug; for (const u of window.__m15Units) { d.actionsApi.orderUnits([u.id], 11); const t = window.__m15Target(u, 2); if (t) d.actionsApi.orderUnits([u.id], 3, t.rx, t.ry); } });
    await page.waitForTimeout(4500);
    await page.evaluate(() => { const d = window.__ra2debug; d.actionsApi.orderUnits(window.__m15Units.map(u => u.id), 11); });
    report.actions = await page.evaluate(() => ({ moving: window.__m15Trace.filter(t => t.units.some(u => u.moving)).length,
        firing: window.__m15Trace.filter(t => t.units.some(u => u.firing)).length, shots: window.__m15Shots,
        independent: window.__m15Trace.some(t => t.units.some(u => u.name === 'HTNK' && u.direction !== u.turret)), glErrors: window.__m15Trace.filter(t => t.gl) }));
    assert(report.actions.moving && report.actions.firing && report.actions.shots.length && report.actions.independent);
    assert.equal(report.actions.glErrors.length, 0); assert.deepEqual(report.consoleErrors, []); await step('movement-aim-firing', report.actions);
    if (process.env.M15_INPUT === '1') {
        const { checkDisplayAndInput } = await import('./input.mjs');
        report.input = await checkDisplayAndInput(app, page, output); await step('display-input', report.input);
    }
    await page.evaluate(() => { window.__m15Sample = false; });
    await fs.writeFile(path.join(output, 'unit-trace.json'), JSON.stringify(await page.evaluate(() => window.__m15Trace)));
    await step('waiting-natural-result');
    const deadline = Date.now() + 12 * 60 * 1000;
    while (Date.now() < deadline) {
        const state = await page.evaluate(() => ({ tick: window.__m15Game.currentTick, end: window.__m15End,
            objects: window.__m15Game.getNonNeutralPlayers().map(p => ({ ai: p.isAi, defeated: p.defeated, count: p.getOwnedObjects().length })) }));
        report.natural = state; await save(); if (state.end) break;
        await page.waitForTimeout(3000);
    }
    assert(report.natural.end, 'Natural result not reached'); await resultToMenu();
    await start(0); await deploy(); await build('GAPOWR');
    await page.screenshot({ path: path.join(output, 'allied-plant.png') });
    await build('GAPILE'); await produce('E1', 2, 3, 4);
    await page.evaluate(() => {
        const d = window.__ra2debug; window.__m15Plant = d.localPlayer.getOwnedObjects().find(u => u.name === 'GAPOWR');
        d.actionsApi.orderUnits(d.localPlayer.getOwnedObjects().filter(u => u.name === 'E1').map(u => u.id), 3, window.__m15Plant.id);
    });
    await page.waitForFunction(() => window.__m15Plant.healthTrait.health < .49, undefined, { timeout: 90000 });
    await page.evaluate(() => { const d = window.__ra2debug; d.actionsApi.orderUnits(d.localPlayer.getOwnedObjects().filter(u => u.name === 'E1').map(u => u.id), 11); });
    report.plantDamage = await page.evaluate(() => window.__m15Plant.healthTrait.health);
    await page.screenshot({ path: path.join(output, 'plant-damaged.png') });
    await page.evaluate(() => window.__ra2debug.actionsApi.toggleRepairWrench(window.__m15Plant.id));
    await page.waitForFunction(() => window.__m15Plant.healthTrait.health >= 1, undefined, { timeout: 90000 });
    await page.screenshot({ path: path.join(output, 'plant-repaired.png') });
    await page.evaluate(() => window.__ra2debug.actionsApi.sellBuilding(window.__m15Plant.id));
    await page.waitForFunction(() => !window.__m15Plant.isSpawned, undefined, { timeout: 30000 });
    await step('allied-damage-repair-sale', { damage: report.plantDamage, repaired: 1, sold: true });
    // Ordinary abort is allowed for the second match; the first already reached a natural result.
    const dmenu = await page.evaluate(() => { const d = window.__ra2debug; d.gameScreen.menu.open(); return { abort: d.gameScreen.strings.get('GUI:AbortMission') }; });
    await page.getByText(dmenu.abort, { exact: true }).click();
    const quit = await page.evaluate(() => window.__ra2debug.gameScreen.strings.get('GUI:Quit'));
    await page.getByText(quit, { exact: true }).click();
    const continueAfterQuit = await label('GUI:Continue');
    await page.getByText(continueAfterQuit, { exact: true }).click({ timeout: 30000 });
    await page.locator('input[name="gameSpeed"]').waitFor({ timeout: 30000 });
    await page.getByText(await label('GUI:Back'), { exact: true }).click();
    await page.getByText('Offline Skirmish', { exact: true }).waitFor();
    report.secondCleanup = await cleanup();
    assert(report.secondCleanup.gameCleared && report.secondCleanup.texturesReleased && report.secondCleanup.rhinoDisposed);
    await hdMenu(false);
    await start(5, 0);
    report.originalOnly = await page.evaluate(() => ({ conscript: window.__ra2debug.conscriptHd, powerPlant: window.__ra2debug.powerPlantHd,
        preference: window.__ra2debug.generalOptions.graphics.serialize(), memory: window.__ra2debug.renderer.renderer.info.memory }));
    assert.equal(report.originalOnly.conscript.density, 1); assert.equal(report.originalOnly.powerPlant.density, 1);
    report.status = 'PASS';
    await save();
} catch (error) { process.exitCode = 1; report.status = 'FAIL'; report.error = error.stack; console.error(error); await page?.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {}); }
finally { await save(); await app?.close(); console.log('OUTPUT', output); }
