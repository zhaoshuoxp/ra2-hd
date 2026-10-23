import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startSession } from '../m1/allied-units/desktop-session.mjs';

const [target, output] = process.argv.slice(2);
const initialDensity = process.argv.includes('--2x') ? 2 : 4;
const initialMap = process.argv.find(v => v.startsWith('--map='))?.slice(6) ?? 'xmp33u4.map';
const s = await startSession(target, output, 'yr', false, async ({ page }) => {
    await page.evaluate(density => {
        const g = window.__ra2debug.generalOptions.graphics;
        g.hdEnabled.value = true; g.hdDensity.value = density;
    }, initialDensity);
});
const { page, out } = s;
const report = { status: 'RUNNING', maps: [], releases: [],
    disclosure: 'Actual packaged Mac app, isolated profile. Native quit and menu routing between original official maps; real HD selector clicks. No artwork, map, camera or native rules changed.' };
const locale = JSON.parse(await fs.readFile('public/res/locale/zh-CN.json'));
const snapshots = async (map, density) => {
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1);
    const row = await page.evaluate(() => {
        const d = window.__ra2debug, t = d.mapRenderable.tileLayer.theater;
        clearInterval(window.__allied?.timer);
        for (const bot of d.game.botManager.bots.values()) bot.onGameTick = () => {};
        window.__previousWorld = { terrain: t.terrainHd, environment: t.environmentHd,
            demand: d.worldView.sovietUnitsHd,
            retention: [...t.terrainHd.textures, ...[...new Set(t.environmentHd.overrides.values())]
                .flatMap(o => o.pages.flatMap(p => [p.base, p.data, p.tiles?.map, p.tiles?.dataMap].filter(Boolean)))]
                .map(t => t.userData.hdSourceRetention).filter(Boolean) };
        const mcv = d.localPlayer.getOwnedObjects().find(o => /MCV$/.test(o.name));
        const r = d.renderableManager.getRenderableByGameObject(mcv);
        return { map: d.game.gameOpts.mapName, density: d.generalOptions.graphics.hdEnabled.value
            ? d.generalOptions.graphics.hdDensity.value : 1, tick: d.game.currentTick,
            terrain: structuredClone(d.terrainHd), environment: structuredClone(d.environmentHd),
            actor: structuredClone(d.sovietUnitsHd), mcvHd: !!r?.unitVxlHd?.active,
            glError: d.renderer.renderer.getContext().getError() };
    });
    assert.equal(row.map.toLowerCase(), map); assert.equal(row.density, density); assert.equal(row.glError, 0);
    if (density === 1) {
        assert.equal(row.terrain.gpuBytes, 0); assert.equal(row.environment.gpuBytes, 0);
        assert.equal(row.actor.gpuBytes, 0); assert(!row.mcvHd);
    } else {
        assert(row.mcvHd); assert(row.terrain.groups.every(g => g.status === 'PUBLISHED' && g.density === density));
        assert(Object.values(row.environment.families).every(f => f.density === density));
        assert.equal(row.actor.families.AMCV.density, density);
    }
    await page.waitForFunction(before => window.__ra2debug.game.currentTick >= before + 8, row.tick);
    await page.screenshot({ path: path.join(out, `${report.maps.length}-${map}-${density}x.png`) });
    report.maps.push(row);
    console.log(`Native lifecycle map: ${map}/${density}X`);
};
const next = async (map, density) => {
    const labels = await page.evaluate(() => {
        const d = window.__ra2debug; d.gameScreen.menu.open();
        return { abort: d.gameScreen.strings.get('GUI:AbortMission'), quit: d.gameScreen.strings.get('GUI:Quit') };
    });
    await page.getByText(labels.abort, { exact: true }).click();
    await page.getByText(labels.quit, { exact: true }).click();
    await page.waitForSelector('.score-scene', { timeout: 45000 });
    const released = await page.evaluate(() => ({ terrain: window.__previousWorld.terrain.report,
        environment: window.__previousWorld.environment.report,
        actorBytes: window.__previousWorld.demand.report.gpuBytes,
        backingDisposed: window.__previousWorld.retention.every(s => s.disposed) }));
    assert(released.terrain.disposed && released.environment.disposed && released.backingDisposed);
    assert.equal(released.terrain.worldChargeBytes, 0); assert.equal(released.environment.worldChargeBytes, 0);
    assert.equal(released.actorBytes, 0); report.releases.push(released);
    await page.evaluate(() => window.__ra2debug.mainMenuController.goToScreenBlocking(0));
    await page.waitForFunction(() => window.__ra2debug?.mainMenuController?.screens.has(16));
    await page.evaluate(() => window.__ra2debug.mainMenuController.pushScreen(16));
    const control = page.locator('[data-hd-family=all]');
    await control.locator('.select-value').click();
    await control.locator('.option').filter({ hasText: density === 1 ? /^原版$/ : new RegExp(`^${density}×$`) }).click();
    await page.evaluate(map => {
        localStorage.setItem('_edition:yr:_r_lastMap', map);
        return window.__ra2debug.mainMenuController.leaveCurrentScreen();
    }, map);
    await page.getByRole('button', { name: new RegExp(`${locale['hd:menuskirmish']}|Skirmish`, 'i') }).click();
    await page.waitForFunction(() => window.__ra2debug?.skirmishLobby);
    assert.equal((await page.evaluate(() => window.__ra2debug.skirmishLobby.gameOpts.mapName)).toLowerCase(), map);
    await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000001));
};
let failure;
try {
    await snapshots(initialMap, initialDensity);
    for (const [map, density] of [['dryheat.map', 4], ['dryheat.map', 1]]) {
        await next(map, density); await snapshots(map, density);
    }
    report.status = 'PASS_CROSS_THEATER_DENSITY_REENTRY_ORIGINAL_AND_COMPLETE_RELEASE';
} catch (error) {
    failure = error; report.status = 'FAIL'; report.failure = error.stack;
    await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    await fs.writeFile(path.join(out, 'lifecycle-report.json'), JSON.stringify(report, null, 2) + '\n');
    await s.app.close();
}
if (failure) throw failure;
