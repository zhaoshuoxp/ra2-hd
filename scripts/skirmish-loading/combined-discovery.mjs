// Exercise the real copied launcher with no registration or resource overrides.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { _electron as electron } from '@playwright/test';

const receipt = JSON.parse(await fs.readFile(process.argv[2]));
const out = path.resolve(process.argv[3]);
await fs.mkdir(out, { recursive: false });
const env = { ...process.env };
for (const key of Object.keys(env)) if (key.startsWith('RA2_')) delete env[key];
assert(!await fs.stat(receipt.profile).catch(() => null), 'Discovery requires an unused portable profile');
const app = await electron.launch({ executablePath: receipt.launcher, args: [], cwd: '/private/tmp', env, timeout: 60000 });
const report = { status: 'RUNNING', app: receipt.app, launcher: receipt.launcher, errors: [] };
let failure;
try {
    const page = await app.firstWindow();
    page.on('pageerror', error => report.errors.push(error.stack));
    await page.locator('[data-edition=yr]').click({ timeout: 60000 });
    await page.waitForFunction(() => window.__ra2debug?.generalOptions && window.__ra2debug.uiArt?.revision);
    assert.equal(await app.evaluate(({ app }) => app.getPath('userData')), receipt.profile);
    report.menu = await page.evaluate(() => ({ ui: window.__ra2debug.uiArt.revision,
        entries: window.__ra2debug.uiArt.manifest.assets.length,
        density: window.__ra2debug.generalOptions.graphics.hdDensity.value }));
    assert.equal(report.menu.ui, receipt.uiRevision); assert.equal(report.menu.entries, receipt.uiEntries);
    const registration = JSON.parse(await fs.readFile(path.join(receipt.profile, 'resource-registration.json')));
    assert.equal(registration.directory, receipt.resources);
    await page.evaluate(() => {
        const d = window.__ra2debug;
        d.generalOptions.graphics.renderResolution.value = '1080p';
        for (const [key, value] of Object.entries({ _r_lastMap: 'XMP01T4.map', _r_lastMode: '1', _r_lastCountry: '9',
            _r_lastColor: '1', _r_lastStartPos: '0', _r_lastTeam: '0', _r_hostOpts: '6;10000;0;1;1;0;1;0;;0;1;0;0',
            _r_lastBots: JSON.stringify([null, null, null, { d: 4, c: 5, co: 2, s: 3, t: 1 }, null, null, null, null]) }))
            localStorage.setItem('_edition:yr:' + key, value);
    });
    const locale = JSON.parse(await fs.readFile('public/res/locale/zh-CN.json'));
    await page.getByRole('button', { name: new RegExp(`${locale['hd:menuskirmish']}|Skirmish`, 'i') }).click();
    await page.waitForFunction(() => window.__ra2debug.skirmishLobby);
    await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000000));
    await page.waitForFunction(() => window.__ra2debug.game?.status === 1, undefined, { timeout: 90000 });
    await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, player = d.localPlayer;
        for (const bot of g.botManager.bots.values()) bot.onGameTick = () => {};
        g.mapShroudTrait.revealMap(player, g);
        const mcv = player.getOwnedObjects().find(unit => unit.name === 'PCV');
        d.actionsApi.orderUnits([mcv.id], 10);
    });
    await page.waitForFunction(() => window.__ra2debug.localPlayer.getOwnedObjects().some(unit => unit.rules.constructionYard && unit.buildStatus === 1));
    await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, player = d.localPlayer, worker = g.getConstructionWorker(player);
        const yard = player.getOwnedObjects().find(unit => unit.rules.constructionYard), actors = [];
        const tiles = g.map.tiles.getAll().filter(tile => g.map.isWithinBounds(tile)).sort((a, b) =>
            Math.hypot(a.rx-yard.tile.rx,a.ry-yard.tile.ry) - Math.hypot(b.rx-yard.tile.rx,b.ry-yard.tile.ry));
        for (const name of ['YAPOWR', 'YAPOWR', 'YABRCK', 'GAAIRC', 'AMRADR', 'ATESLA']) {
            const tile = tiles.find(tile => worker.canPlaceAt(name, tile, { normalizedTile: true, ignoreAdjacent: true }));
            if (!tile) throw Error('No legal fixture foundation: ' + name);
            actors.push(...worker.placeAt(name, tile, true));
        }
        const rule = g.rules.getObject('E1', 3), tile = tiles.find(tile => !tile.rampType
            && g.map.terrain.getPassableSpeed(tile, rule.speedType, true, false) > 0
            && !g.map.getGroundObjectsOnTile(tile).some(object => object.isTechno() || object.isTerrain()));
        const gi = g.createUnitForPlayer(rule, player); g.spawnObject(gi, tile); actors.push(gi);
        window.__discoveryActors = actors;
        d.gameScreen.sidebarModel.updateAvailableObjects(g.art);
        d.helpers.getSidebarTechnoDebugStateByName('INIT');
    });
    await page.waitForFunction(() => {
        const d = window.__ra2debug, card = d.gameScreen.hud.sidebarCard;
        return window.__discoveryActors.every(unit => {
            const r = d.renderableManager.getRenderableByGameObject(unit);
            return unit.name === 'E1' ? r?.shpRenderable?.builder?.hdOverride : r?.mainObj?.builder?.hdOverride;
        }) && card.publishedItems.some((item, slot) => item.target.rules.name === 'INIT' && card.slotObjects[slot].isHdArtwork);
    });
    report.bindings = await page.evaluate(() => {
        const d = window.__ra2debug;
        return window.__discoveryActors.map(unit => {
            const r = d.renderableManager.getRenderableByGameObject(unit);
            return { name: unit.name, identity: (r.mainObj?.builder ?? r.shpRenderable?.builder).hdOverride.identity };
        });
    });
    report.click = await page.evaluate(() => {
        const d = window.__ra2debug, c = d.gameScreen.hud.sidebarCard;
        const slot = c.publishedItems.findIndex(item => item.target.rules.name === 'INIT');
        const handler = c.slotContainers[slot].eventHandlers.find(event => event.eventName === 'click').handler;
        const shown = c.publishedItems[slot].target.rules.name;
        c.props.sidebarModel.selectTab(1); // The visible item remains the click source until coherent publication.
        handler({ button: 0, isTouch: false });
        return { shown, publishedAfterSwitch: c.publishedItems[slot]?.target.rules.name,
            modelAfterSwitch: c.props.sidebarModel.activeTab.items[slot]?.target.rules.name };
    });
    assert.equal(report.click.shown, 'INIT');
    await page.waitForFunction(() => window.__ra2debug.localPlayer.production.getAllQueues()
        .some(queue => queue.getAll().some(item => item.rules.name === 'INIT')));
    report.click.queued = await page.evaluate(() => window.__ra2debug.localPlayer.production.getAllQueues()
        .flatMap(queue => queue.getAll().map(item => item.rules.name)));
    assert(report.click.queued.includes('INIT'));
    await page.screenshot({ path: path.join(out, 'copied-match.png') });
    assert.equal(report.errors.length, 0);
    report.status = 'PASS_COPIED_LAUNCHER_DISCOVERY_HD_BINDINGS_AND_VISIBLE_CLICK_TARGET';
} catch (error) { failure = error; report.status = 'FAIL'; report.failure = error.stack; }
finally { await app.close(); await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); }
if (failure) throw failure;
console.log(report.status);
